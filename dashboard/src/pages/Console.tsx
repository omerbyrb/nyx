import { useState, useEffect, useRef } from "react";
import { getAgents, createTask, createAgentWS, type Agent } from "../api/client";
import { Send, ChevronDown, Wifi, WifiOff } from "lucide-react";

interface OutputLine {
  type: "cmd" | "output" | "error" | "info" | "system";
  text: string;
  time?: string;
}

const BUILT_IN_HELP = `
Available commands:
  shell <cmd>   — run a shell command
  sysinfo       — hostname, user, OS, arch, PID
  whoami        — current user
  pwd           — working directory
  ls [path]     — list directory
  ps            — running processes
  env           — environment variables
  cat <file>    — read a file
  help          — show this message
`.trim();

export default function Console() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<OutputLine[]>([
    { type: "system", text: "Nyx C2 Console v0.2.0" },
    { type: "info", text: "Select an agent and type a command to begin." },
  ]);
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingTaskRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAgents().then((data) => {
      setAgents(data);
      if (data.length > 0) setSelectedAgent(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    wsRef.current?.close();

    const ws = createAgentWS(selectedAgent);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      push({ type: "system", text: `WebSocket connected to agent ${selectedAgent.slice(0, 8)}` });
    };

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "task_update" && event.task_id === pendingTaskRef.current) {
        push({ type: event.status === "failed" ? "error" : "output", text: event.output || "(no output)" });
        setLoading(false);
        pendingTaskRef.current = null;
      }
    };

    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    return () => ws.close();
  }, [selectedAgent]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const push = (line: OutputLine) => {
    const now = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLines((prev) => [...prev, { ...line, time: now }]);
  };

  const sendCommand = async () => {
    if (!command.trim() || !selectedAgent || loading) return;

    const cmd = command.trim();
    const agent = agents.find((a) => a.id === selectedAgent);
    push({ type: "cmd", text: `[${agent?.hostname ?? selectedAgent.slice(0, 8)}]$ ${cmd}` });
    setHistory((h) => [cmd, ...h.slice(0, 49)]);
    setHistoryIdx(-1);
    setCommand("");

    if (cmd === "help") {
      push({ type: "output", text: BUILT_IN_HELP });
      return;
    }

    if (cmd === "clear") {
      setLines([{ type: "system", text: "Console cleared." }]);
      return;
    }

    setLoading(true);

    try {
      const task = await createTask(selectedAgent, cmd);
      pendingTaskRef.current = task.id;
      push({ type: "info", text: `Task ${task.id.slice(0, 8)} dispatched` });

      if (!wsConnected) {
        // fallback polling if WS not connected
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const res = await fetch(`http://localhost:8000/api/tasks/${task.id}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("nyx_token")}` },
          }).then((r) => r.json());
          if (res.status !== "pending" && res.status !== "running") {
            push({ type: res.status === "failed" ? "error" : "output", text: res.output || "(no output)" });
            setLoading(false);
            pendingTaskRef.current = null;
            break;
          }
        }
      }
    } catch {
      push({ type: "error", text: "Failed to dispatch task" });
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { sendCommand(); return; }
    if (e.key === "ArrowUp") {
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setCommand(history[idx] ?? "");
    }
    if (e.key === "ArrowDown") {
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setCommand(idx === -1 ? "" : history[idx]);
    }
  };

  const lineStyle = (type: string) => {
    switch (type) {
      case "cmd":    return "text-nyx-accent";
      case "output": return "text-nyx-green";
      case "error":  return "text-nyx-red";
      case "system": return "text-nyx-yellow font-semibold";
      default:       return "text-nyx-muted";
    }
  };

  return (
    <div className="p-6 flex flex-col h-full gap-4" style={{ height: "calc(100vh - 0px)" }}>
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-nyx-text text-xl font-semibold">Console</h1>
          <p className="text-nyx-muted text-sm mt-1">Interactive agent shell</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {wsConnected
              ? <Wifi size={14} className="text-nyx-green" />
              : <WifiOff size={14} className="text-nyx-muted" />}
            <span className={`text-xs ${wsConnected ? "text-nyx-green" : "text-nyx-muted"}`}>
              {wsConnected ? "Live" : "Polling"}
            </span>
          </div>
          <div className="relative">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="appearance-none bg-nyx-surface border border-nyx-border text-nyx-text text-sm rounded px-3 py-2 pr-8 focus:outline-none focus:border-nyx-accent"
            >
              {agents.length === 0 && <option value="">No agents</option>}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.hostname} ({a.ip})</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-3 text-nyx-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div
        className="flex-1 bg-nyx-surface border border-nyx-border rounded-lg overflow-y-auto p-4 font-mono text-sm cursor-text"
        onClick={() => inputRef.current?.focus()}
        style={{ minHeight: 0 }}
      >
        {lines.map((line, i) => (
          <div key={i} className="flex gap-3 leading-6">
            {line.time && <span className="text-nyx-muted text-xs w-16 flex-shrink-0 pt-0.5">{line.time}</span>}
            <span className={`${lineStyle(line.type)} whitespace-pre-wrap break-all`}>{line.text}</span>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3 leading-6">
            <span className="text-nyx-muted text-xs w-16 flex-shrink-0" />
            <span className="text-nyx-yellow">
              <span className="animate-pulse">waiting for agent...</span>
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <div className="flex-1 flex items-center bg-nyx-surface border border-nyx-border rounded px-3 gap-2 focus-within:border-nyx-accent transition-colors">
          <span className="text-nyx-accent text-sm select-none">$</span>
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='sysinfo  |  shell whoami  |  ls /tmp  |  help'
            className="flex-1 bg-transparent text-nyx-text text-sm py-2.5 focus:outline-none placeholder:text-nyx-muted"
            autoFocus
          />
        </div>
        <button
          onClick={sendCommand}
          disabled={loading || !selectedAgent}
          className="bg-nyx-accent hover:bg-violet-700 disabled:opacity-40 text-white px-4 py-2 rounded transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
