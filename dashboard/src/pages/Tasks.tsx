import { useEffect, useState } from "react";
import { getAgents, getAgentTasks, type Agent, type Task } from "../api/client";
import { CheckCircle, XCircle, Clock, Loader, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";

const STATUS_META: Record<string, { icon: any; color: string; bg: string; border: string }> = {
  completed: { icon: CheckCircle, color: "#10B981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)" },
  failed:    { icon: XCircle,     color: "#EF4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)" },
  pending:   { icon: Clock,       color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)" },
  running:   { icon: Loader,      color: "#60A5FA", bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)" },
};

function TaskRow({ task }: { task: Task & { hostname?: string } }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[task.status] ?? STATUS_META.pending;
  const Icon = meta.icon;
  const created = new Date(task.created_at + "Z").toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <tr
        className="border-b border-nyx-border/40 cursor-pointer transition-all duration-100 hover:bg-nyx-accent/4"
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-5 py-3.5 w-8">
          {open ? <ChevronDown size={13} className="text-nyx-muted" /> : <ChevronRight size={13} className="text-nyx-muted" />}
        </td>
        <td className="px-5 py-3.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
            <Icon size={11} className={task.status === "running" ? "animate-spin" : ""} />
            {task.status}
          </span>
        </td>
        <td className="px-5 py-3.5 mono text-nyx-text text-sm">{task.command}</td>
        <td className="px-5 py-3.5 text-nyx-dim text-sm">{task.hostname ?? task.agent_id.slice(0, 8)}</td>
        <td className="px-5 py-3.5 text-nyx-muted text-xs mono">{created}</td>
      </tr>
      {open && (
        <tr className="border-b border-nyx-border/40" style={{ background: "#060B18" }}>
          <td colSpan={5} className="px-8 py-4">
            <div className="rounded-xl p-4 mono text-xs leading-5 max-h-56 overflow-y-auto" style={{ background: "#0C1525", border: "1px solid #1A2E4A" }}>
              <pre className="whitespace-pre-wrap break-all" style={{ color: "#10B981" }}>
                {task.output || "(no output)"}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Tasks() {
  const [agents, setAgents]   = useState<Agent[]>([]);
  const [tasks, setTasks]     = useState<(Task & { hostname?: string })[]>([]);
  const [filter, setFilter]   = useState("all");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const agentList = await getAgents();
      setAgents(agentList);
      const all = await Promise.all(agentList.map(a => getAgentTasks(a.id).then(ts => ts.map(t => ({ ...t, hostname: a.hostname })))));
      setTasks(all.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? tasks : tasks.filter(t => filter === "pending" ? (t.status === "pending" || t.status === "running") : t.status === filter);

  const counts = {
    all:       tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    failed:    tasks.filter(t => t.status === "failed").length,
    pending:   tasks.filter(t => t.status === "pending" || t.status === "running").length,
  };

  const filters = [
    { key: "all",       label: "All",       color: "#60A5FA" },
    { key: "completed", label: "Completed", color: "#10B981" },
    { key: "failed",    label: "Failed",    color: "#EF4444" },
    { key: "pending",   label: "Pending",   color: "#F59E0B" },
  ];

  return (
    <div className="p-7 space-y-5 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-cream text-2xl font-bold tracking-tight" style={{ fontFamily: "Syne, sans-serif" }}>Tasks</h1>
          <p className="text-nyx-muted text-sm mt-1">{tasks.length} tasks across {agents.length} agents</p>
        </div>
        <button onClick={load} className="btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* filter tabs */}
      <div className="flex gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-150"
            style={filter === f.key
              ? { background: `${f.color}18`, border: `1px solid ${f.color}40`, color: f.color }
              : { background: "rgba(255,255,255,0.03)", border: "1px solid #1A2E4A", color: "#475569" }
            }
          >
            {f.label} <span className="ml-1 opacity-60">({counts[f.key as keyof typeof counts]})</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #0C1525, #0F1C30)", border: "1px solid #1A2E4A" }}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-nyx-border/50">
              <th className="w-8 px-5 py-3.5" />
              {["Status", "Command", "Agent", "Time"].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-nyx-muted uppercase" style={{ fontSize: "10px", letterSpacing: "0.1em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={5} className="px-5 py-12 text-center text-nyx-muted text-sm">No tasks found</td></tr>
              : filtered.map(t => <TaskRow key={t.id} task={t} />)
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
