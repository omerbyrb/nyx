from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from db.database import get_db
from models.operator import Operator
from core.auth import verify_password, hash_password, create_access_token
from datetime import datetime

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _ensure_default_admin(db: Session):
    """Create the default admin account on first boot if no operators exist."""
    if not db.query(Operator).first():
        admin = Operator(
            username="operator",
            password_hash=hash_password("nyx2024"),
            role="admin",
        )
        db.add(admin)
        db.commit()


@router.post("/token")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    _ensure_default_admin(db)
    op = db.query(Operator).filter(
        Operator.username == form.username,
        Operator.is_active == True,
    ).first()
    if not op or not verify_password(form.password, op.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    op.last_login = datetime.utcnow()
    db.commit()
    token = create_access_token({"sub": op.username, "role": op.role})
    return {"access_token": token, "token_type": "bearer", "role": op.role}
