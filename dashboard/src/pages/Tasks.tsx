import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgents, getAgentTasks, type Agent, type Task } from "../api/client";
import { CheckCircle, XCircle, Clock, Loader, ChevronRight, RefreshCw } from "lucide-react";

const STATUS_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; spin?: boolean }> = {
  completed: { icon: CheckCircle, color: "var(--accent)", bg: "rgba(0,255,65,0.05)",  border: "rgba(0,255,65,0.2)" },
  failed:    { icon: XCircle,     color: "var(--red)", bg: "rgba(255,51,51,0.05)", border: "rgba(255,51,51,0.2)" },
  pending:   { icon: Clock,       color: "var(--amber)", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
  running:   { icon: Loader,      color: "var(--accent)", bg: "rgba(0,255,65,0.05)",  border: "rgba(0,255,65,0.2)", spin: true },
};

function TaskRow({ task, index }: { task: Task & { hostname?: string }; index: number }) {
  const [open, setOpen] = useState(false);
  const meta    = STATUS_META[task.status] ?? STATUS_META.pending;
  const Icon    = meta.icon;
  const created = new Date(task.created_at + "Z").toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <>
      <motion.tr
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04, duration: 0.2 }}
        onClick={() => setOpen(o => !o)}
        style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <td className="px-4 py-3 w-8">
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-block">
            <ChevronRight size={11} style={{ color: "var(--text-faint)" }} />
          </motion.span>
        </td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: meta.bg,
              border: `1px solid ${meta.border}`,
              color: meta.color,
            }}
          >
            <Icon size={10} className={meta.spin ? "animate-spin" : ""} />
            {task.status.toUpperCase()}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className="text-sm"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}
          >
            {task.command}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className="text-sm"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}
          >
            {task.hostname ?? task.agent_id.slice(0, 8)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className="text-xs"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}
          >
            {created}
          </span>
        </td>
      </motion.tr>
      <AnimatePresence>
        {open && (
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <td colSpan={5} className="px-6 py-0 overflow-hidden" style={{ background: "#050505" }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="py-3">
                  <div
                    className="p-3 text-xs leading-5 max-h-48 overflow-y-auto"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <pre className="whitespace-pre-wrap break-all" style={{ color: "var(--text-muted)" }}>
                      {task.output || "(no output)"}
                    </pre>
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

const FILTERS = [
  { key: "all",       label: "ALL",       color: "var(--accent)", border: "rgba(0,255,65,0.3)" },
  { key: "completed", label: "DONE",      color: "var(--accent)", border: "rgba(0,255,65,0.3)" },
  { key: "failed",    label: "FAILED",    color: "var(--red)", border: "rgba(255,51,51,0.3)" },
  { key: "pending",   label: "PENDING",   color: "var(--amber)", border: "rgba(245,158,11,0.3)" },
];

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
      const all = await Promise.all(
        agentList.map(a =>
          getAgentTasks(a.id).then(ts => ts.map(t => ({ ...t, hostname: a.hostname })))
        )
      );
      setTasks(
        all.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      );
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const counts = {
    all:       tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    failed:    tasks.filter(t => t.status === "failed").length,
    pending:   tasks.filter(t => t.status === "pending" || t.status === "running").length,
  };

  const filtered = filter === "all"
    ? tasks
    : tasks.filter(t =>
        filter === "pending"
          ? (t.status === "pending" || t.status === "running")
          : t.status === filter
      );

  return (
    <div className="p-6 space-y-5" style={{ minHeight: "100%", background: "var(--bg)" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: "20px",
              color: "var(--text)",
              letterSpacing: "-0.02em",
              marginBottom: 4,
            }}
          >
            Tasks
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "var(--text-muted)" }}>
            {tasks.length} tasks across {agents.length} agents
          </p>
        </div>
        <motion.button
          onClick={load}
          whileTap={{ scale: 0.95 }}
          className="btn-ghost flex items-center gap-2 px-3 py-1.5"
        >
          <motion.span
            animate={loading ? { rotate: 360 } : {}}
            transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
          >
            <RefreshCw size={12} />
          </motion.span>
          REFRESH
        </motion.button>
      </motion.div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {FILTERS.map((f, i) => {
          const active = filter === f.key;
          return (
            <motion.button
              key={f.key}
              onClick={() => setFilter(f.key)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.04 }}
              whileTap={{ scale: 0.95 }}
              className="px-3 py-1 text-xs"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: active ? `${f.color}0D` : "transparent",
                border: `1px solid ${active ? f.border : "var(--border)"}`,
                color: active ? f.color : "var(--text-faint)",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {f.label} ({counts[f.key as keyof typeof counts]})
            </motion.button>
          );
        })}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card"
        style={{ overflow: "hidden" }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="w-8" />
                {["Status", "Command", "Agent", "Time"].map(h => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs tracking-widest uppercase"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)", fontWeight: 400 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-xs"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}
                  >
                    {"[ NO TASKS FOUND ]"}
                  </td>
                </tr>
              ) : (
                filtered.map((t, i) => <TaskRow key={t.id} task={t} index={i} />)
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
