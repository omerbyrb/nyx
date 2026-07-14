from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey
from db.database import Base


class OperationEvent(Base):
    """
    Records every agent command execution with MITRE ATT&CK context and OPSEC score.
    Used for kill-chain timeline visualization and OPSEC reporting.
    """
    __tablename__ = "operation_events"

    id            = Column(String,  primary_key=True)
    timestamp     = Column(DateTime, default=datetime.utcnow, index=True)
    agent_id      = Column(String,  ForeignKey("agents.id"), index=True)
    task_id       = Column(String,  nullable=True)

    # Command info
    command       = Column(Text)
    command_type  = Column(String)  # first word
    output_preview = Column(Text)   # first 300 chars of output
    status        = Column(String)  # completed | failed

    # MITRE ATT&CK
    mitre_id      = Column(String)
    mitre_name    = Column(String)
    mitre_tactic  = Column(String)
    mitre_url     = Column(String)

    # OPSEC
    opsec_score   = Column(Integer)
    opsec_label   = Column(String)
    opsec_notes   = Column(Text)
    opsec_color   = Column(String)
