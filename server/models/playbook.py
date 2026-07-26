import uuid
from sqlalchemy import Column, String, DateTime, Text, Boolean
from sqlalchemy.sql import func
from db.database import Base


class Playbook(Base):
    __tablename__ = "playbooks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    category = Column(String, default="recon")  # recon | privesc | creds | persist | lateral | container
    steps = Column(Text, default="[]")           # JSON: [{id, name, command, on_fail}]
    tags = Column(Text, default="[]")            # JSON: [str]
    built_in = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class PlaybookExecution(Base):
    __tablename__ = "playbook_executions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    playbook_id = Column(String, nullable=False)
    playbook_name = Column(String, default="")
    agent_id = Column(String, nullable=False)
    status = Column(String, default="running")  # running | completed | failed
    task_id = Column(String, nullable=True)
    started_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)
