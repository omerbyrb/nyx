import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgents, createTask, createAgentWS, type Agent, type Task } from "../api/client";
import { Send, Wifi, WifiOff, ChevronDown } from "lucide-react";

interface Line { type: "cmd" | "output" | "error" | "info" | "system" | "screenshot"; text: string; time?: string; }

const HELP = `NYX C2 — Command Reference

  EXECUTION
  shell <cmd>              run a shell command
  sysinfo                  system information
  whoami / pwd / ls / cat / ps / env / arp

  NETWORK
  netstat                  active network connections
  ifconfig                 network interfaces
  portscan <host> [ports]  TCP port scanner
  hostscan <prefix>        host discovery

  LATERAL MOVEMENT
  ssh-exec <h:p> <u> <pw> <cmd>
  ssh-key-exec <h:p> <u> <k_b64> <cmd>

  CREDENTIAL HARVEST
  creds                    harvest SSH keys, history, .env, AWS, kube, git
  privesc                  enumerate privilege escalation vectors

  EXFILTRATION
  download <path>          exfiltrate file (base64)
  upload <path> <b64>      upload file to agent
  screenshot               capture agent screen

  INJECTION
  inject <pid> <sc_b64>    inject shellcode into process
  migrate <pid>            migrate agent into another process

  PERSISTENCE
  persist                  install persistence
  unpersist                remove persistence

  CONTROL
  sleep <sec>              set beacon interval
  kill                     terminate agent
  clear / help`.trim();

const lineColor = (type: string): string => {
  switch (type) {
    case "cmd":    return "#00FF41";
    case "output": return "#9A9A9A";
    case "error":  return "#FF3333";
    case "system": return "#FFB800";
    default:       return "#4A4A4A";
  }
};

export default function Console() {
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [selectedAgent, setAgent] = useState("");
  const [command, setCommand]     = useState("");
  const [lines, setLines]         = useState<Line[]>([
    { type: "system", text: "NYX C2 // INTERACTIVE SHELL v1.4.0" },
    { type: "info",   text: "Select an agent and type a command. Type 'help' for reference." },
  ]);
  const [loading, setLoading]  = useState(false);
  const [wsLive, setWsLive]    = useState(false);
  const [history, setHistory]  = useState<string[]>([]);
  const [histIdx, setHistIdx]  = useState(-1);
  const wsRef      = useRef<WebSocket | null>(null);
  const pendingRef = useRef<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAgents().then(d => {
      setAgents(d);
      if (d.length > 0 && !selectedAgent) setAgent(d[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    wsRef.current?.close();
    const ws = createAgentWS(selectedAgent);
    wsRef.current = ws;
    ws.onopen  = () => { setWsLive(true); push({ type: "system", text: `[WS_LIVE] agent ${selectedAgent.slice(0, 8)}` }); };
    ws.onclose = () => setWsLive(false);
    ws.onerror = () => setWsLive(false);
    ws.onmessage = e => {
      const ev = JSON.parse(e.data);
      if (ev.type === "task_update" && ev.task_id === pendingRef.current) {
        const out: string = ev.output || "(no output)";
        if (out.startsWith("SCREENSHOT:BASE64:")) {
          push({ type: "screenshot", text: out.replace("SCREENSHOT:BASE64:", "") });
        } else {
          push({ type: ev.status === "failed" ? "error" : "output", text: out });
        }
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
    const cmd   = command.trim();
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
            const out = res.output || "(no output)";
            if (out.startsWith("SCREENSHOT:BASE64:")) {
              push({ type: "screenshot", text: out.replace("SCREENSHOT:BASE64:", "") });
            } else {
              push({ type: res.status === "failed" ? "error" : "output", text: out });
            }
            setLoading(false);
            pendingRef.current = null;
            break;
          }
        }
      }
    } catch {
      push({ type: "error", text: "ERR: failed to dispatch task" });
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { send(); return; }
    if (e.key === "ArrowUp") {
      const i = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(i);
      setCommand(history[i] ?? "");
    }
    if (e.key === "ArrowDown") {
      const i = Math.max(histIdx - 1, -1);
      setHistIdx(i);
      setCommand(i === -1 ? "" : history[i]);
    }
  };

  return (
    <div
      className="flex flex-col"
      style={{ height: "100vh", padding: "24px", gap: "14px", background: "#000" }}
    >
      {/* Header bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between flex-shrink-0"
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
            // CONSOLE
          </h1>
          <p
            className="text-xs mt-0.5"
            style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
          >
            interactive agent shell
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* WS status */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs"
            style={{
              fontFamily: "'Fira Code', monospace",
              background: wsLive ? "rgba(0,255,65,0.05)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${wsLive ? "rgba(0,255,65,0.25)" : "#1F1F1F"}`,
              color: wsLive ? "#00FF41" : "#4A4A4A",
            }}
          >
            {wsLive ? <Wifi size={10} /> : <WifiOff size={10} />}
            {wsLive ? "WS_LIVE" : "POLLING"}
          </div>

          {/* Agent selector */}
          <div className="relative">
            <select
              value={selectedAgent}
              onChange={e => setAgent(e.target.value)}
              className="appearance-none input-base px-3 py-1.5 pr-7 text-xs"
            >
              {agents.length === 0 && <option value="">No agents</option>}
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.hostname} ({a.ip})</option>
              ))}
            </select>
            <ChevronDown
              size={11}
              className="absolute right-2 top-2 pointer-events-none"
              style={{ color: "#4A4A4A" }}
            />
          </div>
        </div>
      </motion.div>

      {/* Terminal output */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex-1 hud-panel p-4 overflow-y-auto cursor-text"
        style={{ minHeight: 0, fontFamily: "'Fira Code', monospace", fontSize: "12px" }}
        onClick={() => inputRef.current?.focus()}
      >
        <AnimatePresence initial={false}>
          {lines.map((l, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.12 }}
              className="flex gap-3 mb-1 leading-5"
            >
              <span
                className="w-14 flex-shrink-0 pt-0.5 select-none text-xs"
                style={{ color: "#1F1F1F" }}
              >
                {l.time}
              </span>
              {l.type === "screenshot" ? (
                <div className="flex flex-col gap-2">
                  <span style={{ color: "#00FF41", fontSize: "11px" }}>
                    [SCREENSHOT] captured
                  </span>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{ border: "1px solid #1F1F1F", maxWidth: 580, overflow: "hidden" }}
                  >
                    <img
                      src={`data:image/png;base64,${l.text}`}
                      alt="screenshot"
                      style={{ width: "100%", display: "block" }}
                    />
                  </motion.div>
                  <a
                    href={`data:image/png;base64,${l.text}`}
                    download="screenshot.png"
                    style={{ color: "#00FF41", fontSize: "10px" }}
                  >
                    ↓ download
                  </a>
                </div>
              ) : (
                <span
                  className="whitespace-pre-wrap break-all"
                  style={{ color: lineColor(l.type) }}
                >
                  {l.text}
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3 leading-5"
          >
            <span className="w-14 flex-shrink-0" />
            <span
              className="flex items-center gap-1.5"
              style={{ color: "#FFB800" }}
            >
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2 }}
                >
                  ▪
                </motion.span>
              ))}
              <span className="ml-1">waiting for agent</span>
            </span>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </motion.div>

      {/* Input bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex gap-2.5 flex-shrink-0"
      >
        <div
          className="flex-1 flex items-center gap-2.5 px-3"
          style={{
            background: "#000",
            border: "1px solid #1F1F1F",
            transition: "border-color 0.15s",
          }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = "#00FF41"; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = "#1F1F1F"; }}
        >
          <span
            className="select-none font-bold text-sm"
            style={{
              fontFamily: "'Fira Code', monospace",
              color: "#00FF41",
              textShadow: "0 0 4px rgba(0,255,65,0.5)",
            }}
          >
            $
          </span>
          <input
            ref={inputRef}
            value={command}
            onChange={e => setCommand(e.target.value)}
            onKeyDown={onKey}
            placeholder="sysinfo  ·  shell whoami  ·  ls /tmp  ·  help"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "'Fira Code', monospace",
              fontSize: "13px",
              color: "#E0E0E0",
              padding: "10px 0",
            }}
            className="placeholder:text-nyx-muted"
            autoFocus
          />
        </div>
        <motion.button
          onClick={send}
          disabled={loading || !selectedAgent}
          whileTap={{ scale: 0.94 }}
          className="btn-primary w-11 h-11 flex items-center justify-center flex-shrink-0"
        >
          <motion.span
            animate={loading ? { rotate: 360 } : {}}
            transition={loading ? { duration: 1, repeat: Infinity, ease: "linear" } : {}}
          >
            <Send size={13} />
          </motion.span>
        </motion.button>
      </motion.div>
    </div>
  );
}
