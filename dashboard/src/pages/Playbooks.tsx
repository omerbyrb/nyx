import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Plus, Trash2, ChevronRight, RefreshCw, X, Check, Clock, AlertCircle } from "lucide-react";
import { api } from "../api/client";

interface PlaybookStep {
  id: string;
  name: string;
  command: string;
  on_fail: "abort" | "continue";
}

interface Playbook {
  id: string;
  name: string;
  description: string;
  category: string;
  steps: PlaybookStep[];
  tags: string[];
  built_in: boolean;
  created_at: string | null;
}

interface Execution {
  id: string;
  playbook_id: string;
  playbook_name: string;
  agent_id: string;
  status: string;
  task_id: string | null;
  task_status: string | null;
  task_output: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface Agent { id: string; hostname: string; username: string; os: string; is_active: boolean; }

// ── Colour tokens ──────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  recon:     "var(--accent)",
  privesc:   "#FFB800",
  creds:     "var(--red)",
  persist:   "#CC44FF",
  lateral:   "#00CCFF",
  container: "#FF6633",
};
const catColor = (c: string) => CAT_COLOR[c] ?? "var(--text-faint)";

const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

// ── Sub-components ─────────────────────────────────────────────────────────

function StepChain({ steps }: { steps: PlaybookStep[] }) {
  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex flex-col">
          <div
            className="flex items-start gap-3 p-3"
            style={{ background: "#060606", border: "1px solid #1A1A1A" }}
          >
            {/* index bubble */}
            <div
              className="flex-shrink-0 flex items-center justify-center text-xs font-bold"
              style={{
                width: 22, height: 22,
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                ...mono,
                fontSize: "10px",
              }}
            >
              {i + 1}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold mb-0.5" style={{ color: "var(--text)", ...mono }}>
                {step.name}
              </div>
              <div
                className="text-xs px-2 py-0.5 truncate"
                style={{ background: "#0A0A0A", color: "#00CC33", border: "1px solid #1A1A1A", ...mono }}
              >
                {step.command}
              </div>
            </div>

            <span
              className="flex-shrink-0 text-xs px-1.5 py-0.5"
              style={{
                color: step.on_fail === "abort" ? "var(--red)" : "var(--text-faint)",
                border: `1px solid ${step.on_fail === "abort" ? "rgba(255,51,51,0.3)" : "#1A1A1A"}`,
                background: step.on_fail === "abort" ? "rgba(255,51,51,0.05)" : "transparent",
                ...mono, fontSize: "9px",
              }}
            >
              {step.on_fail === "abort" ? "ABORT" : "CONT"}
            </span>
          </div>

          {i < steps.length - 1 && (
            <div className="flex justify-center" style={{ margin: 0 }}>
              <ChevronRight size={10} style={{ color: "var(--border)", transform: "rotate(90deg)" }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ExecStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <Check size={11} style={{ color: "var(--accent)" }} />;
  if (status === "failed")    return <X size={11} style={{ color: "var(--red)" }} />;
  return <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
    style={{ width: 11, height: 11, border: "1px solid #FFB800", borderTopColor: "transparent", borderRadius: "50%" }} />;
}

// ── Create Playbook Modal ─────────────────────────────────────────────────

const CATEGORIES = ["recon", "privesc", "creds", "persist", "lateral", "container"];

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("recon");
  const [steps, setSteps] = useState<PlaybookStep[]>([
    { id: "1", name: "Step 1", command: "", on_fail: "continue" },
  ]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const addStep = () =>
    setSteps(s => [...s, { id: String(s.length + 1), name: `Step ${s.length + 1}`, command: "", on_fail: "continue" }]);

  const removeStep = (idx: number) => setSteps(s => s.filter((_, i) => i !== idx));

  const updateStep = (idx: number, field: keyof PlaybookStep, val: string) =>
    setSteps(s => s.map((st, i) => i === idx ? { ...st, [field]: val } : st));

  const save = async () => {
    if (!name.trim() || steps.some(s => !s.command.trim())) {
      setErr("Name and all step commands are required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/api/playbooks", { name, description: desc, category: cat, steps, tags: [cat] });
      onCreated();
      onClose();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Failed to create");
    } finally { setSaving(false); }
  };

  const inputSt: React.CSSProperties = {
    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)",
    ...mono, fontSize: "12px", padding: "8px 10px", outline: "none", width: "100%",
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-2xl mx-4 p-5"
        style={{ background: "#080808", border: "1px solid var(--border)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold tracking-widest" style={{ color: "var(--accent)", ...mono }}>
            // CREATE_PLAYBOOK
          </span>
          <button onClick={onClose} style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer" }}>
            <X size={14} />
          </button>
        </div>

        {err && (
          <div className="flex items-center gap-2 px-3 py-2 mb-3 text-xs"
            style={{ background: "rgba(255,51,51,0.05)", border: "1px solid rgba(255,51,51,0.2)", color: "var(--red)", ...mono }}>
            <AlertCircle size={11} /> {err}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="playbook-name" style={inputSt} />
          <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inputSt, cursor: "pointer" }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="description (optional)" style={{ ...inputSt, marginBottom: "16px" }} />

        <div className="text-xs tracking-widest mb-2" style={{ color: "var(--text-faint)", ...mono }}>// STEPS</div>

        <div className="flex flex-col gap-2 mb-3">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-start">
              <div className="flex items-center justify-center text-xs flex-shrink-0"
                style={{ width: 22, height: 36, border: "1px solid var(--border)", color: "var(--text-faint)", ...mono, fontSize: "10px" }}>
                {i + 1}
              </div>
              <input value={step.name} onChange={e => updateStep(i, "name", e.target.value)}
                placeholder="step name" style={{ ...inputSt, flex: "0 0 140px" }} />
              <input value={step.command} onChange={e => updateStep(i, "command", e.target.value)}
                placeholder="command" style={{ ...inputSt, flex: 1 }} />
              <select value={step.on_fail} onChange={e => updateStep(i, "on_fail", e.target.value)}
                style={{ ...inputSt, flex: "0 0 90px", cursor: "pointer" }}>
                <option value="continue">cont</option>
                <option value="abort">abort</option>
              </select>
              <button onClick={() => removeStep(i)} disabled={steps.length === 1}
                style={{ color: steps.length === 1 ? "var(--border)" : "var(--text-faint)", background: "none", border: "none", cursor: steps.length === 1 ? "default" : "pointer", paddingTop: "8px" }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        <button onClick={addStep} className="w-full text-xs py-2 mb-4"
          style={{ background: "transparent", border: "1px dashed var(--border)", color: "var(--text-faint)", cursor: "pointer", ...mono }}>
          + ADD STEP
        </button>

        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.96 }} onClick={save} disabled={saving}
            className="btn-primary flex items-center gap-2 px-4 py-2">
            {saving
              ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  style={{ width: 10, height: 10, border: "1px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%" }} />
              : <Check size={11} />}
            SAVE
          </motion.button>
          <button onClick={onClose} className="btn-ghost px-4 py-2">CANCEL</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function Playbooks() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Playbook | null>(null);
  const [agentId, setAgentId] = useState("");
  const [running, setRunning] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"chain" | "history">("chain");
  const [loading, setLoading] = useState(true);
  const [execLoading, setExecLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [pbRes, execRes, agRes] = await Promise.allSettled([
      api.get<Playbook[]>("/api/playbooks/"),
      api.get<Execution[]>("/api/playbooks/executions"),
      api.get<Agent[]>("/api/agents/"),
    ]);
    if (pbRes.status === "fulfilled") {
      setPlaybooks(pbRes.value.data);
      if (!selected && pbRes.value.data.length > 0) setSelected(pbRes.value.data[0]);
    }
    if (execRes.status === "fulfilled") setExecutions(execRes.value.data);
    if (agRes.status === "fulfilled") setAgents(agRes.value.data.filter((a: Agent) => a.is_active));
    setLoading(false);
  }, [selected]);

  useEffect(() => { loadAll(); }, []);

  const runPlaybook = async () => {
    if (!selected || !agentId) return;
    setRunning(true);
    try {
      const res = await api.post(`/api/playbooks/${selected.id}/run?agent_id=${agentId}`, {});
      setTab("history");
      setExecLoading(true);
      // Poll for completion
      const poll = setInterval(async () => {
        const exRes = await api.get<Execution[]>("/api/playbooks/executions");
        setExecutions(exRes.data);
        const found = exRes.data.find((e: Execution) => (e as unknown as { execution_id?: string }).execution_id === (res.data as unknown as { execution_id: string }).execution_id || e.task_id === (res.data as unknown as { task_id: string }).task_id);
        if (found && (found.task_status === "completed" || found.task_status === "failed")) {
          clearInterval(poll);
          setExecLoading(false);
        }
      }, 2500);
      setTimeout(() => { clearInterval(poll); setExecLoading(false); }, 60000);
    } catch {}
    finally { setRunning(false); }
  };

  const deletePlaybook = async (pb: Playbook) => {
    if (pb.built_in || !confirm(`Delete playbook '${pb.name}'?`)) return;
    await api.delete(`/api/playbooks/${pb.id}`);
    loadAll();
    if (selected?.id === pb.id) setSelected(null);
  };

  const activeAgents = agents.filter(a => a.is_active);

  return (
    <div className="flex h-full" style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* ── Left: Playbook list ── */}
      <div className="w-60 flex-shrink-0 flex flex-col" style={{ borderRight: "1px solid var(--border)", background: "#040404" }}>
        <div className="px-4 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="text-xs font-bold tracking-widest" style={{ color: "var(--accent)", ...mono }}>
              // PLAYBOOKS
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text-faint)", ...mono }}>
              {playbooks.length} loaded
            </div>
          </div>
          <div className="flex items-center gap-1">
            <motion.button whileTap={{ scale: 0.9 }} onClick={loadAll}
              style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", padding: "4px" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}>
              <RefreshCw size={11} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowCreate(true)}
              style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", padding: "4px" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}>
              <Plus size={11} />
            </motion.button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading && (
            <div className="flex justify-center p-6">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                style={{ width: 14, height: 14, border: "1px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%" }} />
            </div>
          )}
          {!loading && playbooks.map(pb => {
            const active = selected?.id === pb.id;
            const cc = catColor(pb.category);
            return (
              <motion.button key={pb.id} whileTap={{ scale: 0.97 }}
                onClick={() => { setSelected(pb); setTab("chain"); }}
                className="w-full text-left px-3 py-2.5 relative"
                style={{
                  background: active ? "rgba(0,255,65,0.04)" : "transparent",
                  border: "none",
                  borderBottom: "1px solid #0F0F0F",
                  borderLeft: active ? `2px solid ${cc}` : "2px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.1s",
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.015)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-bold truncate" style={{ color: active ? cc : "var(--text-muted)", ...mono }}>
                    {pb.name}
                  </span>
                  {pb.built_in
                    ? <span className="text-xs flex-shrink-0" style={{ color: "var(--text-faint)", ...mono, fontSize: "9px" }}>BUILT_IN</span>
                    : (
                      <button onClick={e => { e.stopPropagation(); deletePlaybook(pb); }}
                        style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}>
                        <Trash2 size={10} />
                      </button>
                    )
                  }
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0" style={{
                    background: `${cc}0D`, color: cc, border: `1px solid ${cc}30`,
                    ...mono, fontSize: "9px",
                  }}>
                    {pb.category}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-faint)", ...mono, fontSize: "9px" }}>
                    {pb.steps.length} steps
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Center / Right: detail panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs" style={{ color: "var(--text-faint)", ...mono }}>Select a playbook</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="px-6 py-4 flex items-start justify-between flex-shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <h1 className="text-base font-bold tracking-widest" style={{ color: "var(--accent)", ...mono, textShadow: "0 0 8px rgba(0,255,65,0.4)" }}>
                  // {selected.name.toUpperCase().replace(/-/g, "_")}
                </h1>
                <p className="text-xs mt-1" style={{ color: "var(--text-faint)", ...mono }}>{selected.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  {selected.tags.map(t => (
                    <span key={t} className="text-xs px-1.5"
                      style={{ color: "var(--text-faint)", border: "1px solid #1A1A1A", ...mono, fontSize: "9px" }}>
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Run controls */}
              <div className="flex items-center gap-2 flex-shrink-0 ml-6">
                <select
                  value={agentId}
                  onChange={e => setAgentId(e.target.value)}
                  style={{
                    background: "var(--bg)", border: "1px solid var(--border)", color: agentId ? "var(--text)" : "var(--text-faint)",
                    ...mono, fontSize: "11px", padding: "6px 10px", outline: "none", cursor: "pointer",
                  }}
                >
                  <option value="">-- select agent --</option>
                  {activeAgents.map(a => (
                    <option key={a.id} value={a.id}>{a.hostname} ({a.os})</option>
                  ))}
                </select>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={runPlaybook}
                  disabled={running || !agentId}
                  className="flex items-center gap-2 px-4 py-2"
                  style={{
                    background: "transparent",
                    border: `1px solid ${agentId ? "var(--accent)" : "var(--border)"}`,
                    color: agentId ? "var(--accent)" : "var(--text-faint)",
                    cursor: agentId ? "pointer" : "default",
                    ...mono, fontSize: "11px",
                    textShadow: agentId ? "0 0 4px rgba(0,255,65,0.4)" : "none",
                    transition: "all 0.1s",
                  }}
                >
                  {running
                    ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        style={{ width: 11, height: 11, border: "1px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%" }} />
                    : <Play size={11} />}
                  RUN
                </motion.button>
              </div>
            </motion.div>

            {/* Tab bar */}
            <div className="flex flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              {(["chain", "history"] as const).map((t, i) => (
                <button key={t} onClick={() => setTab(t)}
                  className="px-5 py-2.5 text-xs"
                  style={{
                    background: "transparent",
                    border: "none",
                    borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
                    borderRight: i === 0 ? "1px solid var(--border)" : "none",
                    color: tab === t ? "var(--accent)" : "var(--text-faint)",
                    cursor: "pointer",
                    ...mono,
                    transition: "all 0.1s",
                  }}>
                  {t === "chain" ? `CHAIN (${selected.steps.length})` : `HISTORY (${executions.filter(e => e.playbook_id === selected.id).length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                {tab === "chain" && (
                  <motion.div key="chain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="p-6">
                    <StepChain steps={selected.steps} />
                    {activeAgents.length === 0 && (
                      <div className="mt-6 px-3 py-3 text-xs flex items-center gap-2"
                        style={{ background: "rgba(255,184,0,0.04)", border: "1px solid rgba(255,184,0,0.15)", color: "#FFB800", ...mono }}>
                        <AlertCircle size={11} /> No active agents — start an agent to run this playbook
                      </div>
                    )}
                  </motion.div>
                )}

                {tab === "history" && (
                  <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="p-6 space-y-3">
                    {execLoading && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs"
                        style={{ background: "rgba(0,255,65,0.03)", border: "1px solid rgba(0,255,65,0.15)", color: "var(--accent)", ...mono }}>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                          style={{ width: 10, height: 10, border: "1px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%" }} />
                        Executing playbook… waiting for agent
                      </div>
                    )}

                    {executions.filter(e => e.playbook_id === selected.id).length === 0 ? (
                      <div className="flex items-center justify-center py-16 text-xs" style={{ color: "var(--text-faint)", ...mono }}>
                        [ NO EXECUTIONS YET ]
                      </div>
                    ) : executions
                        .filter(e => e.playbook_id === selected.id)
                        .map(exe => (
                          <ExecCard key={exe.id} exe={exe} />
                        ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { loadAll(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Execution Card ─────────────────────────────────────────────────────────

function ExecCard({ exe }: { exe: Execution }) {
  const [open, setOpen] = useState(false);
  const statusColor = exe.task_status === "completed" ? "var(--accent)"
    : exe.task_status === "failed" ? "var(--red)"
    : "#FFB800";

  const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      <div
        className="cursor-pointer"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <ExecStatusIcon status={exe.task_status ?? exe.status} />
          <span className="text-xs font-bold flex-1 truncate" style={{ color: "var(--text)", ...mono }}>
            {exe.agent_id.slice(0, 8)}
          </span>
          <span className="text-xs" style={{ color: statusColor, ...mono }}>
            {exe.task_status ?? exe.status}
          </span>
          <span className="text-xs" style={{ color: "var(--text-faint)", ...mono }}>
            {exe.started_at ? new Date(exe.started_at).toLocaleString() : "—"}
          </span>
          <Clock size={10} style={{ color: "var(--border)" }} />
        </div>

        <AnimatePresence>
          {open && exe.task_output && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
              style={{
                ...mono, fontSize: "10px", color: "var(--text-muted)",
                background: "#050505", borderTop: "1px solid #1A1A1A",
                padding: "12px 16px", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                maxHeight: 480, overflowY: "auto",
              }}
            >
              {exe.task_output}
            </motion.pre>
          )}
          {open && !exe.task_output && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="px-4 py-3 text-xs" style={{ color: "var(--text-faint)", ...mono, borderTop: "1px solid #1A1A1A" }}>
              No output yet — agent may still be executing
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
