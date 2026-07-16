from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.sql import func
from db.database import Base
import uuid


class PersistenceEntry(Base):
    __tablename__ = "persistence_entries"

    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id   = Column(String, nullable=False, index=True)
    mech_type  = Column(String, nullable=False)   # reg | svc | task | startup | wmi | launchagent | cron
    name       = Column(String, nullable=False)
    payload    = Column(Text, default="")
    trigger    = Column(String, default="")       # ONLOGON, ONSTART, etc.
    status     = Column(String, default="active") # active | removed
    created_at = Column(DateTime, server_default=func.now())
    removed_at = Column(DateTime, nullable=True)
