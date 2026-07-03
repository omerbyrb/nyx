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

// EncKey: 32-byte hex AES-256 key set at build time via
// -ldflags "-X main.EncKey=<64-char-hex>"
// When empty, traffic is sent plaintext (backward-compatible).
var EncKey = ""

var aesGCM cipher.AEAD

func initCrypto() error {
	if EncKey == "" {
		return nil
	}
	keyBytes, err := hex.DecodeString(EncKey)
	if err != nil || (len(keyBytes) != 16 && len(keyBytes) != 24 && len(keyBytes) != 32) {
		return fmt.Errorf("invalid EncKey: must be 32/48/64 hex chars (AES-128/192/256)")
	}
	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return err
	}
	aesGCM, err = cipher.NewGCM(block)
	return err
}

// encryptPayload encrypts plaintext with AES-256-GCM.
// Output: nonce (12 bytes) || ciphertext || tag (16 bytes), all hex-encoded.
func encryptPayload(plaintext []byte) ([]byte, error) {
	if aesGCM == nil {
		return plaintext, nil // no encryption configured
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ct := aesGCM.Seal(nonce, nonce, plaintext, nil)
	// Wrap in JSON envelope so server can detect encrypted payloads
	envelope := map[string]string{"enc": hex.EncodeToString(ct)}
	return json.Marshal(envelope)
}

// decryptPayload decrypts a server response if it contains an "enc" field.
func decryptPayload(data []byte) ([]byte, error) {
	if aesGCM == nil {
		return data, nil
	}
	var envelope struct {
		Enc string `json:"enc"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil || envelope.Enc == "" {
		return data, nil // not encrypted, pass through
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

// encPost is a drop-in for http.Client.Post that encrypts the body.
func encPost(url, contentType string, body []byte) (*http.Response, error) {
	encrypted, err := encryptPayload(body)
	if err != nil {
		return nil, fmt.Errorf("encrypt: %w", err)
	}
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(encrypted))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	if EncKey != "" {
		req.Header.Set("X-Nyx-Enc", "1")
	}
	return client.Do(req)
}

// readDecrypted reads and decrypts a response body.
func readDecrypted(resp *http.Response) ([]byte, error) {
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return decryptPayload(data)
}
