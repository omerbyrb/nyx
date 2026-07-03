from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from models.operator import Operator
from core.auth import hash_password, verify_token
from pydantic import BaseModel
from typing import Optional
from fastapi.security import OAuth2PasswordBearer

router = APIRouter(prefix="/api/admin", tags=["admin"])
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


def get_admin(token: str = Depends(oauth2), db: Session = Depends(get_db)):
    payload = verify_token(token)
    username = payload.get("sub")
    op = db.query(Operator).filter(Operator.username == username).first()
    if not op or op.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return op


class OperatorCreate(BaseModel):
    username: str
    password: str
    role: str = "operator"


class OperatorUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/operators")
def list_operators(db: Session = Depends(get_db), admin=Depends(get_admin)):
    ops = db.query(Operator).all()
    return [
        {
            "id": o.id,
            "username": o.username,
            "role": o.role,
            "is_active": o.is_active,
            "last_login": o.last_login.isoformat() + "Z" if o.last_login else None,
            "created_at": o.created_at.isoformat() + "Z" if o.created_at else None,
        }
        for o in ops
    ]


@router.post("/operators", status_code=201)
def create_operator(data: OperatorCreate, db: Session = Depends(get_db), admin=Depends(get_admin)):
    existing = db.query(Operator).filter(Operator.username == data.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")
    if data.role not in ("admin", "operator", "readonly"):
        raise HTTPException(status_code=400, detail="Invalid role")
    op = Operator(
        username=data.username,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return {"id": op.id, "username": op.username, "role": op.role}


@router.patch("/operators/{op_id}")
def update_operator(op_id: str, data: OperatorUpdate, db: Session = Depends(get_db), admin=Depends(get_admin)):
    op = db.query(Operator).filter(Operator.id == op_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    if data.password:
        op.password_hash = hash_password(data.password)
    if data.role is not None:
        if data.role not in ("admin", "operator", "readonly"):
            raise HTTPException(status_code=400, detail="Invalid role")
        op.role = data.role
    if data.is_active is not None:
        op.is_active = data.is_active
    db.commit()
    return {"status": "updated"}


@router.delete("/operators/{op_id}")
def delete_operator(op_id: str, db: Session = Depends(get_db), admin=Depends(get_admin)):
    op = db.query(Operator).filter(Operator.id == op_id).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    if op.username == "operator":
        raise HTTPException(status_code=400, detail="Cannot delete the default admin account")
    db.delete(op)
    db.commit()
    return {"status": "deleted"}


@router.get("/me")
def get_me(token: str = Depends(oauth2), db: Session = Depends(get_db)):
    """Return current operator info — available to all authenticated users."""
    payload = verify_token(token)
    username = payload.get("sub")
    op = db.query(Operator).filter(Operator.username == username).first()
    if not op:
        raise HTTPException(status_code=404, detail="Operator not found")
    return {
        "id": op.id,
        "username": op.username,
        "role": op.role,
        "is_active": op.is_active,
        "last_login": op.last_login.isoformat() + "Z" if op.last_login else None,
    }
