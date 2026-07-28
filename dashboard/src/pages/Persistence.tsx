import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Trash2, RefreshCw, Plus, AlertTriangle, CheckCircle } from "lucide-react";
import { api } from "../api/client";

interface PersistEntry {
  id: string; agent_id: string; mech_type: string; name: string;
  payload: string; trigger: string; status: string; created_at: string; removed_at: string | null;
}

interface Summary { total_active: number; by_type: Record<string, number>; by_agent: Record<string, number>; }

const MECH_META: Record<string, { label: string; color: string; icon: string }> = {
  reg:         { label: "Registry Run",   color: "var(--accent)", icon: "🗝" },
  svc:         { label: "Service",        color: "var(--red)", icon: "⚙" },
  task:        { label: "Sched. Task",    color: "#FFB800", icon: "🕐" },
  startup:     { label: "Startup Folder", color: "var(--text-muted)", icon: "📂" },
  wmi:         { label: "WMI Event",      color: "var(--accent)", icon: "🔌" },
  launchagent: { label: "LaunchAgent",    color: "var(--text-muted)", icon: "🍎" },
  cron:        { label: "Cron",           color: "var(--text-muted)", icon: "⏰" },
};

const MECH_TYPES = Object.keys(MECH_META);

export default function Persistence() {
  const [entries, setEntries]   = useState<PersistEntry[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterType, setFilterType]   = useState("");
  const [showActive, setShowActive]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState({ agent_id: "", mech_type: "reg", name: "", payload: "", trigger: "ONLOGON" });
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entRes, sumRes] = await Promise.all([
        api.get("/api/persistence/"),
        api.get("/api/persistence/summary"),
      ]);
      setEntries(entRes.data);
      setSummary(sumRes.data);
    } catch { showToast("Failed to load persistence data", false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (id: string) => {
    try { await api.delete(`/api/persistence/${id}`); showToast("Entry removed"); load(); }
    catch { showToast("Failed to remove entry", false); }
  };

  const handleAdd = async () => {
    if (!form.agent_id || !form.name) { showToast("Agent ID and Name are required", false); return; }
    try {
      await api.post("/api/persistence/", form);
      showToast("Entry recorded");
      setShowAdd(false);
      setForm({ agent_id: "", mech_type: "reg", name: "", payload: "", trigger: "ONLOGON" });
      load();
    } catch { showToast("Failed to record entry", false); }
  };

  const filtered = entries.filter(e => {
    if (showActive && e.status !== "active") return false;
    if (!showActive && e.status !== "removed") return false;
    if (filterAgent && !e.agent_id.includes(filterAgent)) return false;
    if (filterType && e.mech_type !== filterType) return false;
    return true;
  });

  const inputStyle = {
    background: "var(--bg)", border: "1px solid var(--border)",
    color: "var(--text)", fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px", padding: "6px 10px", outline: "none", width: "100%",
  };

  return (
    <div className="p-6" style={{ background: "var(--bg)", minHeight: "100%" }}>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 text-xs font-medium"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: toast.ok ? "rgba(0,255,65,0.08)" : "rgba(255,51,51,0.08)",
              border: `1px solid ${toast.ok ? "rgba(0,255,65,0.3)" : "rgba(255,51,51,0.3)"}`,
              color: toast.ok ? "var(--accent)" : "var(--red)",
            }}>
            {toast.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-widest uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
            // PERSISTENCE
          </h1>
          <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
            Registry · Service · Scheduled Task · WMI · Startup — per-agent tracker
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-1.5 px-3 py-1.5">
            <Plus size={12} /> RECORD
          </button>
          <button onClick={load} className="btn-ghost flex items-center gap-1.5 px-3 py-1.5">
            <RefreshCw size={12} /> REFRESH
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))" }}>
          <div className="hud-panel p-4">
            <div className="text-3xl font-black" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)", textShadow: "0 0 10px rgba(0,255,65,0.4)" }}>
              {summary.total_active}
            </div>
            <div className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              Active Mechanisms
            </div>
          </div>
          {Object.entries(summary.by_type).map(([type, count]) => {
            const meta = MECH_META[type] ?? { label: type, color: "var(--text-muted)", icon: "?" };
            return (
              <div key={type} className="hud-panel p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span>{meta.icon}</span>
                  <span className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: meta.color }}>{meta.label}</span>
                </div>
                <div className="text-2xl font-black" style={{ fontFamily: "'JetBrains Mono', monospace", color: meta.color }}>{count}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-5">
            <div className="hud-panel p-5">
              <div className="text-xs font-bold mb-4 tracking-widest flex items-center gap-2"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                <Shield size={12} /> RECORD_PERSISTENCE
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "AGENT_ID", key: "agent_id", placeholder: "e.g. a3f12b8e-..." },
                  { label: "NAME", key: "name", placeholder: "WindowsUpdate" },
                  { label: "PAYLOAD", key: "payload", placeholder: "C:\\Windows\\Temp\\agent.exe", span: true },
                ].map(f => (
                  <div key={f.key} className={f.span ? "col-span-2" : ""}>
                    <label className="block text-xs mb-1 tracking-widest"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      {f.label}
                    </label>
                    <input style={inputStyle} placeholder={f.placeholder}
                      value={(form as Record<string, string>)[f.key]}
                      onChange={e => setForm(f2 => ({ ...f2, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs mb-1 tracking-widest"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    MECH_TYPE
                  </label>
                  <select style={inputStyle} value={form.mech_type}
                    onChange={e => setForm(f => ({ ...f, mech_type: e.target.value }))}>
                    {MECH_TYPES.map(t => <option key={t} value={t}>{MECH_META[t].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1 tracking-widest"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    TRIGGER
                  </label>
                  <select style={inputStyle} value={form.trigger}
                    onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}>
                    {["ONLOGON", "ONSTART", "DAILY", "HOURLY", "ONIDLE", ""].map(t => (
                      <option key={t} value={t}>{t || "(none)"}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={handleAdd} className="btn-primary px-4 py-1.5">SAVE</button>
                <button onClick={() => setShowAdd(false)} className="btn-ghost px-4 py-1.5">CANCEL</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex overflow-hidden text-xs" style={{ border: "1px solid var(--border)" }}>
          {[["Active", true], ["Removed", false]].map(([label, val]) => (
            <button key={String(label)} onClick={() => setShowActive(val as boolean)}
              className="px-3 py-1.5"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: showActive === val ? "rgba(0,255,65,0.08)" : "transparent",
                color: showActive === val ? "var(--accent)" : "var(--text-faint)",
                border: "none", cursor: "pointer",
              }}>
              {label}
            </button>
          ))}
        </div>
        <input style={{ ...inputStyle, width: "auto", flex: "0 0 200px" }}
          placeholder="Filter by agent ID..."
          value={filterAgent} onChange={e => setFilterAgent(e.target.value)} />
        <select style={{ ...inputStyle, width: "auto", flex: "0 0 150px" }}
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {MECH_TYPES.map(t => <option key={t} value={t}>{MECH_META[t].label}</option>)}
        </select>
        <span className="text-xs ml-auto" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
          {filtered.length} entries
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
          LOADING...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
          {showActive ? "[ NO ACTIVE MECHANISMS ]" : "[ NO REMOVED ENTRIES ]"}
        </div>
      ) : (
        <div className="hud-panel" style={{ overflow: "hidden" }}>
          <div className="grid px-4 py-2.5"
            style={{ gridTemplateColumns: "110px 90px 160px 1fr 100px 80px",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
              color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.08em",
              borderBottom: "1px solid var(--border)" }}>
            <div>Type</div><div>Agent</div><div>Name</div><div>Payload</div><div>Trigger</div><div>Action</div>
          </div>
          {filtered.map((e, i) => {
            const meta = MECH_META[e.mech_type] ?? { label: e.mech_type, color: "var(--text-muted)", icon: "?" };
            return (
              <motion.div key={e.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="grid px-4 py-3 items-center"
                style={{
                  gridTemplateColumns: "110px 90px 160px 1fr 100px 80px",
                  borderTop: "1px solid var(--border)",
                  opacity: e.status === "removed" ? 0.4 : 1,
                }}>
                <div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold"
                    style={{ background: `${meta.color}10`, color: meta.color, border: `1px solid ${meta.color}30`, fontSize: 10,
                      fontFamily: "'JetBrains Mono', monospace" }}>
                    {meta.label}
                  </span>
                </div>
                <div className="text-xs truncate" title={e.agent_id}
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  {e.agent_id.slice(0, 8)}...
                </div>
                <div className="text-xs font-semibold truncate"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                  {e.name}
                </div>
                <div className="text-xs truncate" title={e.payload}
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  {e.payload || "—"}
                </div>
                <div className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  {e.trigger || "—"}
                </div>
                <div>
                  {e.status === "active" ? (
                    <button onClick={() => handleRemove(e.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)",
                        background: "none", border: "none", cursor: "pointer",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}>
                      <Trash2 size={10} /> REMOVE
                    </button>
                  ) : (
                    <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      REMOVED
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Command reference */}
      <div className="mt-8 hud-panel" style={{ overflow: "hidden" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="text-xs font-bold tracking-widest"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
            // PHASE_6_COMMAND_REFERENCE
          </div>
          <div className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
            AD attacks &amp; persistence commands for the agent console
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          {[
            { cat: "AD / CREDENTIAL", color: "var(--red)", cmds: [
              { cmd: "lsass-dump [out_path]", desc: "MiniDumpWriteDump → LSASS memory dump" },
              { cmd: "pth <domain> <user> <hash> <cmd>", desc: "Pass-the-Hash via NetOnly logon" },
              { cmd: "ptt <base64_kirbi>", desc: "Pass-the-Ticket — inject .kirbi into LSA" },
              { cmd: "dcsync-local [out_dir]", desc: "Save SAM/SYSTEM/SECURITY for offline parse" },
              { cmd: "dcsync-domain [out_dir]", desc: "VSS snapshot NTDS.dit + SYSTEM (Domain Admin)" },
            ]},
            { cat: "PERSISTENCE", color: "var(--accent)", cmds: [
              { cmd: "persist-reg <name> <payload>", desc: "HKCU\\Run registry key" },
              { cmd: "persist-svc <name> <bin_path>", desc: "Windows service (auto-start)" },
              { cmd: "persist-task <name> <cmd> [trigger]", desc: "Scheduled task (schtasks.exe)" },
              { cmd: "persist-startup <name> <src>", desc: "Copy to Startup folder" },
              { cmd: "persist-wmi <name> <cmd>", desc: "WMI event subscription (60s interval)" },
              { cmd: "persist-remove <type> <name>", desc: "Remove: reg|svc|task|startup|wmi" },
              { cmd: "persist-list", desc: "Enumerate all persistence on host" },
            ]},
          ].map(section => (
            <div key={section.cat}>
              <div className="text-xs font-bold mb-2 tracking-widest"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: section.color, textTransform: "uppercase" }}>
                // {section.cat}
              </div>
              {section.cmds.map(({ cmd, desc }) => (
                <div key={cmd} className="mb-2">
                  <code className="block text-xs px-2 py-1"
                    style={{ fontFamily: "'JetBrains Mono', monospace", background: "#050505",
                      border: "1px solid var(--border)", color: "var(--accent)" }}>
                    {cmd}
                  </code>
                  <span className="text-xs mt-0.5 block"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
