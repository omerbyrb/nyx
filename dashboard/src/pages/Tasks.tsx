import { useEffect, useState } from "react";
import { getAgents, getAgentTasks, type Agent, type Task } from "../api/client";
import { CheckCircle, XCircle, Clock, Loader, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

const STATUS_ICON = {
  completed: <CheckCircle size={14} className="text-nyx-green" />,
  failed:    <XCircle size={14} className="text-nyx-red" />,
  pending:   <Clock size={14} className="text-nyx-yellow" />,
  running:   <Loader size={14} className="text-nyx-accent animate-spin" />,
};

const STATUS_COLOR: Record<string, string> = {
  completed: "text-nyx-green",
  failed:    "text-nyx-red",
  pending:   "text-nyx-yellow",
  running:   "text-nyx-accent",
};

function TaskRow({ task }: { task: Task & { hostname?: string } }) {
  const [open, setOpen] = useState(false);
  const created = new Date(task.created_at + "Z").toLocaleString();

  return (
    <>
      <tr
        className="border-b border-nyx-border hover:bg-nyx-border/20 cursor-pointer transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <td className="px-4 py-3 w-6">
          {open ? <ChevronDown size={14} className="text-nyx-muted" /> : <ChevronRight size={14} className="text-nyx-muted" />}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {STATUS_ICON[task.status] ?? STATUS_ICON.pending}
            <span className={`text-xs font-medium uppercase ${STATUS_COLOR[task.status]}`}>{task.status}</span>
          </div>
        </td>
        <td className="px-4 py-3 font-mono text-nyx-text text-sm">{task.command}</td>
        <td className="px-4 py-3 text-nyx-muted text-xs">{task.hostname ?? task.agent_id.slice(0, 8)}</td>
        <td className="px-4 py-3 text-nyx-muted text-xs">{created}</td>
      </tr>
      {open && (
        <tr className="border-b border-nyx-border bg-nyx-bg">
          <td colSpan={5} className="px-8 py-4">
            <pre className="text-nyx-green text-xs font-mono whitespace-pre-wrap break-all leading-5 max-h-64 overflow-y-auto">
              {task.output || "(no output)"}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Tasks() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<(Task & { hostname?: string })[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const agentList = await getAgents();
      setAgents(agentList);
      const all = await Promise.all(
        agentList.map((a) =>
          getAgentTasks(a.id).then((ts) => ts.map((t) => ({ ...t, hostname: a.hostname })))
        )
      );
      const flat = all.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTasks(flat);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const counts = {
    all: tasks.length,
    completed: tasks.filter((t) => t.status === "completed").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    pending: tasks.filter((t) => t.status === "pending" || t.status === "running").length,
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-text text-xl font-semibold">Tasks</h1>
          <p className="text-nyx-muted text-sm mt-1">{tasks.length} total tasks across {agents.length} agents</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-nyx-muted hover:text-nyx-text text-sm border border-nyx-border px-3 py-2 rounded transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="flex gap-2">
        {(["all", "completed", "failed", "pending"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filter === s
                ? "bg-nyx-accent text-white"
                : "bg-nyx-surface border border-nyx-border text-nyx-muted hover:text-nyx-text"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} ({counts[s]})
          </button>
        ))}
      </div>

      <div className="bg-nyx-surface border border-nyx-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-nyx-border">
              <th className="w-6 px-4 py-3" />
              {["Status", "Command", "Agent", "Time"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs text-nyx-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-nyx-muted text-sm">No tasks found</td>
              </tr>
            ) : (
              filtered.map((t) => <TaskRow key={t.id} task={t} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
