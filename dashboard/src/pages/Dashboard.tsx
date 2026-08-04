import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAgents, type Agent } from "../api/client";
import { Cpu, CheckCircle, AlertCircle, Radio, Download } from "lucide-react";

function exportCSV(agents: Agent[]) {
  const isAlive = (a: Agent) => (Date.now() - new Date(a.last_seen + "Z").getTime()) / 1000 < 30;
  const header  = ["hostname", "ip", "username", "os", "arch", "status", "last_seen"];
  const rows    = agents.map(a => [
    a.hostname, a.ip, a.username, a.os, a.arch,
    isAlive(a) ? "active" : "offline",
    a.last_seen,
  ]);
  const csv  = [header, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const el   = document.createElement("a");
  el.href = url;
  el.download = `nyx-agents-${new Date().toISOString().slice(0, 10)}.csv`;
  el.click();
  URL.revokeObjectURL(url);
}

function useCounter(target: number, duration = 700) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(timer); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return val;
}

function StatCard({
  label, value, icon: Icon, accent, delay = 0,
}: {
  label: string; value: number; icon: React.ElementType; accent: string; delay?: number;
}) {
  const count = useCounter(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="hud-panel hud-corners"
      style={{ padding: "20px" }}
    >
      <div className="flex items-start justify-between mb-4">
        <span
          className="text-xs tracking-widest uppercase"
          style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
        >
          {label}
        </span>
        <div
          className="flex items-center justify-center"
          style={{
            width: 28, height: 28,
            border: `1px solid ${accent}22`,
            background: `${accent}0A`,
          }}
        >
          <Icon size={13} style={{ color: accent }} />
        </div>
      </div>
      <div
        className="text-3xl font-bold"
        style={{
          fontFamily: "'Fira Code', monospace",
          color: accent,
          textShadow: `0 0 12px ${accent}66`,
          letterSpacing: "-0.02em",
        }}
      >
        {String(count).padStart(2, "0")}
      </div>
    </motion.div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  return { copied, copy };
}

function CopyCell({ value, copyKey, color = "#9A9A9A" }: { value: string; copyKey: string; color?: string }) {
  const { copied, copy } = useCopy();
  const isCopied = copied === copyKey;
  return (
    <span
      onClick={() => copy(value, copyKey)}
      title="Click to copy"
      className="text-sm cursor-pointer select-none"
      style={{
        fontFamily: "'Fira Code', monospace",
        color: isCopied ? "#00FF41" : color,
        textShadow: isCopied ? "0 0 6px rgba(0,255,65,0.6)" : "none",
        transition: "color 0.15s, text-shadow 0.15s",
      }}
    >
      {isCopied ? "COPIED!" : value}
    </span>
  );
}

function AgentRow({ agent, index }: { agent: Agent; index: number }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive = diffSec < 30;

  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + index * 0.06, duration: 0.2 }}
      style={{ borderBottom: "1px solid #1F1F1F" }}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-shrink-0">
            <div
              style={{
                width: 6, height: 6, borderRadius: "50%",
                background: alive ? "#00FF41" : "#4A4A4A",
                boxShadow: alive ? "0 0 6px #00FF41" : "none",
              }}
            />
            {alive && (
              <motion.div
                animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{
                  position: "absolute", inset: 0,
                  borderRadius: "50%", background: "#00FF41",
                }}
              />
            )}
          </div>
          <CopyCell value={agent.hostname} copyKey={`host-${agent.id}`} color="#E0E0E0" />
        </div>
      </td>
      <td className="px-4 py-3">
        <CopyCell value={agent.username} copyKey={`user-${agent.id}`} />
      </td>
      <td className="px-4 py-3">
        <span
          className="text-xs px-2 py-0.5"
          style={{
            fontFamily: "'Fira Code', monospace",
            color: "#00FF41",
            background: "rgba(0,255,65,0.06)",
            border: "1px solid rgba(0,255,65,0.15)",
          }}
        >
          {agent.os}/{agent.arch}
        </span>
      </td>
      <td className="px-4 py-3">
        <CopyCell value={agent.ip} copyKey={`ip-${agent.id}`} />
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-xs px-2 py-0.5 ${alive ? "status-active" : "status-offline"}`}
          style={{ fontFamily: "'Fira Code', monospace" }}
        >
          {alive ? "ACTIVE" : diffSec < 3600 ? `${Math.floor(diffSec / 60)}m_ago` : "OFFLINE"}
        </span>
      </td>
    </motion.tr>
  );
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const load = () => getAgents().then(setAgents).catch(() => {});
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, []);

  const active = agents.filter(
    a => (Date.now() - new Date(a.last_seen + "Z").getTime()) / 1000 < 30
  ).length;

  return (
    <div className="p-6 space-y-5" style={{ minHeight: "100%", background: "#000" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-start justify-between"
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
            // DASHBOARD
          </h1>
          <p
            className="text-xs mt-1"
            style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
          >
            active operations overview
          </p>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs"
          style={{
            fontFamily: "'Fira Code', monospace",
            color: "#00FF41",
            border: "1px solid rgba(0,255,65,0.25)",
            background: "rgba(0,255,65,0.05)",
          }}
        >
          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>
            <Radio size={10} />
          </motion.span>
          LIVE
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Agents" value={agents.length} icon={Cpu}          accent="#00FF41" delay={0.1} />
        <StatCard label="Active Now"   value={active}        icon={CheckCircle}   accent="#00FF41" delay={0.17} />
        <StatCard label="Offline"      value={agents.length - active} icon={AlertCircle} accent="#FF3333" delay={0.24} />
      </div>

      {/* Agent table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="hud-panel"
        style={{ overflow: "hidden" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid #1F1F1F" }}
        >
          <span
            className="text-xs tracking-widest uppercase"
            style={{ fontFamily: "'Fira Code', monospace", color: "#00FF41" }}
          >
            // AGENT LIST
          </span>
          <div className="flex items-center gap-3">
            <span
              className="text-xs"
              style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
            >
              {agents.length} nodes
            </span>
            {agents.length > 0 && (
              <motion.button
                onClick={() => exportCSV(agents)}
                whileTap={{ scale: 0.95 }}
                title="Export agents as CSV"
                className="flex items-center gap-1.5 px-2 py-1 text-xs btn-ghost"
                style={{ fontFamily: "'Fira Code', monospace" }}
              >
                <Download size={10} />
                EXPORT
              </motion.button>
            )}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1F1F1F" }}>
                {["Hostname", "User", "Platform", "IP", "Status"].map(h => (
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
              {agents.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-xs"
                    style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}
                  >
                    {"[ NO AGENTS CONNECTED ]"}
                  </td>
                </tr>
              ) : (
                agents.map((a, i) => <AgentRow key={a.id} agent={a} index={i} />)
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
