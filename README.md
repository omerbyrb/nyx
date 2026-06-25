# Nyx C2

A modular, open-source Command & Control framework built for red team operations and adversary simulation. Designed to help security professionals understand attack infrastructure from the ground up.

> **For authorized security testing, CTF competitions, and educational use only.**

## Features

- **Async C2 Server** — FastAPI backend with task queue, agent management, and REST API
- **Cross-platform Agent** — Go agent compiles to a single binary for Linux, macOS, and Windows
- **Operator Dashboard** — Dark-themed React UI with live agent monitoring and interactive console
- **Built-in Commands** — `shell`, `sysinfo`, `ls`, `ps`, `whoami`, `env`, `pwd`

## Architecture

```
nyx/
├── server/       # Python FastAPI C2 server
├── agent/        # Go agent (cross-compiles to any platform)
├── dashboard/    # React + Tailwind operator UI
├── modules/      # Post-exploitation modules (WIP)
└── payloads/     # Payload builder (WIP)
```

## Quick Start

**Server**
```bash
cd server
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Dashboard**
```bash
cd dashboard
npm install && npm run dev
# Open http://localhost:5173
```

**Agent** (macOS/Linux)
```bash
cd agent
go build -o nyx-agent .
./nyx-agent
```

**Agent** (cross-compile to Windows)
```bash
GOOS=windows GOARCH=amd64 go build -o nyx-agent.exe .
```

## Roadmap

- [ ] HTTPS/TLS encrypted C2 channel
- [ ] DNS-over-HTTPS beacon
- [ ] Process injection module
- [ ] Credential harvesting module
- [ ] Lateral movement helpers
- [ ] Payload obfuscation & evasion
- [ ] IOC export & YARA rule generation
- [ ] Docker compose deployment
- [ ] WebSocket live task streaming

## Legal

This tool is intended for authorized penetration testing, red team exercises, CTF competitions, and security education. Unauthorized use against systems you do not have explicit permission to test is illegal. The author assumes no liability for misuse.
