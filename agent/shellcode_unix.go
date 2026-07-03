//go:build linux || darwin

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

// allocExec maps RWX memory, copies shellcode, and returns the start address.
func allocExec(sc []byte) (uintptr, error) {
	// mmap(NULL, len, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_ANON, -1, 0)
	addr, _, errno := syscall.RawSyscall6(
		syscall.SYS_MMAP,
		0,
		uintptr(len(sc)),
		syscall.PROT_READ|syscall.PROT_WRITE|syscall.PROT_EXEC,
		syscall.MAP_PRIVATE|syscall.MAP_ANON,
		^uintptr(0), // fd = -1
		0,
	)
	if errno != 0 {
		return 0, fmt.Errorf("mmap: %w", errno)
	}
	// Copy shellcode into the mapped region
	dst := (*[1 << 30]byte)(unsafe.Pointer(addr))[:len(sc):len(sc)]
	copy(dst, sc)
	return addr, nil
}
