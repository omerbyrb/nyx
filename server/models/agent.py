from sqlalchemy import Column, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from db.database import Base
import uuid

class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    hostname = Column(String, nullable=False)
    username = Column(String, nullable=False)
    os = Column(String, nullable=False)
    arch = Column(String, nullable=False)
    ip = Column(String, nullable=False)
    sleep = Column(String, default="5")
    jitter = Column(String, default="1")
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime, server_default=func.now())
    notes = Column(Text, default="")
    tags = Column(String, default="")
    session_key = Column(String, default="")   # hex AES-256 key derived via ECDH
    profile = Column(String, default="default") # active C2 profile name
