package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"

	"golang.org/x/crypto/hkdf"
)

var ecdhPrivKey    *ecdh.PrivateKey
var ecdhPubHex     string // sent to server during first checkin
var ecdhDone       bool   // true once session key is derived

// initECDH generates an ephemeral P-256 key pair for this agent session.
func initECDH() error {
	priv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return fmt.Errorf("ECDH keygen: %w", err)
	}
	ecdhPrivKey = priv
	// Export uncompressed public key (65 bytes: 0x04 || X || Y)
	ecdhPubHex = hex.EncodeToString(priv.PublicKey().Bytes())
	return nil
}

// deriveSessionKey performs ECDH with the server's public key and initialises AES-GCM.
func deriveSessionKey(serverPubHex string) error {
	serverPubBytes, err := hex.DecodeString(serverPubHex)
	if err != nil {
		return fmt.Errorf("decode server pub: %w", err)
	}
	serverPub, err := ecdh.P256().NewPublicKey(serverPubBytes)
	if err != nil {
		return fmt.Errorf("parse server pub: %w", err)
	}
	shared, err := ecdhPrivKey.ECDH(serverPub)
	if err != nil {
		return fmt.Errorf("ECDH: %w", err)
	}

	// HKDF-SHA256 — same parameters as server-side ecdh_srv.py
	h := hkdf.New(sha256.New, shared, []byte("nyx-session-v1"), []byte("aes-256-gcm"))
	key := make([]byte, 32)
	if _, err = io.ReadFull(h, key); err != nil {
		return fmt.Errorf("HKDF: %w", err)
	}

	if err := initCryptoWithKey(key); err != nil {
		return fmt.Errorf("initCrypto: %w", err)
	}
	ecdhDone = true
	fmt.Println("[+] ECDH key exchange complete — per-agent AES-256-GCM active")
	return nil
}
