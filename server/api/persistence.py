"""
Persistence API — track per-agent persistence mechanisms.

Routes:
  GET  /api/persistence               — all entries (optionally filter by agent_id)
  GET  /api/persistence/{agent_id}    — entries for one agent
  POST /api/persistence               — record a new persistence mechanism
  DELETE /api/persistence/{id}        — mark an entry as removed
  GET  /api/persistence/summary       — count by mechanism type
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_operator
from db.database import SessionLocal
from models.persistence import PersistenceEntry

router = APIRouter(prefix="/api/persistence", tags=["persistence"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _entry_dict(e: PersistenceEntry) -> dict:
    return {
        "id":         e.id,
        "agent_id":   e.agent_id,
        "mech_type":  e.mech_type,
        "name":       e.name,
        "payload":    e.payload,
        "trigger":    e.trigger,
        "status":     e.status,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "removed_at": e.removed_at.isoformat() if e.removed_at else None,
    }


@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    entries = db.query(PersistenceEntry).filter(PersistenceEntry.status == "active").all()
    by_type: dict[str, int] = {}
    by_agent: dict[str, int] = {}
    for e in entries:
        by_type[e.mech_type]  = by_type.get(e.mech_type, 0) + 1
        by_agent[e.agent_id]  = by_agent.get(e.agent_id, 0) + 1
    return {
        "total_active": len(entries),
        "by_type":      by_type,
        "by_agent":     by_agent,
    }


@router.get("/")
def list_entries(
    agent_id: Optional[str] = None,
    mech_type: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    q = db.query(PersistenceEntry)
    if agent_id:
        q = q.filter(PersistenceEntry.agent_id == agent_id)
    if mech_type:
        q = q.filter(PersistenceEntry.mech_type == mech_type)
    if status:
        q = q.filter(PersistenceEntry.status == status)
    entries = q.order_by(PersistenceEntry.created_at.desc()).all()
    return [_entry_dict(e) for e in entries]


@router.get("/{agent_id}")
def get_agent_persistence(
    agent_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    entries = (
        db.query(PersistenceEntry)
        .filter(PersistenceEntry.agent_id == agent_id)
        .order_by(PersistenceEntry.created_at.desc())
        .all()
    )
    return [_entry_dict(e) for e in entries]


class PersistenceCreate(BaseModel):
    agent_id:  str
    mech_type: str
    name:      str
    payload:   str = ""
    trigger:   str = ""


@router.post("/")
def create_entry(
    data: PersistenceCreate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    entry = PersistenceEntry(
        agent_id  = data.agent_id,
        mech_type = data.mech_type,
        name      = data.name,
        payload   = data.payload,
        trigger   = data.trigger,
        status    = "active",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_dict(entry)


@router.delete("/{entry_id}")
def remove_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    entry = db.query(PersistenceEntry).filter(PersistenceEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.status     = "removed"
    entry.removed_at = datetime.utcnow()
    db.commit()
    return {"status": "removed", "id": entry_id}
