"""
Server-side ECDH key exchange for per-agent session keys.
Uses P-256 (NIST secp256r1) — same curve as Go's crypto/ecdh P256.
"""
import os
from cryptography.hazmat.primitives.asymmetric.ec import (
    generate_private_key, SECP256R1, ECDH, EllipticCurvePublicNumbers,
)
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend


def perform_ecdh(agent_pub_hex: str) -> tuple[bytes, str]:
    """
    Given agent's P-256 public key (uncompressed 65-byte hex from Go crypto/ecdh),
    generate a server ephemeral keypair, perform ECDH, derive AES-256 session key.

    Returns (session_key_bytes, server_pub_hex).
    """
    agent_pub_bytes = bytes.fromhex(agent_pub_hex)

    if len(agent_pub_bytes) != 65 or agent_pub_bytes[0] != 0x04:
        raise ValueError("Invalid agent public key: expected 65-byte uncompressed P-256 point")

    x = int.from_bytes(agent_pub_bytes[1:33], "big")
    y = int.from_bytes(agent_pub_bytes[33:65], "big")

    agent_pub = EllipticCurvePublicNumbers(x, y, SECP256R1()).public_key(default_backend())

    server_priv = generate_private_key(SECP256R1(), default_backend())
    shared = server_priv.exchange(ECDH(), agent_pub)

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"nyx-session-v1",
        info=b"aes-256-gcm",
        backend=default_backend(),
    )
    session_key = hkdf.derive(shared)

    pub_nums = server_priv.public_key().public_numbers()
    server_pub_bytes = (
        bytes([0x04])
        + pub_nums.x.to_bytes(32, "big")
        + pub_nums.y.to_bytes(32, "big")
    )

    return session_key, server_pub_bytes.hex()
