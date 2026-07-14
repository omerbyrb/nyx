"""
Intelligence API — kill chain timeline, OPSEC scoring, GeoIP, plugin management.

Routes:
  GET  /api/intel/timeline              — all operation events, sorted chronologically
  GET  /api/intel/timeline/{agent_id}   — events for one agent
  GET  /api/intel/opsec                 — per-agent cumulative OPSEC scores
  GET  /api/intel/opsec/{agent_id}      — agent OPSEC breakdown
  GET  /api/intel/mitre                 — technique coverage heatmap
  GET  /api/intel/geo                   — agent geolocation list
  GET  /api/intel/plugins               — list loaded plugins
  POST /api/intel/plugins/reload        — reload plugins from disk
  POST /api/intel/opsec/check           — score a command before running it
"""

import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import get_current_operator
from core.mitre import get_technique, TECHNIQUES, tactic_order
from core.opsec import score_command, cumulative_score
from core.geoip import flag_emoji
from core import plugin_loader
from db.database import SessionLocal
from models.event import OperationEvent

try:
    from models.agent import Agent
    HAS_AGENT_MODEL = True
except ImportError:
    HAS_AGENT_MODEL = False

router = APIRouter(prefix="/api/intel", tags=["intelligence"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Timeline ──────────────────────────────────────────────────────────────────

@router.get("/timeline")
def get_timeline(
    limit: int = 200,
    agent_id: Optional[str] = None,
    tactic: Optional[str] = None,
    min_score: int = 0,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    q = db.query(OperationEvent)
    if agent_id:
        q = q.filter(OperationEvent.agent_id == agent_id)
    if tactic:
        q = q.filter(OperationEvent.mitre_tactic == tactic)
    if min_score > 0:
        q = q.filter(OperationEvent.opsec_score >= min_score)

    events = q.order_by(OperationEvent.timestamp.desc()).limit(limit).all()
    return [_event_dict(e) for e in events]


@router.get("/timeline/{agent_id}")
def get_agent_timeline(
    agent_id: str,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    events = (
        db.query(OperationEvent)
        .filter(OperationEvent.agent_id == agent_id)
        .order_by(OperationEvent.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [_event_dict(e) for e in events]


# ── OPSEC ─────────────────────────────────────────────────────────────────────

@router.get("/opsec")
def get_opsec_overview(db: Session = Depends(get_db), _: str = Depends(get_current_operator)):
    """Return cumulative OPSEC score per agent."""
    results = []
    if not HAS_AGENT_MODEL:
        return results

    agents = db.query(Agent).all()
    for agent in agents:
        scores = [
            e.opsec_score
            for e in db.query(OperationEvent.opsec_score)
                       .filter(OperationEvent.agent_id == agent.id)
                       .order_by(OperationEvent.timestamp.desc())
                       .limit(20)
                       .all()
            if e.opsec_score is not None
        ]
        cum = cumulative_score(list(reversed(scores)))
        high_risk = (
            db.query(OperationEvent)
            .filter(OperationEvent.agent_id == agent.id, OperationEvent.opsec_score >= 8)
            .order_by(OperationEvent.timestamp.desc())
            .limit(3)
            .all()
        )
        results.append({
            "agent_id":    agent.id,
            "hostname":    getattr(agent, "hostname", "?"),
            "username":    getattr(agent, "username", "?"),
            "cumulative":  cum,
            "event_count": len(scores),
            "high_risk":   [_event_dict(e) for e in high_risk],
        })

    return sorted(results, key=lambda r: r["cumulative"], reverse=True)


@router.get("/opsec/{agent_id}")
def get_agent_opsec(
    agent_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_operator),
):
    events = (
        db.query(OperationEvent)
        .filter(OperationEvent.agent_id == agent_id)
        .order_by(OperationEvent.timestamp.desc())
        .limit(50)
        .all()
    )
    scores = [e.opsec_score for e in events if e.opsec_score is not None]
    return {
        "agent_id":   agent_id,
        "cumulative": cumulative_score(list(reversed(scores))),
        "events":     [_event_dict(e) for e in events],
        "breakdown":  _opsec_breakdown(events),
    }


class CommandCheck(BaseModel):
    command: str


@router.post("/opsec/check")
def check_command_opsec(req: CommandCheck, _: str = Depends(get_current_operator)):
    """Score a command string before executing it."""
    opsec = score_command(req.command)
    mitre = get_technique(req.command)
    return {"opsec": opsec, "mitre": mitre}


# ── MITRE Heatmap ─────────────────────────────────────────────────────────────

@router.get("/mitre")
def get_mitre_coverage(db: Session = Depends(get_db), _: str = Depends(get_current_operator)):
    """Return ATT&CK technique usage counts for heatmap rendering."""
    events = db.query(OperationEvent).filter(OperationEvent.mitre_id != None).all()

    # Count per technique
    counts: dict[str, int] = {}
    for e in events:
        if e.mitre_id:
            counts[e.mitre_id] = counts.get(e.mitre_id, 0) + 1

    # Build response sorted by tactic order
    result = []
    seen_tactics: set = set()
    for tid, tech in TECHNIQUES.items():
        count = counts.get(tid, 0)
        result.append({
            "id":     tid,
            "name":   tech["name"],
            "tactic": tech["tactic"],
            "url":    tech["url"],
            "count":  count,
            "order":  tactic_order(tech["tactic"]),
        })
        seen_tactics.add(tech["tactic"])

    result.sort(key=lambda x: (x["order"], x["id"]))

    # Tactic summary
    tactic_counts: dict[str, int] = {}
    for e in events:
        if e.mitre_tactic:
            tactic_counts[e.mitre_tactic] = tactic_counts.get(e.mitre_tactic, 0) + 1

    return {
        "techniques":    result,
        "tactic_totals": tactic_counts,
        "total_events":  len(events),
    }


# ── Geolocation ───────────────────────────────────────────────────────────────

@router.get("/geo")
def get_geo(db: Session = Depends(get_db), _: str = Depends(get_current_operator)):
    if not HAS_AGENT_MODEL:
        return []
    agents = db.query(Agent).all()
    result = []
    for a in agents:
        result.append({
            "agent_id":     a.id,
            "hostname":     getattr(a, "hostname", "?"),
            "ip":           getattr(a, "ip", ""),
            "country":      getattr(a, "geo_country", ""),
            "country_code": getattr(a, "geo_country_code", ""),
            "city":         getattr(a, "geo_city", ""),
            "isp":          getattr(a, "geo_isp", ""),
            "lat":          getattr(a, "geo_lat", 0.0),
            "lon":          getattr(a, "geo_lon", 0.0),
            "flag":         flag_emoji(getattr(a, "geo_country_code", "")),
            "status":       getattr(a, "status", "unknown"),
        })
    return result


# ── Plugins ───────────────────────────────────────────────────────────────────

@router.get("/plugins")
def list_plugins(_: str = Depends(get_current_operator)):
    return {"plugins": plugin_loader.list_plugins()}


@router.post("/plugins/reload")
def reload_plugins(_: str = Depends(get_current_operator)):
    loaded = plugin_loader.reload_plugins()
    return {"loaded": loaded, "count": len(loaded)}


# ── Stats summary ─────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _: str = Depends(get_current_operator)):
    """Quick summary for the intelligence dashboard header."""
    total_events   = db.query(OperationEvent).count()
    high_risk_24h  = (
        db.query(OperationEvent)
        .filter(
            OperationEvent.opsec_score >= 8,
            OperationEvent.timestamp >= datetime.utcnow() - timedelta(hours=24),
        )
        .count()
    )
    tactics_used   = (
        db.query(OperationEvent.mitre_tactic)
        .filter(OperationEvent.mitre_tactic != None)
        .distinct()
        .count()
    )
    techniques_used = (
        db.query(OperationEvent.mitre_id)
        .filter(OperationEvent.mitre_id != None)
        .distinct()
        .count()
    )
    return {
        "total_events":    total_events,
        "high_risk_24h":   high_risk_24h,
        "tactics_used":    tactics_used,
        "techniques_used": techniques_used,
        "plugins_loaded":  len(plugin_loader.list_plugins()),
    }


# ── Event logging helper (called from tasks.py) ──────────────────────────────

def log_event(
    db: Session,
    agent_id: str,
    task_id: str,
    command: str,
    output: str,
    status: str,
):
    """Create an OperationEvent row. Called after every task result."""
    cmd_type = command.strip().split()[0].lower() if command.strip() else ""
    mitre    = get_technique(command)
    opsec    = score_command(command)

    event = OperationEvent(
        id            = secrets.token_hex(8),
        agent_id      = agent_id,
        task_id       = task_id,
        command       = command,
        command_type  = cmd_type,
        output_preview = output[:300] if output else "",
        status        = status,
        mitre_id      = mitre["id"]     if mitre else None,
        mitre_name    = mitre["name"]   if mitre else None,
        mitre_tactic  = mitre["tactic"] if mitre else None,
        mitre_url     = mitre["url"]    if mitre else None,
        opsec_score   = opsec["score"],
        opsec_label   = opsec["label"],
        opsec_notes   = opsec["notes"],
        opsec_color   = opsec["color"],
    )
    db.add(event)
    db.commit()

    # Fire plugin hooks
    plugin_loader.fire_event({
        "id":          event.id,
        "agent_id":    agent_id,
        "command":     command,
        "status":      status,
        "mitre":       mitre,
        "opsec_score": opsec["score"],
    })
    return event


# ── Helpers ───────────────────────────────────────────────────────────────────

def _event_dict(e: OperationEvent) -> dict:
    return {
        "id":             e.id,
        "timestamp":      e.timestamp.isoformat() if e.timestamp else None,
        "agent_id":       e.agent_id,
        "task_id":        e.task_id,
        "command":        e.command,
        "command_type":   e.command_type,
        "output_preview": e.output_preview,
        "status":         e.status,
        "mitre_id":       e.mitre_id,
        "mitre_name":     e.mitre_name,
        "mitre_tactic":   e.mitre_tactic,
        "mitre_url":      e.mitre_url,
        "opsec_score":    e.opsec_score,
        "opsec_label":    e.opsec_label,
        "opsec_notes":    e.opsec_notes,
        "opsec_color":    e.opsec_color,
    }


def _opsec_breakdown(events: list) -> dict:
    breakdown: dict[str, int] = {}
    for e in events:
        lbl = e.opsec_label or "Unknown"
        breakdown[lbl] = breakdown.get(lbl, 0) + 1
    return breakdown
