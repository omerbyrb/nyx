package main

import (
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// sshExec runs a command on a remote host via SSH password auth.
// Usage: ssh-exec <host:port> <user> <pass> <command>
func sshExec(host, user, pass, cmd string) (string, string) {
	if !strings.Contains(host, ":") {
		host = host + ":22"
	}
	config := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.Password(pass)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	client, err := ssh.Dial("tcp", host, config)
	if err != nil {
		return fmt.Sprintf("SSH dial failed: %v", err), "failed"
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return fmt.Sprintf("SSH session failed: %v", err), "failed"
	}
	defer session.Close()

	out, err := session.CombinedOutput(cmd)
	if err != nil {
		return fmt.Sprintf("Command error: %v\n%s", err, string(out)), "failed"
	}
	return fmt.Sprintf("[+] SSH exec on %s:\n%s", host, string(out)), "completed"
}

// sshKeyExec runs a command on a remote host using an SSH private key.
// Usage: ssh-key-exec <host:port> <user> <privkey_b64> <command>
func sshKeyExec(host, user, privKeyPEM, cmd string) (string, string) {
	if !strings.Contains(host, ":") {
		host = host + ":22"
	}
	signer, err := ssh.ParsePrivateKey([]byte(privKeyPEM))
	if err != nil {
		return "Failed to parse private key: " + err.Error(), "failed"
	}
	config := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	client, err := ssh.Dial("tcp", host, config)
	if err != nil {
		return fmt.Sprintf("SSH dial failed: %v", err), "failed"
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return fmt.Sprintf("SSH session failed: %v", err), "failed"
	}
	defer session.Close()

	out, err := session.CombinedOutput(cmd)
	if err != nil {
		return fmt.Sprintf("Command error: %v\n%s", err, string(out)), "failed"
	}
	return fmt.Sprintf("[+] SSH key exec on %s:\n%s", host, string(out)), "completed"
}

// portScan scans a host for open TCP ports.
// Usage: portscan <host> [ports]  — ports: "22,80,443" or "1-1024"
func portScan(host, portSpec string) (string, string) {
	if host == "" {
		return "usage: portscan <host> [ports]", "failed"
	}
	ports := parsePorts(portSpec)

	type result struct {
		port int
		open bool
	}
	results := make([]result, len(ports))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 200) // 200 concurrent conns

	for i, p := range ports {
		wg.Add(1)
		go func(idx, port int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			addr := fmt.Sprintf("%s:%d", host, port)
			conn, err := net.DialTimeout("tcp", addr, 800*time.Millisecond)
			if err == nil {
				conn.Close()
				results[idx] = result{port: port, open: true}
			} else {
				results[idx] = result{port: port, open: false}
			}
		}(i, p)
	}
	wg.Wait()

	var open []int
	for _, r := range results {
		if r.open {
			open = append(open, r.port)
		}
	}
	sort.Ints(open)

	if len(open) == 0 {
		return fmt.Sprintf("No open ports found on %s", host), "completed"
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Open ports on %s:\n", host))
	for _, p := range open {
		service := knownService(p)
		sb.WriteString(fmt.Sprintf("  %-6d/tcp  %s\n", p, service))
	}
	return sb.String(), "completed"
}

// hostDiscover pings a /24 CIDR range to find live hosts.
// Usage: hostscan <ip_prefix>  e.g. hostscan 192.168.1
func hostDiscover(prefix string) (string, string) {
	if prefix == "" {
		return "usage: hostscan <prefix>  e.g. hostscan 192.168.1", "failed"
	}
	prefix = strings.TrimSuffix(prefix, ".")
	var live []string
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 50)

	for i := 1; i < 255; i++ {
		host := fmt.Sprintf("%s.%d", prefix, i)
		wg.Add(1)
		go func(h string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			conn, err := net.DialTimeout("tcp", h+":22", 600*time.Millisecond)
			if err == nil {
				conn.Close()
				mu.Lock()
				live = append(live, h+" (ssh:22)")
				mu.Unlock()
				return
			}
			conn, err = net.DialTimeout("tcp", h+":80", 600*time.Millisecond)
			if err == nil {
				conn.Close()
				mu.Lock()
				live = append(live, h+" (http:80)")
				mu.Unlock()
			}
		}(host)
	}
	wg.Wait()
	sort.Strings(live)

	if len(live) == 0 {
		return fmt.Sprintf("No live hosts found in %s.0/24", prefix), "completed"
	}
	return fmt.Sprintf("Live hosts in %s.0/24:\n%s", prefix, strings.Join(live, "\n")), "completed"
}

func parsePorts(spec string) []int {
	if spec == "" {
		// Common ports
		return []int{21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 389,
			443, 445, 993, 995, 1433, 1521, 2049, 3306, 3389, 5432, 5900,
			6379, 8080, 8443, 8888, 9200, 27017}
	}
	var ports []int
	for _, part := range strings.Split(spec, ",") {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "-") {
			bounds := strings.SplitN(part, "-", 2)
			lo, _ := strconv.Atoi(bounds[0])
			hi, _ := strconv.Atoi(bounds[1])
			for p := lo; p <= hi; p++ {
				ports = append(ports, p)
			}
		} else {
			p, err := strconv.Atoi(part)
			if err == nil {
				ports = append(ports, p)
			}
		}
	}
	return ports
}

func knownService(port int) string {
	services := map[int]string{
		21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns",
		80: "http", 110: "pop3", 135: "msrpc", 139: "netbios", 143: "imap",
		389: "ldap", 443: "https", 445: "smb", 993: "imaps", 995: "pop3s",
		1433: "mssql", 1521: "oracle", 2049: "nfs", 3306: "mysql",
		3389: "rdp", 5432: "postgres", 5900: "vnc", 6379: "redis",
		8080: "http-alt", 8443: "https-alt", 9200: "elasticsearch", 27017: "mongodb",
	}
	if s, ok := services[port]; ok {
		return s
	}
	return "unknown"
}
