import { useEffect, useRef, useState } from "react";
import { getAgents, type Agent } from "../api/client";
import { Cpu, CheckCircle, AlertCircle, Radio } from "lucide-react";

function StatCard({ label, value, icon: Icon, accent, pale }: { label: string; value: number; icon: any; accent: string; pale: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(6px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = "none"; };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className="tilt-card bg-white rounded-2xl p-5 cursor-default"
      style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-nyx-muted font-medium" style={{ fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: pale }}>
          <Icon size={14} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-4xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", color: accent, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive = diffSec < 30;
  return (
    <tr className="border-b border-nyx-border transition-colors hover:bg-nyx-bg">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
            {alive && <div className="absolute inset-0 w-2 h-2 rounded-full bg-nyx-green animate-ping opacity-40" />}
          </div>
          <span className="text-nyx-text text-sm font-medium">{agent.hostname}</span>
        </div>
      </td>
      <td className="px-5 py-3.5 text-nyx-dim text-sm">{agent.username}</td>
      <td className="px-5 py-3.5">
        <span className="mono text-xs px-2.5 py-1 rounded-md font-medium" style={{ background: "#EEF1FB", color: "#1E3CB8", border: "1px solid rgba(30,60,184,0.15)" }}>
          {agent.os}/{agent.arch}
        </span>
      </td>
      <td className="px-5 py-3.5 mono text-nyx-dim text-sm">{agent.ip}</td>
      <td className="px-5 py-3.5">
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${alive ? "status-active" : "status-offline"}`}>
          {alive ? "active" : diffSec < 3600 ? `${Math.floor(diffSec/60)}m ago` : ">1h"}
        </span>
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  useEffect(() => {
    const load = () => getAgents().then(setAgents).catch(() => {});
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);
  const active = agents.filter(a => (Date.now() - new Date(a.last_seen + "Z").getTime()) / 1000 < 30).length;

  return (
    <div className="p-7 space-y-6 h-full overflow-y-auto bg-nyx-bg">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p className="text-nyx-muted text-sm mt-1">Active operations overview</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "#EDFAF4", border: "1px solid rgba(10,107,74,0.2)", color: "#0A6B4A" }}>
          <Radio size={11} /> Live
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Agents" value={agents.length} icon={Cpu}          accent="#1E3CB8" pale="#EEF1FB" />
        <StatCard label="Active Now"   value={active}        icon={CheckCircle}   accent="#0A6B4A" pale="#EDFAF4" />
        <StatCard label="Offline"      value={agents.length - active} icon={AlertCircle} accent="#8C95A8" pale="#F4F2EE" />
      </div>

      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="px-5 py-4 border-b border-nyx-border flex items-center justify-between">
          <span className="text-nyx-text text-sm font-semibold">Recent Agents</span>
          <span className="text-nyx-muted text-xs mono">{agents.length} total</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-nyx-border bg-nyx-bg">
              {["Hostname", "User", "Platform", "IP", "Status"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-nyx-muted font-semibold" style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.length === 0
              ? <tr><td colSpan={5} className="px-5 py-10 text-center text-nyx-muted text-sm">No agents connected</td></tr>
              : agents.map(a => <AgentRow key={a.id} agent={a} />)
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
