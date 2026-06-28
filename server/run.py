"""
Entry point — starts Nyx C2 server.
  python run.py           → HTTP  on :8000
  python run.py --tls     → HTTPS on :8443
"""
import argparse
import uvicorn
import os

def main():
    parser = argparse.ArgumentParser(description="Nyx C2 Server")
    parser.add_argument("--tls",  action="store_true", help="Enable HTTPS")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()

    if args.tls:
        port = args.port or 8443
        cert = os.path.join(os.path.dirname(__file__), "cert.pem")
        key  = os.path.join(os.path.dirname(__file__), "key.pem")
        print(f"[*] Starting Nyx C2 on https://{args.host}:{port}")
        uvicorn.run(
            "main:app",
            host=args.host,
            port=port,
            ssl_certfile=cert,
            ssl_keyfile=key,
            reload=False,
        )
    else:
        port = args.port or 8000
        print(f"[*] Starting Nyx C2 on http://{args.host}:{port}")
        uvicorn.run("main:app", host=args.host, port=port, reload=False)

if __name__ == "__main__":
    main()
