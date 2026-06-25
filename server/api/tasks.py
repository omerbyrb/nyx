from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from models.task import Task
from pydantic import BaseModel

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    agent_id: str
    command: str

@router.post("/")
def create_task(data: TaskCreate, db: Session = Depends(get_db)):
    task = Task(agent_id=data.agent_id, command=data.command)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

@router.get("/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
