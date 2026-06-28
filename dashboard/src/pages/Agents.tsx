import { useEffect, useRef, useState } from "react";
import { getAgents, createTask, type Agent } from "../api/client";
import { RefreshCw, Terminal, Download, Shield, ShieldOff, Clock } from "lucide-react";

function AgentCard({ agent, onConsole }: { agent: Agent; onConsole: () => void }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive   = diffSec < 30;
  const ref     = useRef<HTMLDivElement>(null);
  const [action, setAction]   = useState<string | null>(null);
  const [dlPath, setDlPath]   = useState("");
  const [sleepVal, setSleep]  = useState(agent.sleep);
  const [feedback, setFb]     = useState("");

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg) translateZ(4px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = "none"; };

  const send = async (cmd: string) => {
    await createTask(agent.id, cmd);
    setFb("Task dispatched ✓");
    setTimeout(() => setFb(""), 2500);
    setAction(null);
  };

  const ActionBtn = ({ icon: Icon, label, onClick, danger }: any) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-all duration-150"
      style={{ background: "#FFFFFF", border: "1px solid #E5DDD0", color: "#3D4559", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.background = danger ? "#FEF0F0" : "#EEF1FB"; el.style.borderColor = danger ? "rgba(184,40,40,0.2)" : "rgba(30,60,184,0.2)"; el.style.color = danger ? "#B82828" : "#1E3CB8"; }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.background = "#FFFFFF"; el.style.borderColor = "#E5DDD0"; el.style.color = "#3D4559"; }}
    >
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="tilt-card bg-white rounded-2xl p-5"
      style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mono"
              style={{ background: alive ? "#EDFAF4" : "#F4F2EE", border: `1px solid ${alive ? "rgba(10,107,74,0.2)" : "#E5DDD0"}`, color: alive ? "#0A6B4A" : "#8C95A8" }}>
              {agent.hostname[0].toUpperCase()}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
          </div>
          <div>
            <div className="text-nyx-text font-semibold text-sm">{agent.hostname}</div>
            <div className="mono text-nyx-muted text-xs mt-0.5">{agent.id.slice(0, 16)}…</div>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${alive ? "status-active" : "status-offline"}`}>
          {alive ? "ACTIVE" : "OFFLINE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5 p-4 rounded-xl" style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
        {[["User", agent.username], ["Platform", `${agent.os}/${agent.arch}`], ["IP", agent.ip], ["Last Seen", diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec/60)}m ago`], ["Sleep", `${agent.sleep}s ± ${agent.jitter}s`], ["Jitter", agent.jitter + "s"]].map(([label, value]) => (
          <div key={label}>
            <div className="text-nyx-muted font-semibold mb-0.5" style={{ fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
            <div className="text-nyx-dim text-sm mono">{value}</div>
          </div>
        ))}
      </div>

      {feedback && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg font-medium" style={{ background: "#EDFAF4", border: "1px solid rgba(10,107,74,0.2)", color: "#0A6B4A" }}>
          {feedback}
        </div>
      )}

      {action === "download" && (
        <div className="mb-3 flex gap-2">
          <input value={dlPath} onChange={e => setDlPath(e.target.value)} placeholder="/etc/passwd" className="input-base flex-1 rounded-xl px-3 py-2 text-xs mono" />
          <button onClick={() => send(`download ${dlPath}`)} className="btn-primary px-3 py-2 rounded-xl text-xs">Get</button>
          <button onClick={() => setAction(null)} className="text-nyx-muted px-2 text-xs hover:text-nyx-text">✕</button>
        </div>
      )}
      {action === "sleep" && (
        <div className="mb-3 flex gap-2 items-center">
          <input type="number" value={sleepVal} onChange={e => setSleep(e.target.value)} className="input-base w-20 rounded-xl px-3 py-2 text-xs mono" />
          <span className="text-nyx-muted text-xs">seconds</span>
          <button onClick={async () => { await send(`sleep ${sleepVal}`); await fetch(`http://localhost:8000/api/agents/${agent.id}/sleep?sleep=${sleepVal}&jitter=1`, { method: "PATCH", headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` } }); }} className="btn-primary px-3 py-2 rounded-xl text-xs">Set</button>
          <button onClick={() => setAction(null)} className="text-nyx-muted px-2 text-xs hover:text-nyx-text">✕</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <ActionBtn icon={Terminal}  label="Console"       onClick={onConsole} />
        <ActionBtn icon={Download}  label="Download"      onClick={() => setAction(action === "download" ? null : "download")} />
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
    <div className="p-7 space-y-5 h-full overflow-y-auto bg-nyx-bg">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Agents</h1>
          <p className="text-nyx-muted text-sm mt-1">{agents.length} registered</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {agents.length === 0 && (
          <div className="col-span-2 bg-white rounded-2xl p-12 text-center text-nyx-muted text-sm" style={{ border: "1px solid #E5DDD0" }}>
            No agents connected.
          </div>
        )}
        {agents.map(a => <AgentCard key={a.id} agent={a} onConsole={() => onNavigateConsole?.()} />)}
      </div>
    </div>
  );
}
