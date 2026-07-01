from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.database import get_db
from models.agent import Agent
from models.task import Task
from datetime import datetime, timezone
import json

router = APIRouter(prefix="/api/reports", tags=["reports"])

def _ts(dt) -> str:
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat() + "Z"
    return str(dt)


@router.get("/ioc")
def export_ioc(db: Session = Depends(get_db)):
    """Export full IOC report as structured JSON."""
    agents = db.query(Agent).all()
    tasks  = db.query(Task).all()

    ioc_agents = []
    for a in agents:
        agent_tasks = [t for t in tasks if t.agent_id == a.id]
        commands_run = [t.command for t in agent_tasks if t.status == "completed"]
        ioc_agents.append({
            "id": a.id,
            "hostname": a.hostname,
            "username": a.username,
            "os": a.os,
            "arch": a.arch,
            "ip": a.ip,
            "first_seen": _ts(a.created_at),
            "last_seen": _ts(a.last_seen),
            "beacon_sleep_sec": a.sleep,
            "jitter_sec": a.jitter,
            "is_active": a.is_active,
            "notes": getattr(a, "notes", "") or "",
            "tags": getattr(a, "tags", "") or "",
            "task_count": len(agent_tasks),
            "completed_tasks": len([t for t in agent_tasks if t.status == "completed"]),
            "commands_run": commands_run,
            "file_downloads": [
                t.command.replace("download ", "").strip()
                for t in agent_tasks
                if t.command.startswith("download") and t.status == "completed"
            ],
            "persistence_installed": any(
                t.command == "persist" and t.status == "completed" for t in agent_tasks
            ),
        })

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "framework": "Nyx C2",
        "version": "0.3.0",
        "summary": {
            "total_agents": len(agents),
            "active_agents": len([a for a in agents if a.is_active]),
            "total_tasks": len(tasks),
            "completed_tasks": len([t for t in tasks if t.status == "completed"]),
            "failed_tasks": len([t for t in tasks if t.status == "failed"]),
        },
        "indicators": {
            "ips": list({a.ip for a in agents}),
            "hostnames": list({a.hostname for a in agents}),
            "usernames": list({a.username for a in agents}),
            "os_list": list({a.os for a in agents}),
        },
        "agents": ioc_agents,
        "ttps": _build_ttps(tasks),
    }
    return report


@router.get("/yara")
def export_yara(db: Session = Depends(get_db)):
    """Generate a YARA rule targeting Nyx agent binary patterns."""
    agents = db.query(Agent).all()
    tasks  = db.query(Task).all()

    hostnames = list({a.hostname for a in agents})[:5]
    ips       = list({a.ip for a in agents})[:5]
    usernames = list({a.username for a in agents})[:5]

    hn_strings = "\n".join(
        f'        $hostname_{i} = "{h}" nocase' for i, h in enumerate(hostnames)
    )
    ip_strings = "\n".join(
        f'        $ip_{i} = "{ip}"' for i, ip in enumerate(ips)
    )

    rule = f"""// Nyx C2 — YARA Detection Rules
// Generated: {datetime.now(timezone.utc).isoformat()}
// Total agents tracked: {len(agents)}
// Total tasks executed: {len(tasks)}

rule Nyx_Agent_Binary {{
    meta:
        description = "Detects Nyx C2 Go agent binary"
        author      = "Nyx C2 IOC Export"
        date        = "{datetime.now(timezone.utc).date()}"
        severity    = "HIGH"
        reference   = "https://github.com/omerbyrb/nyx"

    strings:
        // Nyx-specific Go binary strings
        $nyx1 = "NYX-AGENT-CHECKIN" ascii
        $nyx2 = "SCREENSHOT:BASE64:" ascii
        $nyx3 = "NYX_PERSIST" ascii
        $nyx4 = "main.C2URL" ascii
        $nyx5 = "nyx-agent" ascii nocase

        // Beacon URL path patterns
        $beacon1 = "/api/agents/checkin" ascii
        $beacon2 = "/api/agents/" ascii
        $beacon3 = "/api/tasks/" ascii

        // Go runtime marker
        $go1 = "Go build ID:" ascii

    condition:
        uint32(0) == 0x464c457f or  // ELF
        uint16(0) == 0x5a4d         // PE (MZ)
        and 2 of ($nyx*) and 1 of ($beacon*)
}}

rule Nyx_C2_Network_Traffic {{
    meta:
        description = "Detects Nyx C2 HTTP beacon traffic"
        severity    = "HIGH"

    strings:
        $ua1 = "Go-http-client" ascii
        $path1 = "/api/agents/checkin" ascii
        $path2 = "/api/agents/" ascii
        $path3 = "/api/tasks/" ascii
        $json1 = "agent_id" ascii
        $json2 = "hostname" ascii
        $json3 = "beacon_sleep" ascii

    condition:
        2 of ($path*) and $json1 and ($json2 or $json3)
}}

rule Nyx_Persistence_LaunchAgent {{
    meta:
        description = "Detects Nyx C2 macOS LaunchAgent persistence"
        severity    = "MEDIUM"
        platform    = "macOS"

    strings:
        $plist1 = "com.apple.nyx.agent" ascii
        $plist2 = "nyx-agent" ascii nocase
        $plist3 = "RunAtLoad" ascii
        $plist4 = "KeepAlive" ascii

    condition:
        ($plist1 or $plist2) and $plist3 and $plist4
}}

rule Nyx_Persistence_Cron {{
    meta:
        description = "Detects Nyx C2 Linux cron persistence"
        severity    = "MEDIUM"
        platform    = "Linux"

    strings:
        $cron1 = "nyx-agent" ascii nocase
        $cron2 = "@reboot" ascii

    condition:
        all of them
}}

/*
 * Observed IOC Summary
 * ====================
 * Compromised hosts : {len(agents)}
 * Source IPs        : {", ".join(ips) if ips else "none"}
 * Affected users    : {", ".join(usernames) if usernames else "none"}
 * Tasks executed    : {len(tasks)}
 */
"""
    return {"yara": rule, "generated_at": datetime.now(timezone.utc).isoformat()}


def _build_ttps(tasks):
    """Map executed commands to MITRE ATT&CK TTPs."""
    ttp_map = {
        "sysinfo":     {"id": "T1082", "name": "System Information Discovery"},
        "whoami":      {"id": "T1033", "name": "System Owner/User Discovery"},
        "ps":          {"id": "T1057", "name": "Process Discovery"},
        "netstat":     {"id": "T1049", "name": "System Network Connections Discovery"},
        "ifconfig":    {"id": "T1016", "name": "System Network Configuration Discovery"},
        "ipconfig":    {"id": "T1016", "name": "System Network Configuration Discovery"},
        "env":         {"id": "T1552.007", "name": "Unsecured Credentials: Container API"},
        "download":    {"id": "T1041", "name": "Exfiltration Over C2 Channel"},
        "upload":      {"id": "T1105", "name": "Ingress Tool Transfer"},
        "screenshot":  {"id": "T1113", "name": "Screen Capture"},
        "persist":     {"id": "T1547", "name": "Boot or Logon Autostart Execution"},
        "unpersist":   {"id": "T1070", "name": "Indicator Removal"},
        "shell":       {"id": "T1059", "name": "Command and Scripting Interpreter"},
        "ls":          {"id": "T1083", "name": "File and Directory Discovery"},
        "cat":         {"id": "T1005", "name": "Data from Local System"},
        "kill":        {"id": "T1489", "name": "Service Stop"},
    }

    seen = {}
    for task in tasks:
        if task.status != "completed":
            continue
        cmd_base = task.command.split()[0].lower() if task.command else ""
        if cmd_base in ttp_map and cmd_base not in seen:
            seen[cmd_base] = ttp_map[cmd_base]

    return list(seen.values())
