"""
MITRE ATT&CK technique database and command-to-technique mapping for Nyx C2.
Each command executed by an agent is mapped to the closest ATT&CK (sub)technique.
"""

from typing import Optional

# ── Technique definitions ─────────────────────────────────────────────────────

TECHNIQUES: dict[str, dict] = {
    "T1059":     {"name": "Command and Scripting Interpreter", "tactic": "Execution",             "url": "https://attack.mitre.org/techniques/T1059/"},
    "T1059.001": {"name": "PowerShell",                        "tactic": "Execution",             "url": "https://attack.mitre.org/techniques/T1059/001/"},
    "T1059.003": {"name": "Windows Command Shell",             "tactic": "Execution",             "url": "https://attack.mitre.org/techniques/T1059/003/"},
    "T1059.004": {"name": "Unix Shell",                        "tactic": "Execution",             "url": "https://attack.mitre.org/techniques/T1059/004/"},
    "T1033":     {"name": "System Owner/User Discovery",       "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1033/"},
    "T1082":     {"name": "System Information Discovery",      "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1082/"},
    "T1057":     {"name": "Process Discovery",                 "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1057/"},
    "T1083":     {"name": "File and Directory Discovery",      "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1083/"},
    "T1049":     {"name": "System Network Connections Discovery","tactic": "Discovery",            "url": "https://attack.mitre.org/techniques/T1049/"},
    "T1016":     {"name": "System Network Configuration",      "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1016/"},
    "T1087":     {"name": "Account Discovery",                 "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1087/"},
    "T1040":     {"name": "Network Sniffing",                  "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1040/"},
    "T1046":     {"name": "Network Service Discovery",         "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1046/"},
    "T1135":     {"name": "Network Share Discovery",           "tactic": "Discovery",             "url": "https://attack.mitre.org/techniques/T1135/"},
    "T1555":     {"name": "Credentials from Password Stores",  "tactic": "Credential Access",    "url": "https://attack.mitre.org/techniques/T1555/"},
    "T1003":     {"name": "OS Credential Dumping",             "tactic": "Credential Access",    "url": "https://attack.mitre.org/techniques/T1003/"},
    "T1003.002": {"name": "Security Account Manager",          "tactic": "Credential Access",    "url": "https://attack.mitre.org/techniques/T1003/002/"},
    "T1558.003": {"name": "Kerberoasting",                     "tactic": "Credential Access",    "url": "https://attack.mitre.org/techniques/T1558/003/"},
    "T1558.004": {"name": "AS-REP Roasting",                   "tactic": "Credential Access",    "url": "https://attack.mitre.org/techniques/T1558/004/"},
    "T1041":     {"name": "Exfiltration Over C2 Channel",      "tactic": "Exfiltration",         "url": "https://attack.mitre.org/techniques/T1041/"},
    "T1560":     {"name": "Archive Collected Data",            "tactic": "Collection",           "url": "https://attack.mitre.org/techniques/T1560/"},
    "T1113":     {"name": "Screen Capture",                    "tactic": "Collection",           "url": "https://attack.mitre.org/techniques/T1113/"},
    "T1105":     {"name": "Ingress Tool Transfer",             "tactic": "Command and Control",  "url": "https://attack.mitre.org/techniques/T1105/"},
    "T1071.001": {"name": "Web Protocols",                     "tactic": "Command and Control",  "url": "https://attack.mitre.org/techniques/T1071/001/"},
    "T1071.004": {"name": "DNS",                               "tactic": "Command and Control",  "url": "https://attack.mitre.org/techniques/T1071/004/"},
    "T1090":     {"name": "Proxy",                             "tactic": "Command and Control",  "url": "https://attack.mitre.org/techniques/T1090/"},
    "T1090.003": {"name": "Multi-hop Proxy",                   "tactic": "Command and Control",  "url": "https://attack.mitre.org/techniques/T1090/003/"},
    "T1572":     {"name": "Protocol Tunneling",                "tactic": "Command and Control",  "url": "https://attack.mitre.org/techniques/T1572/"},
    "T1095":     {"name": "Non-Application Layer Protocol",    "tactic": "Command and Control",  "url": "https://attack.mitre.org/techniques/T1095/"},
    "T1547":     {"name": "Boot or Logon Autostart Execution", "tactic": "Persistence",          "url": "https://attack.mitre.org/techniques/T1547/"},
    "T1547.001": {"name": "Registry Run Keys",                 "tactic": "Persistence",          "url": "https://attack.mitre.org/techniques/T1547/001/"},
    "T1547.011": {"name": "Plist Modification",                "tactic": "Persistence",          "url": "https://attack.mitre.org/techniques/T1547/011/"},
    "T1053.003": {"name": "Cron",                              "tactic": "Persistence",          "url": "https://attack.mitre.org/techniques/T1053/003/"},
    "T1055":     {"name": "Process Injection",                 "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1055/"},
    "T1055.001": {"name": "DLL Injection",                     "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1055/001/"},
    "T1055.012": {"name": "Process Hollowing",                 "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1055/012/"},
    "T1620":     {"name": "Reflective Code Loading",           "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1620/"},
    "T1562.001": {"name": "Disable or Modify Tools (AMSI/ETW)","tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1562/001/"},
    "T1562.003": {"name": "Impair Command History Logging",    "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1562/003/"},
    "T1036":     {"name": "Masquerading (PPID Spoof)",         "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1036/"},
    "T1027":     {"name": "Obfuscated Files or Information",   "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1027/"},
    "T1027.007": {"name": "Dynamic API Resolution",            "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1027/007/"},
    "T1497":     {"name": "Virtualization/Sandbox Evasion",    "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1497/"},
    "T1497.001": {"name": "System Checks (Sandbox Detect)",    "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1497/001/"},
    "T1055.002": {"name": "Portable Executable Injection",     "tactic": "Defense Evasion",      "url": "https://attack.mitre.org/techniques/T1055/002/"},
    "T1106":     {"name": "Native API (Direct Syscall)",       "tactic": "Execution",            "url": "https://attack.mitre.org/techniques/T1106/"},
    "T1134":     {"name": "Access Token Manipulation",         "tactic": "Privilege Escalation", "url": "https://attack.mitre.org/techniques/T1134/"},
    "T1134.001": {"name": "Token Impersonation/Theft",         "tactic": "Privilege Escalation", "url": "https://attack.mitre.org/techniques/T1134/001/"},
    "T1134.003": {"name": "Make and Impersonate Token",        "tactic": "Privilege Escalation", "url": "https://attack.mitre.org/techniques/T1134/003/"},
    "T1068":     {"name": "Exploitation for Privilege Escalation","tactic": "Privilege Escalation","url": "https://attack.mitre.org/techniques/T1068/"},
    "T1021.002": {"name": "SMB/Windows Admin Shares",          "tactic": "Lateral Movement",     "url": "https://attack.mitre.org/techniques/T1021/002/"},
    "T1021.004": {"name": "SSH",                               "tactic": "Lateral Movement",     "url": "https://attack.mitre.org/techniques/T1021/004/"},
    "T1047":     {"name": "Windows Management Instrumentation", "tactic": "Lateral Movement",    "url": "https://attack.mitre.org/techniques/T1047/"},
    "T1569.002": {"name": "Service Execution (PsExec)",        "tactic": "Lateral Movement",     "url": "https://attack.mitre.org/techniques/T1569/002/"},
    "T1098":     {"name": "Account Manipulation",              "tactic": "Persistence",          "url": "https://attack.mitre.org/techniques/T1098/"},
    "T1222":     {"name": "File and Directory Permissions Modification","tactic": "Defense Evasion","url": "https://attack.mitre.org/techniques/T1222/"},
}

# ── Command → Technique mapping ───────────────────────────────────────────────

COMMAND_MAP: dict[str, str] = {
    "shell":           "T1059",
    "whoami":          "T1033",
    "sysinfo":         "T1082",
    "ps":              "T1057",
    "ls":              "T1083",
    "cat":             "T1083",
    "pwd":             "T1083",
    "env":             "T1082",
    "netstat":         "T1049",
    "ifconfig":        "T1016",
    "ipconfig":        "T1016",
    "arp":             "T1016",
    "hostscan":        "T1046",
    "portscan":        "T1046",
    "creds":           "T1555",
    "dump-sam":        "T1003.002",
    "kerb-roast":      "T1558.003",
    "asrep-roast":     "T1558.004",
    "download":        "T1041",
    "screenshot":      "T1113",
    "upload":          "T1105",
    "persist":         "T1547",
    "unpersist":       "T1547",
    "inject":          "T1055",
    "migrate":         "T1055",
    "shellcode":       "T1055",
    "hollow":          "T1055.012",
    "hollow-pe":       "T1055.012",
    "refdll":          "T1055.001",
    "bof":             "T1620",
    "token-steal":     "T1134.001",
    "token-make":      "T1134.003",
    "token-revert":    "T1134",
    "token-spawn":     "T1134",
    "token-list":      "T1087",
    "privesc":         "T1068",
    "evasion":              "T1562.001",
    "evasion syscalls-init":  "T1106",
    "evasion syscalls-status":"T1106",
    "evasion unhook":         "T1562.001",
    "evasion unhook-all":     "T1562.001",
    "evasion sandbox-check":  "T1497.001",
    "evasion sandbox-stall":  "T1497.001",
    "evasion api-hash":       "T1027.007",
    "smb-exec":        "T1021.002",
    "smb-pipe-listen": "T1095",
    "smb-pipe-connect":"T1095",
    "wmi-exec":        "T1047",
    "psexec":          "T1569.002",
    "ssh-exec":        "T1021.004",
    "ssh-key-exec":    "T1021.004",
    "socks5-start":    "T1090.003",
    "pfwd-start":      "T1572",
    "dns-beacon-start":"T1071.004",
}

# ── Tactic ordering (kill chain order) ───────────────────────────────────────

TACTIC_ORDER = [
    "Reconnaissance",
    "Resource Development",
    "Initial Access",
    "Execution",
    "Persistence",
    "Privilege Escalation",
    "Defense Evasion",
    "Credential Access",
    "Discovery",
    "Lateral Movement",
    "Collection",
    "Command and Control",
    "Exfiltration",
    "Impact",
]


def get_technique(command: str) -> Optional[dict]:
    """Return ATT&CK technique info for the first word of a command."""
    cmd = command.strip().split()[0].lower() if command.strip() else ""
    technique_id = COMMAND_MAP.get(cmd)
    if not technique_id:
        return None
    tech = TECHNIQUES.get(technique_id, {})
    return {
        "id":     technique_id,
        "name":   tech.get("name", "Unknown"),
        "tactic": tech.get("tactic", "Unknown"),
        "url":    tech.get("url", ""),
    }


def tactic_order(tactic: str) -> int:
    """Return numeric kill-chain order for sorting."""
    try:
        return TACTIC_ORDER.index(tactic)
    except ValueError:
        return 99
