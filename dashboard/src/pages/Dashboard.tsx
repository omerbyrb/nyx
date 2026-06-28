import { useEffect, useRef, useState } from "react";
import { getAgents, type Agent } from "../api/client";
import { Cpu, CheckCircle, AlertCircle, TrendingUp } from "lucide-react";

function StatCard({ label, value, icon: Icon, color, glow }: { label: string; value: number; icon: any; color: string; glow: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(6px)`;
  };
  const handleMouseLeave = () => {
    if (ref.current) ref.current.style.transform = "perspective(600px) rotateY(0deg) rotateX(0deg) translateZ(0)";
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="tilt-card rounded-2xl p-5 cursor-default"
      style={{ background: "linear-gradient(135deg, #0C1525, #0F1C30)", border: "1px solid #1A2E4A" }}
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-nyx-muted text-xs uppercase tracking-widest" style={{ letterSpacing: "0.1em", fontSize: "10px" }}>{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: glow }}>
          <Icon size={14} className={color} />
        </div>
      </div>
      <div className={`text-4xl font-bold tracking-tight ${color}`} style={{ fontFamily: "Syne, sans-serif" }}>{value}</div>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive = diffSec < 30;
  return (
    <tr className="border-b border-nyx-border/50 transition-colors hover:bg-nyx-accent/5">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
            {alive && <div className="absolute inset-0 w-2 h-2 rounded-full bg-nyx-green animate-ping opacity-50" />}
          </div>
          <span className="text-nyx-text text-sm font-medium">{agent.hostname}</span>
        </div>
      </td>
      <td className="px-5 py-3.5 text-nyx-dim text-sm">{agent.username}</td>
      <td className="px-5 py-3.5">
        <span className="mono text-xs px-2.5 py-1 rounded-md text-nyx-accent-light" style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)" }}>
          {agent.os}/{agent.arch}
        </span>
      </td>
      <td className="px-5 py-3.5 mono text-nyx-dim text-sm">{agent.ip}</td>
      <td className="px-5 py-3.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${alive ? "status-active" : "status-offline"}`}>
          {alive ? "active" : `${diffSec < 3600 ? Math.floor(diffSec/60)+"m" : ">1h"} ago`}
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
    <div className="p-7 space-y-6 h-full overflow-y-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-nyx-cream text-2xl font-bold tracking-tight" style={{ fontFamily: "Syne, sans-serif" }}>Dashboard</h1>
          <p className="text-nyx-muted text-sm mt-1">Active operations overview</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mono" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#10B981" }}>
          <TrendingUp size={11} /> Live
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Agents"  value={agents.length} icon={Cpu}          color="text-nyx-accent-light" glow="rgba(37,99,235,0.15)" />
        <StatCard label="Active Now"    value={active}        icon={CheckCircle}   color="text-nyx-green"        glow="rgba(16,185,129,0.15)" />
        <StatCard label="Offline"       value={agents.length - active} icon={AlertCircle} color="text-nyx-muted" glow="rgba(71,85,105,0.15)" />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0C1525, #0F1C30)", border: "1px solid #1A2E4A" }}>
        <div className="px-5 py-4 border-b border-nyx-border/50 flex items-center justify-between">
          <span className="text-nyx-text text-sm font-semibold">Recent Agents</span>
          <span className="text-nyx-muted text-xs mono">{agents.length} total</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-nyx-border/30">
              {["Hostname", "User", "Platform", "IP", "Status"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-nyx-muted uppercase" style={{ fontSize: "10px", letterSpacing: "0.1em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-nyx-muted text-sm">No agents connected</td></tr>
            ) : agents.map(a => <AgentRow key={a.id} agent={a} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
