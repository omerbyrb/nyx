import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgents, createTask, type Agent } from "../api/client";
import { RefreshCw, Terminal, Download, Shield, ShieldOff, Clock, CheckCircle } from "lucide-react";

function AgentCard({ agent, onConsole, index }: { agent: Agent; onConsole: () => void; index: number }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive   = diffSec < 30;
  const [action, setAction]  = useState<string | null>(null);
  const [dlPath, setDlPath]  = useState("");
  const [sleepVal, setSleep] = useState(agent.sleep);
  const [feedback, setFb]    = useState("");

  const send = async (cmd: string) => {
    await createTask(agent.id, cmd);
    setFb("Task dispatched");
    setTimeout(() => setFb(""), 2500);
    setAction(null);
  };

  const ActionBtn = ({ icon: Icon, label, onClick, danger }: any) => (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.96 }}
      className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium"
      style={{ background: "#FFFFFF", border: "1px solid #E5DDD0", color: "#3D4559", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", cursor: "pointer" }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.background = danger ? "#FEF0F0" : "#EEF1FB"; el.style.borderColor = danger ? "rgba(184,40,40,0.2)" : "rgba(30,60,184,0.2)"; el.style.color = danger ? "#B82828" : "#1E3CB8"; }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.background = "#FFFFFF"; el.style.borderColor = "#E5DDD0"; el.style.color = "#3D4559"; }}
    >
      <Icon size={12} /> {label}
    </motion.button>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -3, boxShadow: "0 12px 40px rgba(30,60,184,0.1), 0 2px 8px rgba(0,0,0,0.06)" }}
      className="bg-white rounded-2xl p-5"
      style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", transition: "box-shadow 0.2s ease" }}
    >
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <motion.div
              whileHover={{ scale: 1.08 }}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold mono"
              style={{ background: alive ? "#EDFAF4" : "#F4F2EE", border: `1px solid ${alive ? "rgba(10,107,74,0.2)" : "#E5DDD0"}`, color: alive ? "#0A6B4A" : "#8C95A8" }}
            >
              {agent.hostname[0].toUpperCase()}
            </motion.div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
          </div>
          <div>
            <div className="text-nyx-text font-semibold text-sm">{agent.hostname}</div>
            <div className="mono text-nyx-muted text-xs mt-0.5">{agent.id.slice(0, 16)}…</div>
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${alive ? "status-active" : "status-offline"}`}>
          {alive ? "ACTIVE" : "OFFLINE"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5 p-4 rounded-xl" style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
        {[["User", agent.username], ["Platform", `${agent.os}/${agent.arch}`], ["IP", agent.ip],
          ["Last Seen", diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec / 60)}m ago`],
          ["Sleep", `${agent.sleep}s ± ${agent.jitter}s`], ["Jitter", agent.jitter + "s"]].map(([label, value]) => (
          <div key={label}>
            <div className="text-nyx-muted font-semibold mb-0.5" style={{ fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
            <div className="text-nyx-dim text-sm mono">{value}</div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: "auto", marginBottom: 12 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium overflow-hidden"
            style={{ background: "#EDFAF4", border: "1px solid rgba(10,107,74,0.2)", color: "#0A6B4A" }}>
            <CheckCircle size={12} /> {feedback}
          </motion.div>
        )}
        {action === "download" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-3 flex gap-2 overflow-hidden">
            <input value={dlPath} onChange={e => setDlPath(e.target.value)} placeholder="/etc/passwd" className="input-base flex-1 rounded-xl px-3 py-2 text-xs mono" />
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => send(`download ${dlPath}`)} className="btn-primary px-3 py-2 rounded-xl text-xs">Get</motion.button>
            <button onClick={() => setAction(null)} className="text-nyx-muted px-2 text-xs hover:text-nyx-text">✕</button>
          </motion.div>
        )}
        {action === "sleep" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="mb-3 flex gap-2 items-center overflow-hidden">
            <input type="number" value={sleepVal} onChange={e => setSleep(e.target.value)} className="input-base w-20 rounded-xl px-3 py-2 text-xs mono" />
            <span className="text-nyx-muted text-xs">seconds</span>
            <motion.button whileTap={{ scale: 0.95 }} onClick={async () => { await send(`sleep ${sleepVal}`); fetch(`http://localhost:8000/api/agents/${agent.id}/sleep?sleep=${sleepVal}&jitter=1`, { method: "PATCH", headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` } }); }}
              className="btn-primary px-3 py-2 rounded-xl text-xs">Set</motion.button>
            <button onClick={() => setAction(null)} className="text-nyx-muted px-2 text-xs hover:text-nyx-text">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn icon={Terminal}  label="Console"   onClick={onConsole} />
        <ActionBtn icon={Download}  label="Download"  onClick={() => setAction(action === "download" ? null : "download")} />
        <ActionBtn icon={Shield}    label="Persist"   onClick={() => send("persist")} />
        <ActionBtn icon={ShieldOff} label="Unpersist" onClick={() => send("unpersist")} danger />
        <ActionBtn icon={Clock}     label="Sleep"     onClick={() => setAction(action === "sleep" ? null : "sleep")} />
      </div>
    </motion.div>
  );
}

interface AgentsProps { onNavigateConsole?: () => void; }

export default function Agents({ onNavigateConsole }: AgentsProps) {
  const [agents, setAgents]   = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const load = () => { setLoading(true); getAgents().then(setAgents).finally(() => setLoading(false)); };
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, []);

  return (
    <div className="p-7 space-y-5 bg-nyx-bg min-h-full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Agents</h1>
          <p className="text-nyx-muted text-sm mt-1">{agents.length} registered</p>
        </div>
        <motion.button onClick={load} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-sm">
          <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}>
            <RefreshCw size={13} />
          </motion.span>
          Refresh
        </motion.button>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2">
        {agents.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="col-span-2 bg-white rounded-2xl p-12 text-center text-nyx-muted text-sm"
            style={{ border: "1px solid #E5DDD0" }}>
            No agents connected.
          </motion.div>
        )}
        {agents.map((a, i) => <AgentCard key={a.id} agent={a} onConsole={() => onNavigateConsole?.()} index={i} />)}
      </div>
    </div>
  );
}
