import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAgents, type Agent } from "../api/client";
import { Cpu, CheckCircle, AlertCircle, Activity, Clock } from "lucide-react";

function useCounter(target: number, duration = 600) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
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
  label, value, icon: Icon, accent = "var(--text)", sub, delay = 0,
}: {
  label: string; value: number; icon: React.ElementType; accent?: string; sub?: string; delay?: number;
}) {
  const count = useCounter(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="card"
      style={{ padding: "20px 22px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <span
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--text-muted)",
            letterSpacing: "0.01em",
          }}
        >
          {label}
        </span>
        <div
          style={{
            width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: "6px",
            background: accent === "var(--accent)" ? "var(--accent-dim)" : "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <Icon size={14} style={{ color: accent }} />
        </div>
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: "28px",
          fontWeight: 700,
          color: accent === "var(--accent)" ? "var(--text)" : accent === "var(--red)" ? "var(--red)" : "var(--text)",
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginBottom: sub ? 6 : 0,
        }}
      >
        {count}
      </div>
      {sub && (
        <div style={{ fontSize: "11px", color: "var(--text-faint)", fontFamily: "'Inter', sans-serif" }}>
          {sub}
        </div>
      )}
    </motion.div>
  );
}

function timeSince(agent: Agent) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  if (diffSec < 30) return { label: "Active", alive: true };
  if (diffSec < 3600) return { label: `${Math.floor(diffSec / 60)}m ago`, alive: false };
  return { label: "Offline", alive: false };
}

function AgentRow({ agent, index }: { agent: Agent; index: number }) {
  const { label, alive } = timeSince(agent);

  return (
    <motion.tr
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.35 + index * 0.05, duration: 0.2 }}
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <td style={{ padding: "10px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 7, height: 7, borderRadius: "50%",
                background: alive ? "var(--accent)" : "var(--border-2)",
              }}
            />
            {alive && (
              <motion.div
                animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                style={{
                  position: "absolute", inset: 0,
                  borderRadius: "50%", background: "var(--accent)",
                }}
              />
            )}
          </div>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text)",
            }}
          >
            {agent.hostname}
          </span>
        </div>
      </td>
      <td style={{ padding: "10px 16px" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-muted)" }}>
          {agent.username}
        </span>
      </td>
      <td style={{ padding: "10px 16px" }}>
        <span
          className="status-active"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", padding: "2px 8px" }}
        >
          {agent.os}/{agent.arch}
        </span>
      </td>
      <td style={{ padding: "10px 16px" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "var(--text-muted)" }}>
          {agent.ip}
        </span>
      </td>
      <td style={{ padding: "10px 16px" }}>
        <span
          className={alive ? "status-active" : "status-offline"}
          style={{ fontFamily: "'Inter', sans-serif", fontSize: "11px", fontWeight: 500, padding: "2px 8px" }}
        >
          {label}
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

  const offline = agents.length - active;

  return (
    <div style={{ padding: "28px", minHeight: "100%", background: "var(--bg)" }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}
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
            Dashboard
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "13px", color: "var(--text-muted)" }}>
            Operations overview
          </p>
        </div>

        <div
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px",
            borderRadius: "6px",
            background: "var(--accent-dim)",
            border: "1px solid rgba(0,255,65,0.2)",
          }}
        >
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }}
          />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--accent)" }}>
            Live
          </span>
        </div>
      </motion.div>

      {/* Bento stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Total Agents"
          value={agents.length}
          icon={Cpu}
          accent="var(--accent)"
          delay={0.05}
        />
        <StatCard
          label="Active Now"
          value={active}
          icon={Activity}
          accent="var(--accent)"
          sub={active === 1 ? "1 beacon" : `${active} beacons`}
          delay={0.1}
        />
        <StatCard
          label="Offline"
          value={offline}
          icon={AlertCircle}
          accent={offline > 0 ? "var(--red)" : "var(--text-faint)"}
          delay={0.15}
        />
        <StatCard
          label="Success Rate"
          value={agents.length > 0 ? Math.round((active / agents.length) * 100) : 0}
          icon={CheckCircle}
          sub="active / total"
          delay={0.2}
        />
      </div>

      {/* Agent table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.25 }}
        className="card"
        style={{ overflow: "hidden" }}
      >
        {/* Table header */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={14} style={{ color: "var(--text-muted)" }} />
            <span
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Agent List
            </span>
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              color: "var(--text-faint)",
            }}
          >
            {agents.length} {agents.length === 1 ? "node" : "nodes"}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Hostname", "User", "Platform", "IP Address", "Status"].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 16px",
                      textAlign: "left",
                      fontFamily: "'Inter', sans-serif",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
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
                    style={{
                      padding: "48px 16px",
                      textAlign: "center",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "12px",
                      color: "var(--text-faint)",
                    }}
                  >
                    No agents connected
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
