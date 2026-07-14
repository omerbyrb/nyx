"""
Example Nyx Plugin — High-OPSEC-Score Alerter

Logs a warning whenever an agent executes a command with OPSEC score >= 8.
Replace the logging calls with Slack/Discord webhooks, email, PagerDuty, etc.
"""

import logging

PLUGIN_NAME    = "example_alerter"
PLUGIN_VERSION = "1.0.0"

log = logging.getLogger("nyx.plugin.alerter")


def on_task_result(agent: dict, task: dict, result: dict):
    """Fires after every completed task."""
    opsec_score = result.get("opsec_score", 0)
    if opsec_score >= 8:
        log.warning(
            "[OPSEC ALERT] Agent %s (%s@%s) ran '%s' — score %d/10: %s",
            agent.get("id", "?")[:8],
            agent.get("username", "?"),
            agent.get("hostname", "?"),
            task.get("command", "?"),
            opsec_score,
            result.get("opsec_notes", ""),
        )


def on_agent_new(agent: dict):
    """Fires when an agent checks in for the first time."""
    log.info(
        "[NEW AGENT] %s@%s (%s/%s) from %s — %s %s",
        agent.get("username", "?"),
        agent.get("hostname", "?"),
        agent.get("os", "?"),
        agent.get("arch", "?"),
        agent.get("ip", "?"),
        agent.get("geo_country", ""),
        agent.get("geo_flag", ""),
    )
