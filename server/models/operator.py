from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.sql import func
from db.database import Base
import uuid

class Operator(Base):
    __tablename__ = "operators"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="operator")  # "admin" | "operator" | "readonly"
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
