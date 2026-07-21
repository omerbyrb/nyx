"""
OPSEC Scoring Engine — assigns a risk score (1–10) to each agent command.

Scoring factors:
  - Artifact risk: does the action write files, registry keys, services?
  - Visibility: does it touch EDR-monitored APIs or make unusual network traffic?
  - Noise: does it generate Event Log entries, WMI events, RPC traffic?
  - Reversibility: how easy is it to clean up after?

Score guide:
  1–2: Passive / read-only — minimal risk
  3–4: Low risk — standard recon
  5–6: Medium risk — network activity or minor system changes
  7–8: High risk — EDR-visible patterns or artifacts on disk
  9–10: Critical — near-certain detection by mature defenses
"""

from typing import Optional

# Per-command base scores
OPSEC_BASE_SCORES: dict[str, int] = {
    # Discovery — low risk
    "whoami":          2,
    "sysinfo":         2,
    "pwd":             1,
    "env":             1,
    "ls":              2,
    "cat":             2,
    "ps":              3,
    "netstat":         3,
    "ifconfig":        2,
    "ipconfig":        2,
    "arp":             2,

    # Network discovery — medium
    "portscan":        5,
    "hostscan":        5,

    # Shell execution — medium-high (cmd.exe/bash spawned)
    "shell":           6,

    # File operations — medium
    "download":        5,
    "upload":          4,
    "screenshot":      4,

    # Credential access — high
    "creds":           8,
    "dump-sam":        9,
    "kerb-roast":      7,
    "asrep-roast":     7,

    # Persistence — high (artifacts on disk / registry)
    "persist":         8,
    "unpersist":       4,

    # Process injection — critical
    "inject":          9,
    "shellcode":       9,
    "migrate":         9,
    "hollow":          9,
    "hollow-pe":       9,
    "refdll":          7,
    "bof":             7,

    # Token manipulation — high
    "token-steal":     8,
    "token-make":      7,
    "token-revert":    2,
    "token-spawn":     7,
    "token-list":      3,

    # Evasion patches — medium (patches memory, no disk artifacts)
    "evasion":                  6,
    "evasion syscalls-init":    8,   # extracts SSNs, prepares stubs — high evasion value
    "evasion unhook":           9,   # ntdll unhook removes EDR visibility
    "evasion unhook-all":       9,
    "evasion sandbox-check":    3,   # read-only heuristic check
    "evasion sandbox-stall":    3,
    "evasion api-hash":         2,

    # Privilege escalation check — medium
    "privesc":         4,

    # Lateral movement — high
    "smb-exec":        8,
    "wmi-exec":        8,
    "psexec":          9,
    "ssh-exec":        6,
    "ssh-key-exec":    6,

    # Pivot — medium-high
    "socks5-start":    6,
    "socks5-stop":     2,
    "pfwd-start":      5,
    "pfwd-stop":       2,
    "smb-pipe-listen": 5,
    "smb-pipe-connect":5,
    "dns-beacon-start":5,
    "dns-beacon-stop": 2,

    # External C2 — low OPSEC risk (uses legitimate cloud platforms)
    "extc2-github":    4,   # private gist; github.com TLS — hard to detect
    "extc2-telegram":  3,   # telegram API; fully encrypted, very common traffic
    "extc2-discord":   3,   # discord.com webhook; allowed by most firewalls
    "extc2-slack":     3,   # slack.com webhook; universally allowed
    "extc2-stop":      1,
    "extc2-status":    1,

    # Kill — low (cleanup)
    "kill":            1,
}

# Risk notes for high-scoring commands
OPSEC_NOTES: dict[str, str] = {
    "inject":          "Spawns remote thread — classic EDR trigger. Use BOF or hollow instead.",
    "shellcode":       "Raw shellcode execution — high EDR visibility. Consider BOF.",
    "hollow":          "Process hollowing detected by most EDR via memory scanning.",
    "hollow-pe":       "PE injection triggers memory-integrity checks on modern Windows.",
    "dump-sam":        "VSS/registry access is heavily monitored. Prefer in-memory approaches.",
    "psexec":          "Creates a service and writes binary to ADMIN$ — very noisy.",
    "smb-exec":        "ADMIN$ access + service creation triggers Windows Security events 7045/4697.",
    "wmi-exec":        "WMI process creation logged in Microsoft-Windows-WMI-Activity.",
    "persist":         "Run key / LaunchAgent / cron modification — baseline most SOCs watch.",
    "creds":           "Credential access from password stores triggers many AV heuristics.",
    "kerb-roast":      "RC4 TGS requests for non-interactive SPNs may trigger SIEM rules.",
    "asrep-roast":     "AS-REQ without pre-auth triggers Kerberos event 4768 with no-preauth flag.",
    "token-steal":     "OpenProcessToken on LSASS or privileged PID is commonly watched.",
    "shell":           "cmd.exe / /bin/sh is parent-child chain monitored by EDR.",
    "socks5-start":    "Listening port may be detected by host firewall or NDR.",
    "dns-beacon-start":"DNS TXT lookups for uncommon domains may trigger DNS analytics.",
    "migrate":         "Process migration injects current binary into another — highly suspicious.",
    "extc2-github":    "Calls api.github.com — very common, but gist token in memory is a credential risk.",
    "extc2-telegram":  "Polls api.telegram.org — extremely common traffic, low detection probability.",
}

DEFAULT_SCORE = 5
DEFAULT_NOTE  = "No specific OPSEC notes."


def score_command(command: str) -> dict:
    """Return OPSEC score + notes for a command string."""
    cmd = command.strip().split()[0].lower() if command.strip() else ""
    base = OPSEC_BASE_SCORES.get(cmd, DEFAULT_SCORE)
    note = OPSEC_NOTES.get(cmd, DEFAULT_NOTE)
    return {
        "score": base,
        "label": _label(base),
        "notes": note,
        "color": _color(base),
    }


def score_label(score: int) -> str:
    return _label(score)


def cumulative_score(scores: list[int]) -> int:
    """Weighted cumulative risk: recent actions weighted more heavily."""
    if not scores:
        return 0
    weighted = sum(s * (i + 1) for i, s in enumerate(scores[-10:]))
    total_weight = sum(range(1, min(len(scores), 10) + 1))
    if total_weight == 0:
        return 0
    return round(min(10, weighted / total_weight))


def _label(score: int) -> str:
    if score <= 2:
        return "Minimal"
    if score <= 4:
        return "Low"
    if score <= 6:
        return "Medium"
    if score <= 8:
        return "High"
    return "Critical"


def _color(score: int) -> str:
    if score <= 2:
        return "#0A6B4A"   # green
    if score <= 4:
        return "#6B8E23"   # olive
    if score <= 6:
        return "#D4A017"   # amber
    if score <= 8:
        return "#B82828"   # red
    return "#6B0000"       # dark red
