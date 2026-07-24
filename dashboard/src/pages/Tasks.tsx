import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgents, getAgentTasks, type Agent, type Task } from "../api/client";
import { CheckCircle, XCircle, Clock, Loader, ChevronRight, RefreshCw } from "lucide-react";

const STATUS_META: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; spin?: boolean }> = {
  completed: { icon: CheckCircle, color: "#00FF41", bg: "rgba(0,255,65,0.05)",  border: "rgba(0,255,65,0.2)" },
  failed:    { icon: XCircle,     color: "#FF3333", bg: "rgba(255,51,51,0.05)", border: "rgba(255,51,51,0.2)" },
  pending:   { icon: Clock,       color: "#FFB800", bg: "rgba(255,184,0,0.05)", border: "rgba(255,184,0,0.2)" },
  running:   { icon: Loader,      color: "#00FF41", bg: "rgba(0,255,65,0.05)",  border: "rgba(0,255,65,0.2)", spin: true },
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
        style={{ borderBottom: "1px solid #1F1F1F", cursor: "pointer" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <td className="px-4 py-3 w-8">
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-block">
            <ChevronRight size={11} style={{ color: "#2A2A2A" }} />
          </motion.span>
        </td>
        <td className="px-4 py-3">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5"
            style={{
              fontFamily: "'Fira Code', monospace",
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
            style={{ fontFamily: "'Fira Code', monospace", color: "#E0E0E0" }}
          >
            {task.command}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className="text-sm"
            style={{ fontFamily: "'Fira Code', monospace", color: "#9A9A9A" }}
          >
            {task.hostname ?? task.agent_id.slice(0, 8)}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className="text-xs"
            style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
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
            style={{ borderBottom: "1px solid #1F1F1F" }}
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
                      fontFamily: "'Fira Code', monospace",
                      background: "#000",
                      border: "1px solid #1F1F1F",
                    }}
                  >
                    <pre className="whitespace-pre-wrap break-all" style={{ color: "#9A9A9A" }}>
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
  { key: "all",       label: "ALL",       color: "#00FF41", border: "rgba(0,255,65,0.3)" },
  { key: "completed", label: "DONE",      color: "#00FF41", border: "rgba(0,255,65,0.3)" },
  { key: "failed",    label: "FAILED",    color: "#FF3333", border: "rgba(255,51,51,0.3)" },
  { key: "pending",   label: "PENDING",   color: "#FFB800", border: "rgba(255,184,0,0.3)" },
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
    <div className="p-6 space-y-5" style={{ minHeight: "100%", background: "#000" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1
            className="text-lg font-bold tracking-widest uppercase"
            style={{
              fontFamily: "'Fira Code', monospace",
              color: "#00FF41",
              textShadow: "0 0 10px rgba(0,255,65,0.5)",
            }}
          >
            // TASKS
          </h1>
          <p
            className="text-xs mt-1"
            style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
          >
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
                fontFamily: "'Fira Code', monospace",
                background: active ? `${f.color}0D` : "transparent",
                border: `1px solid ${active ? f.border : "#1F1F1F"}`,
                color: active ? f.color : "#4A4A4A",
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
        className="hud-panel"
        style={{ overflow: "hidden" }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1F1F1F" }}>
                <th className="w-8" />
                {["Status", "Command", "Agent", "Time"].map(h => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-xs tracking-widest uppercase"
                    style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A", fontWeight: 400 }}
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
                    style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}
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
