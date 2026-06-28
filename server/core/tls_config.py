import ssl
import os

CERT_FILE = os.path.join(os.path.dirname(__file__), "..", "cert.pem")
KEY_FILE  = os.path.join(os.path.dirname(__file__), "..", "key.pem")

def get_ssl_context() -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT_FILE, KEY_FILE)
    return ctx

def certs_exist() -> bool:
    return os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)
