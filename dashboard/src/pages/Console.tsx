import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgents, createTask, createAgentWS, type Agent, type Task } from "../api/client";
import { Send, Wifi, WifiOff, ChevronDown, Terminal } from "lucide-react";

interface Line { type: "cmd" | "output" | "error" | "info" | "system"; text: string; time?: string; }

const HELP = `Commands:
  shell <cmd>     run a shell command
  sysinfo         system information
  whoami / pwd / ls / cat / ps / env
  netstat         active network connections
  ifconfig        network interfaces
  download <path> exfiltrate file from agent
  screenshot      capture agent screen
  persist         install persistence
  unpersist       remove persistence
  sleep <sec>     set beacon interval
  kill            terminate agent
  clear / help`.trim();

const lineStyle = (type: string): React.CSSProperties => {
  switch (type) {
    case "cmd":    return { color: "#1E3CB8", fontWeight: 500 };
    case "output": return { color: "#0A6B4A" };
    case "error":  return { color: "#B82828" };
    case "system": return { color: "#A85F0A", fontWeight: 600 };
    default:       return { color: "#8C95A8" };
  }
};

export default function Console() {
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [selectedAgent, setAgent] = useState("");
  const [command, setCommand]     = useState("");
  const [lines, setLines]         = useState<Line[]>([
    { type: "system", text: "NYX C2 // INTERACTIVE SHELL v0.2.0" },
    { type: "info",   text: "Select an agent and type a command." },
  ]);
  const [loading, setLoading]   = useState(false);
  const [wsLive, setWsLive]     = useState(false);
  const [history, setHistory]   = useState<string[]>([]);
  const [histIdx, setHistIdx]   = useState(-1);
  const wsRef      = useRef<WebSocket | null>(null);
  const pendingRef = useRef<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAgents().then(d => { setAgents(d); if (d.length > 0 && !selectedAgent) setAgent(d[0].id); });
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    wsRef.current?.close();
    const ws = createAgentWS(selectedAgent);
    wsRef.current = ws;
    ws.onopen  = () => { setWsLive(true); push({ type: "system", text: `WebSocket live → agent ${selectedAgent.slice(0, 8)}` }); };
    ws.onclose = () => setWsLive(false);
    ws.onerror = () => setWsLive(false);
    ws.onmessage = e => {
      const ev = JSON.parse(e.data);
      if (ev.type === "task_update" && ev.task_id === pendingRef.current) {
        push({ type: ev.status === "failed" ? "error" : "output", text: ev.output || "(no output)" });
        setLoading(false); pendingRef.current = null;
      }
    };
    return () => ws.close();
  }, [selectedAgent]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);

  const push = (line: Line) => {
    const t = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLines(p => [...p, { ...line, time: t }]);
  };

  const send = async () => {
    if (!command.trim() || !selectedAgent || loading) return;
    const cmd = command.trim();
    const agent = agents.find(a => a.id === selectedAgent);
    push({ type: "cmd", text: `[${agent?.hostname ?? "agent"}]$ ${cmd}` });
    setHistory(h => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1); setCommand("");
    if (cmd === "help")  { push({ type: "output", text: HELP }); return; }
    if (cmd === "clear") { setLines([{ type: "system", text: "Console cleared." }]); return; }
    setLoading(true);
    try {
      const task = await createTask(selectedAgent, cmd);
      pendingRef.current = task.id;
      push({ type: "info", text: `↑ task ${task.id.slice(0, 8)} dispatched` });
      if (!wsLive) {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const res = await fetch(`http://localhost:8000/api/tasks/${task.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` } }).then(r => r.json()) as Task;
          if (res.status !== "pending" && res.status !== "running") {
            push({ type: res.status === "failed" ? "error" : "output", text: res.output || "(no output)" });
            setLoading(false); pendingRef.current = null; break;
          }
        }
      }
    } catch { push({ type: "error", text: "Failed to dispatch task" }); setLoading(false); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { send(); return; }
    if (e.key === "ArrowUp")   { const i = Math.min(histIdx + 1, history.length - 1); setHistIdx(i); setCommand(history[i] ?? ""); }
    if (e.key === "ArrowDown") { const i = Math.max(histIdx - 1, -1); setHistIdx(i); setCommand(i === -1 ? "" : history[i]); }
  };

  return (
    <div className="flex flex-col bg-nyx-bg" style={{ height: "100vh", padding: "28px", gap: "16px" }}>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <Terminal size={14} className="text-nyx-accent" />
          </div>
          <div>
            <h1 className="text-nyx-text text-xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Console</h1>
            <p className="text-nyx-muted text-xs mt-0.5">Interactive agent shell</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <motion.div whileHover={{ scale: 1.03 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-default"
            style={{ background: wsLive ? "#EDFAF4" : "#F4F2EE", border: `1px solid ${wsLive ? "rgba(10,107,74,0.2)" : "#E5DDD0"}`, color: wsLive ? "#0A6B4A" : "#8C95A8" }}>
            {wsLive ? <Wifi size={11} /> : <WifiOff size={11} />}
            {wsLive ? "Live" : "Polling"}
          </motion.div>
          <div className="relative">
            <select value={selectedAgent} onChange={e => setAgent(e.target.value)}
              className="appearance-none input-base rounded-xl px-4 py-2 pr-8 text-sm mono cursor-pointer">
              {agents.length === 0 && <option value="">No agents</option>}
              {agents.map(a => <option key={a.id} value={a.id}>{a.hostname} ({a.ip})</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-2.5 text-nyx-muted pointer-events-none" />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex-1 rounded-2xl p-5 overflow-y-auto mono text-sm cursor-text bg-white"
        style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", minHeight: 0 }}
        onClick={() => inputRef.current?.focus()}
      >
        <AnimatePresence initial={false}>
          {lines.map((l, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="flex gap-3 mb-0.5 leading-6"
            >
              <span className="text-nyx-muted text-xs w-16 flex-shrink-0 pt-0.5 select-none">{l.time}</span>
              <span className="whitespace-pre-wrap break-all" style={lineStyle(l.type)}>{l.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 leading-6">
            <span className="w-16 flex-shrink-0" />
            <span className="flex items-center gap-1.5" style={{ color: "#A85F0A" }}>
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>●</motion.span>
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.2 }}>●</motion.span>
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity, delay: 0.4 }}>●</motion.span>
              <span className="ml-1">waiting for agent</span>
            </span>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}
        className="flex gap-3 flex-shrink-0">
        <motion.div
          className="flex-1 flex items-center gap-3 bg-white rounded-xl px-4"
          style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
          >
          <span className="text-nyx-accent mono text-sm select-none font-bold">$</span>
          <input
            ref={inputRef}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={onKey}
            placeholder="sysinfo  ·  shell whoami  ·  ls /tmp  ·  help"
            className="flex-1 bg-transparent mono text-nyx-text text-sm py-3 focus:outline-none placeholder:text-nyx-muted"
            autoFocus
          />
        </motion.div>
        <motion.button
          onClick={send}
          disabled={loading || !selectedAgent}
          whileHover={{ scale: 1.04, boxShadow: "0 6px 20px rgba(30,60,184,0.3)" }}
          whileTap={{ scale: 0.94 }}
          className="btn-primary ripple w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        >
          <motion.span animate={loading ? { rotate: 360 } : {}} transition={loading ? { duration: 1, repeat: Infinity, ease: "linear" } : {}}>
            <Send size={14} />
          </motion.span>
        </motion.button>
      </motion.div>
    </div>
  );
}
