import { useEffect, useState } from "react";
import { getAgents, type Agent } from "../api/client";
import { Cpu, CheckCircle, Clock, AlertCircle } from "lucide-react";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="bg-nyx-surface border border-nyx-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-nyx-muted text-xs uppercase tracking-widest">{label}</span>
        <Icon size={16} className={color} />
      </div>
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const lastSeen = new Date(agent.last_seen + "Z");
  const diffSec = Math.floor((Date.now() - lastSeen.getTime()) / 1000);
  const alive = diffSec < 30;

  return (
    <tr className="border-b border-nyx-border hover:bg-nyx-border/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
          <span className="text-nyx-text text-sm">{agent.hostname}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-nyx-muted text-sm">{agent.username}</td>
      <td className="px-4 py-3">
        <span className="bg-nyx-border text-nyx-text text-xs px-2 py-1 rounded">
          {agent.os}/{agent.arch}
        </span>
      </td>
      <td className="px-4 py-3 text-nyx-muted text-sm font-mono">{agent.ip}</td>
      <td className="px-4 py-3 text-nyx-muted text-xs">
        {diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec / 60)}m ago`}
      </td>
    </tr>
  );
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const load = () => getAgents().then(setAgents).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const active = agents.filter((a) => {
    const diff = (Date.now() - new Date(a.last_seen + "Z").getTime()) / 1000;
    return diff < 30;
  }).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-nyx-text text-xl font-semibold">Dashboard</h1>
        <p className="text-nyx-muted text-sm mt-1">Active operations overview</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Agents" value={agents.length} icon={Cpu} color="text-nyx-accent" />
        <StatCard label="Active" value={active} icon={CheckCircle} color="text-nyx-green" />
        <StatCard label="Offline" value={agents.length - active} icon={AlertCircle} color="text-nyx-muted" />
      </div>

      <div className="bg-nyx-surface border border-nyx-border rounded-lg">
        <div className="px-4 py-3 border-b border-nyx-border flex items-center gap-2">
          <Clock size={14} className="text-nyx-muted" />
          <span className="text-nyx-text text-sm font-medium">Recent Agents</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-nyx-border">
              {["Hostname", "User", "Platform", "IP", "Last Seen"].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-xs text-nyx-muted uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-nyx-muted text-sm">
                  No agents connected
                </td>
              </tr>
            ) : (
              agents.map((a) => <AgentRow key={a.id} agent={a} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
