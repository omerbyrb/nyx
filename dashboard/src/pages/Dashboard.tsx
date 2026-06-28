import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { getAgents, type Agent } from "../api/client";
import { Cpu, CheckCircle, AlertCircle, Radio } from "lucide-react";

function useCounter(target: number, duration = 600) {
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

function StatCard({ label, value, icon: Icon, accent, pale, delay = 0 }: { label: string; value: number; icon: any; accent: string; pale: string; delay?: number }) {
  const count = useCounter(value);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(my, { stiffness: 180, damping: 18 });
  const ry = useSpring(mx, { stiffness: 180, damping: 18 });

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width  - 0.5) * 12);
    my.set(-((e.clientY - r.top)  / r.height - 0.5) * 12);
  };
  const onLeave = () => { mx.set(0); my.set(0); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateY: ry, rotateX: rx, transformStyle: "preserve-3d", perspective: 600 }}
      whileHover={{ boxShadow: "0 8px 32px rgba(30,60,184,0.1), 0 2px 8px rgba(0,0,0,0.05)" }}
      className="bg-white rounded-2xl p-5 cursor-default"
      // @ts-ignore
      style2={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="bg-white rounded-2xl p-5 cursor-default"
        style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", rotateY: ry as any, rotateX: rx as any, transformStyle: "preserve-3d" as any, perspective: 600 }}
      >
      <div className="flex items-start justify-between mb-4">
        <span className="text-nyx-muted font-semibold" style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
        <motion.div whileHover={{ scale: 1.1, rotate: 5 }} transition={{ type: "spring", stiffness: 300 }}
          className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: pale }}>
          <Icon size={14} style={{ color: accent }} />
        </motion.div>
      </div>
      <div className="text-4xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", color: accent, letterSpacing: "-0.02em" }}>
        {count}
      </div>
      </motion.div>
    </motion.div>
  );
}

function AgentRow({ agent, index }: { agent: Agent; index: number }) {
  const diffSec = Math.floor((Date.now() - new Date(agent.last_seen + "Z").getTime()) / 1000);
  const alive = diffSec < 30;
  return (
    <motion.tr
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 + index * 0.06, duration: 0.25 }}
      whileHover={{ backgroundColor: "rgba(30,60,184,0.02)" }}
      className="border-b border-nyx-border"
    >
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className={`w-2 h-2 rounded-full ${alive ? "bg-nyx-green" : "bg-nyx-muted"}`} />
            {alive && (
              <motion.div animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }} transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 w-2 h-2 rounded-full bg-nyx-green" />
            )}
          </div>
          <span className="text-nyx-text text-sm font-medium">{agent.hostname}</span>
        </div>
      </td>
      <td className="px-5 py-3.5 text-nyx-dim text-sm">{agent.username}</td>
      <td className="px-5 py-3.5">
        <span className="mono text-xs px-2.5 py-1 rounded-md font-medium" style={{ background: "#EEF1FB", color: "#1E3CB8", border: "1px solid rgba(30,60,184,0.15)" }}>
          {agent.os}/{agent.arch}
        </span>
      </td>
      <td className="px-5 py-3.5 mono text-nyx-dim text-sm">{agent.ip}</td>
      <td className="px-5 py-3.5">
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${alive ? "status-active" : "status-offline"}`}>
          {alive ? "active" : diffSec < 3600 ? `${Math.floor(diffSec / 60)}m ago` : ">1h"}
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
  const active = agents.filter(a => (Date.now() - new Date(a.last_seen + "Z").getTime()) / 1000 < 30).length;

  return (
    <div className="p-7 space-y-6 bg-nyx-bg min-h-full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-start justify-between">
        <div>
          <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p className="text-nyx-muted text-sm mt-1">Active operations overview</p>
        </div>
        <motion.div whileHover={{ scale: 1.03 }} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-default"
          style={{ background: "#EDFAF4", border: "1px solid rgba(10,107,74,0.2)", color: "#0A6B4A" }}>
          <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
            <Radio size={11} />
          </motion.span>
          Live
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Agents" value={agents.length} icon={Cpu}          accent="#1E3CB8" pale="#EEF1FB" delay={0.1} />
        <StatCard label="Active Now"   value={active}        icon={CheckCircle}   accent="#0A6B4A" pale="#EDFAF4" delay={0.17} />
        <StatCard label="Offline"      value={agents.length - active} icon={AlertCircle} accent="#8C95A8" pale="#F4F2EE" delay={0.24} />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.35 }}
        className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <div className="px-5 py-4 border-b border-nyx-border flex items-center justify-between">
          <span className="text-nyx-text text-sm font-semibold">Recent Agents</span>
          <span className="text-nyx-muted text-xs mono">{agents.length} total</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-nyx-border bg-nyx-bg">
              {["Hostname", "User", "Platform", "IP", "Status"].map(h => (
                <th key={h} className="px-5 py-3 text-left text-nyx-muted font-semibold" style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.length === 0
              ? <tr><td colSpan={5} className="px-5 py-10 text-center text-nyx-muted text-sm">No agents connected</td></tr>
              : agents.map((a, i) => <AgentRow key={a.id} agent={a} index={i} />)}
          </tbody>
        </table>
      </motion.div>
    </div>
  );
}
