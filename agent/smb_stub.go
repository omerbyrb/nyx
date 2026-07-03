//go:build !windows

package main

func smbExec(host, user, pass, localPayloadPath, remotePath string) (string, string) {
	return "smb-exec is Windows-only (uses net use + WMIC)", "failed"
}

func wmiExec(host, user, pass, cmd string) (string, string) {
	return "wmi-exec is Windows-only", "failed"
}

func psExec(host, user, pass, cmd string) (string, string) {
	return "psexec is Windows-only (requires WinRM)", "failed"
}

func dumpSAM() (string, string) {
	return "dump-sam is Windows-only", "failed"
}
