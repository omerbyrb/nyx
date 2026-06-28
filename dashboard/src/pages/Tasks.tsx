import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgents, getAgentTasks, type Agent, type Task } from "../api/client";
import { CheckCircle, XCircle, Clock, Loader, ChevronRight, RefreshCw } from "lucide-react";

const STATUS_META: Record<string, { icon: any; color: string; bg: string; border: string; spin?: boolean }> = {
  completed: { icon: CheckCircle, color: "#0A6B4A", bg: "#EDFAF4", border: "rgba(10,107,74,0.2)" },
  failed:    { icon: XCircle,     color: "#B82828", bg: "#FEF0F0", border: "rgba(184,40,40,0.2)" },
  pending:   { icon: Clock,       color: "#A85F0A", bg: "#FEF7EC", border: "rgba(168,95,10,0.2)" },
  running:   { icon: Loader,      color: "#1E3CB8", bg: "#EEF1FB", border: "rgba(30,60,184,0.2)", spin: true },
};

function TaskRow({ task, index }: { task: Task & { hostname?: string }; index: number }) {
  const [open, setOpen] = useState(false);
  const meta    = STATUS_META[task.status] ?? STATUS_META.pending;
  const Icon    = meta.icon;
  const created = new Date(task.created_at + "Z").toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04, duration: 0.25 }}
        whileHover={{ backgroundColor: "rgba(30,60,184,0.02)" }}
        onClick={() => setOpen(o => !o)}
        className="border-b border-nyx-border cursor-pointer"
      >
        <td className="px-5 py-3.5 w-8">
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }} className="inline-block">
            <ChevronRight size={13} className="text-nyx-muted" />
          </motion.span>
        </td>
        <td className="px-5 py-3.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
            <Icon size={11} className={meta.spin ? "animate-spin" : ""} />
            {task.status}
          </span>
        </td>
        <td className="px-5 py-3.5 mono text-nyx-text text-sm font-medium">{task.command}</td>
        <td className="px-5 py-3.5 text-nyx-dim text-sm">{task.hostname ?? task.agent_id.slice(0, 8)}</td>
        <td className="px-5 py-3.5 mono text-nyx-muted text-xs">{created}</td>
      </motion.tr>
      <AnimatePresence>
        {open && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="border-b border-nyx-border"
          >
            <td colSpan={5} className="px-8 py-0 bg-nyx-bg overflow-hidden">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="py-4">
                  <div className="rounded-xl p-4 mono text-xs leading-5 max-h-56 overflow-y-auto bg-white" style={{ border: "1px solid #E5DDD0" }}>
                    <pre className="whitespace-pre-wrap break-all text-nyx-dim">{task.output || "(no output)"}</pre>
                  </div>
                </div>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
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

  const counts = { all: tasks.length, completed: tasks.filter(t => t.status === "completed").length, failed: tasks.filter(t => t.status === "failed").length, pending: tasks.filter(t => t.status === "pending" || t.status === "running").length };
  const filtered = filter === "all" ? tasks : tasks.filter(t => filter === "pending" ? (t.status === "pending" || t.status === "running") : t.status === filter);

  const filters = [
    { key: "all",       label: "All",       color: "#1E3CB8", pale: "#EEF1FB", border: "rgba(30,60,184,0.2)" },
    { key: "completed", label: "Completed", color: "#0A6B4A", pale: "#EDFAF4", border: "rgba(10,107,74,0.2)" },
    { key: "failed",    label: "Failed",    color: "#B82828", pale: "#FEF0F0", border: "rgba(184,40,40,0.2)" },
    { key: "pending",   label: "Pending",   color: "#A85F0A", pale: "#FEF7EC", border: "rgba(168,95,10,0.2)" },
  ];

  return (
    <div className="p-7 space-y-5 bg-nyx-bg min-h-full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Tasks</h1>
          <p className="text-nyx-muted text-sm mt-1">{tasks.length} tasks across {agents.length} agents</p>
        </div>
        <motion.button onClick={load} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
          <motion.span animate={loading ? { rotate: 360 } : {}} transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}>
            <RefreshCw size={13} />
          </motion.span>
          Refresh
        </motion.button>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="flex gap-2">
        {filters.map((f, i) => (
          <motion.button key={f.key} onClick={() => setFilter(f.key)}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold"
            style={filter === f.key
              ? { background: f.pale, border: `1px solid ${f.border}`, color: f.color }
              : { background: "#FFFFFF", border: "1px solid #E5DDD0", color: "#8C95A8", cursor: "pointer" }
            }
          >
            {f.label} <span className="ml-1 opacity-60">({counts[f.key as keyof typeof counts]})</span>
          </motion.button>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-nyx-border bg-nyx-bg">
              <th className="w-8 px-5 py-3.5" />
              {["Status", "Command", "Agent", "Time"].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-nyx-muted font-semibold" style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={5} className="px-5 py-12 text-center text-nyx-muted text-sm">No tasks found</td></tr>
              : filtered.map((t, i) => <TaskRow key={t.id} task={t} index={i} />)
            }
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
