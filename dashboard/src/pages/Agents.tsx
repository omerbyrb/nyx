import { useEffect, useState } from "react";
import { getAgents, type Agent } from "../api/client";
import { RefreshCw } from "lucide-react";

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getAgents().then(setAgents).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-text text-xl font-semibold">Agents</h1>
          <p className="text-nyx-muted text-sm mt-1">{agents.length} registered</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-nyx-muted hover:text-nyx-text text-sm border border-nyx-border px-3 py-2 rounded transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="grid gap-3">
        {agents.length === 0 && (
          <div className="bg-nyx-surface border border-nyx-border rounded-lg p-8 text-center text-nyx-muted text-sm">
            No agents connected. Deploy an agent to begin.
          </div>
        )}
        {agents.map((agent) => {
          const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
          const alive = diffSec < 30;
          return (
            <div key={agent.id} className="bg-nyx-surface border border-nyx-border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full mt-0.5 ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
                  <div>
                    <div className="text-nyx-text font-medium">{agent.hostname}</div>
                    <div className="text-nyx-muted text-xs mt-0.5">{agent.id}</div>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${alive ? "bg-green-900/30 text-nyx-green" : "bg-nyx-border text-nyx-muted"}`}>
                  {alive ? "ACTIVE" : "OFFLINE"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3">
                {[
                  ["User", agent.username],
                  ["Platform", `${agent.os}/${agent.arch}`],
                  ["IP", agent.ip],
                  ["Last Seen", diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec / 60)}m ago`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="text-nyx-muted text-xs uppercase tracking-wider mb-1">{label}</div>
                    <div className="text-nyx-text text-sm font-mono">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
