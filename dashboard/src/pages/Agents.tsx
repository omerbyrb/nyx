import { useEffect, useRef, useState } from "react";
import { getAgents, createTask, type Agent } from "../api/client";
import { RefreshCw, Terminal, Download, Shield, ShieldOff, Clock } from "lucide-react";

function AgentCard({ agent, onConsole }: { agent: Agent; onConsole: () => void }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive   = diffSec < 30;
  const ref     = useRef<HTMLDivElement>(null);
  const [action, setAction]     = useState<string | null>(null);
  const [downloadPath, setPath] = useState("");
  const [sleepVal, setSleep]    = useState(agent.sleep);
  const [feedback, setFeedback] = useState("");

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateZ(4px)`;
  };
  const handleMouseLeave = () => {
    if (ref.current) ref.current.style.transform = "perspective(700px) rotateY(0) rotateX(0) translateZ(0)";
  };

  const send = async (cmd: string) => {
    await createTask(agent.id, cmd);
    setFeedback("Task dispatched ✓");
    setTimeout(() => setFeedback(""), 2500);
    setAction(null);
  };

  const ActionBtn = ({ icon: Icon, label, onClick, danger }: any) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-all duration-150"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #1A2E4A", color: "#94A3B8" }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = danger ? "rgba(239,68,68,0.1)" : "rgba(37,99,235,0.12)";
        (e.currentTarget as HTMLElement).style.borderColor = danger ? "rgba(239,68,68,0.3)" : "rgba(37,99,235,0.3)";
        (e.currentTarget as HTMLElement).style.color = danger ? "#EF4444" : "#60A5FA";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = "#1A2E4A";
        (e.currentTarget as HTMLElement).style.color = "#94A3B8";
      }}
    >
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="tilt-card rounded-2xl p-5"
      style={{ background: "linear-gradient(135deg, #0C1525, #0F1C30)", border: "1px solid #1A2E4A" }}
    >
      {/* header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mono" style={{ background: alive ? "rgba(16,185,129,0.1)" : "rgba(71,85,105,0.1)", border: `1px solid ${alive ? "rgba(16,185,129,0.25)" : "rgba(71,85,105,0.2)"}`, color: alive ? "#10B981" : "#475569" }}>
              {agent.hostname[0].toUpperCase()}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-nyx-card ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
          </div>
          <div>
            <div className="text-nyx-cream font-semibold text-sm">{agent.hostname}</div>
            <div className="mono text-nyx-muted text-xs mt-0.5">{agent.id.slice(0, 18)}…</div>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${alive ? "status-active" : "status-offline"}`}>
          {alive ? "ACTIVE" : "OFFLINE"}
        </span>
      </div>

      {/* info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5">
        {[
          ["User",     agent.username],
          ["Platform", `${agent.os}/${agent.arch}`],
          ["IP",       agent.ip],
          ["Last Seen", diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec/60)}m ago`],
          ["Sleep",    `${agent.sleep}s ± ${agent.jitter}s`],
          ["Jitter",   agent.jitter + "s"],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-nyx-muted text-xs mb-0.5 uppercase" style={{ fontSize: "10px", letterSpacing: "0.08em" }}>{label}</div>
            <div className="text-nyx-dim text-sm mono">{value}</div>
          </div>
        ))}
      </div>

      {/* feedback */}
      {feedback && (
        <div className="mb-3 text-nyx-green text-xs px-3 py-2 rounded-lg mono" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          {feedback}
        </div>
      )}

      {/* inline action inputs */}
      {action === "download" && (
        <div className="mb-3 flex gap-2">
          <input value={downloadPath} onChange={e => setPath(e.target.value)} placeholder="/etc/passwd" className="input-base flex-1 rounded-xl px-3 py-2 text-xs mono" />
          <button onClick={() => send(`download ${downloadPath}`)} className="btn-primary px-3 py-2 rounded-xl text-xs">Get</button>
          <button onClick={() => setAction(null)} className="text-nyx-muted hover:text-nyx-text px-2 text-xs">✕</button>
        </div>
      )}
      {action === "sleep" && (
        <div className="mb-3 flex gap-2 items-center">
          <input type="number" value={sleepVal} onChange={e => setSleep(e.target.value)} className="input-base w-20 rounded-xl px-3 py-2 text-xs mono" />
          <span className="text-nyx-muted text-xs">seconds</span>
          <button onClick={async () => { await send(`sleep ${sleepVal}`); await fetch(`http://localhost:8000/api/agents/${agent.id}/sleep?sleep=${sleepVal}&jitter=1`, { method: "PATCH", headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` } }); }} className="btn-primary px-3 py-2 rounded-xl text-xs">Set</button>
          <button onClick={() => setAction(null)} className="text-nyx-muted hover:text-nyx-text px-2 text-xs">✕</button>
        </div>
      )}

      {/* action buttons */}
      <div className="flex gap-2 flex-wrap">
        <ActionBtn icon={Terminal}  label="Console"       onClick={onConsole} />
        <ActionBtn icon={Download}  label="Download File" onClick={() => setAction(action === "download" ? null : "download")} />
        <ActionBtn icon={Shield}    label="Persist"       onClick={() => send("persist")} />
        <ActionBtn icon={ShieldOff} label="Unpersist"     onClick={() => send("unpersist")} danger />
        <ActionBtn icon={Clock}     label="Sleep"         onClick={() => setAction(action === "sleep" ? null : "sleep")} />
      </div>
    </div>
  );
}

interface AgentsProps { onNavigateConsole?: () => void; }

export default function Agents({ onNavigateConsole }: AgentsProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => { setLoading(true); getAgents().then(setAgents).finally(() => setLoading(false)); };

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

  return (
    <div className="p-7 space-y-5 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-cream text-2xl font-bold tracking-tight" style={{ fontFamily: "Syne, sans-serif" }}>Agents</h1>
          <p className="text-nyx-muted text-sm mt-1">{agents.length} registered</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {agents.length === 0 && (
          <div className="col-span-2 rounded-2xl p-12 text-center text-nyx-muted text-sm" style={{ background: "linear-gradient(135deg, #0C1525, #0F1C30)", border: "1px solid #1A2E4A" }}>
            No agents connected. Deploy an agent to begin.
          </div>
        )}
        {agents.map(a => <AgentCard key={a.id} agent={a} onConsole={() => onNavigateConsole?.()} />)}
      </div>
    </div>
  );
}
