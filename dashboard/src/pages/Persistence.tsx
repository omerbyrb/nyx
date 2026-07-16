import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Trash2, RefreshCw, Plus, AlertTriangle, CheckCircle } from "lucide-react";
import { api } from "../api/client";

interface PersistEntry {
  id: string;
  agent_id: string;
  mech_type: string;
  name: string;
  payload: string;
  trigger: string;
  status: string;
  created_at: string;
  removed_at: string | null;
}

interface Summary {
  total_active: number;
  by_type: Record<string, number>;
  by_agent: Record<string, number>;
}

const MECH_META: Record<string, { label: string; color: string; icon: string }> = {
  reg:         { label: "Registry Run",    color: "#1E3CB8", icon: "🗝" },
  svc:         { label: "Service",         color: "#B82828", icon: "⚙" },
  task:        { label: "Sched. Task",     color: "#B86428", icon: "🕐" },
  startup:     { label: "Startup Folder",  color: "#6B2FB8", icon: "📂" },
  wmi:         { label: "WMI Event",       color: "#0A6B4A", icon: "🔌" },
  launchagent: { label: "LaunchAgent",     color: "#888888", icon: "🍎" },
  cron:        { label: "Cron",            color: "#888888", icon: "⏰" },
};

const MECH_TYPES = Object.keys(MECH_META);

export default function Persistence() {
  const [entries, setEntries]     = useState<PersistEntry[]>([]);
  const [summary, setSummary]     = useState<Summary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterType, setFilterType]   = useState("");
  const [showActive, setShowActive]   = useState(true);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState({ agent_id: "", mech_type: "reg", name: "", payload: "", trigger: "ONLOGON" });
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

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
    } catch {
      showToast("Failed to load persistence data", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (id: string) => {
    try {
      await api.delete(`/api/persistence/${id}`);
      showToast("Entry marked as removed");
      load();
    } catch {
      showToast("Failed to remove entry", false);
    }
  };

  const handleAdd = async () => {
    if (!form.agent_id || !form.name) {
      showToast("Agent ID and Name are required", false);
      return;
    }
    try {
      await api.post("/api/persistence/", form);
      showToast("Persistence entry recorded");
      setShowAdd(false);
      setForm({ agent_id: "", mech_type: "reg", name: "", payload: "", trigger: "ONLOGON" });
      load();
    } catch {
      showToast("Failed to record entry", false);
    }
  };

  const filtered = entries.filter(e => {
    if (showActive && e.status !== "active") return false;
    if (!showActive && e.status !== "removed") return false;
    if (filterAgent && !e.agent_id.includes(filterAgent)) return false;
    if (filterType && e.mech_type !== filterType) return false;
    return true;
  });

  return (
    <div className="p-6">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium"
            style={{ background: toast.ok ? "#0A6B4A" : "#B82828" }}
          >
            {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-nyx-text" style={{ letterSpacing: "-0.02em" }}>
            Persistence
          </h1>
          <p className="text-sm text-nyx-muted mt-0.5">
            Registry · Service · Scheduled Task · WMI · Startup — per-agent tracker
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold"
            style={{ background: "#1E3CB8" }}
          >
            <Plus size={13} /> Record
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-nyx-bg border border-nyx-border text-nyx-muted text-xs font-semibold"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 mb-6" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
          <div className="bg-white rounded-2xl border border-nyx-border p-4">
            <div className="text-3xl font-black" style={{ color: "#1E3CB8" }}>{summary.total_active}</div>
            <div className="text-xs text-nyx-muted mt-1">Active Mechanisms</div>
          </div>
          {Object.entries(summary.by_type).map(([type, count]) => {
            const meta = MECH_META[type] ?? { label: type, color: "#888", icon: "❓" };
            return (
              <div key={type} className="bg-white rounded-2xl border border-nyx-border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span>{meta.icon}</span>
                  <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
                </div>
                <div className="text-2xl font-black" style={{ color: meta.color }}>{count}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-5"
          >
            <div className="bg-white rounded-2xl border border-nyx-border p-5">
              <div className="text-sm font-bold text-nyx-text mb-4 flex items-center gap-2">
                <Shield size={14} /> Record Persistence Mechanism
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-nyx-muted mb-1">Agent ID</label>
                  <input
                    className="w-full border border-nyx-border rounded-xl px-3 py-2 text-xs mono focus:outline-none focus:border-nyx-accent"
                    placeholder="e.g. a3f12b8e-..."
                    value={form.agent_id}
                    onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-nyx-muted mb-1">Mechanism Type</label>
                  <select
                    className="w-full border border-nyx-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-nyx-accent"
                    value={form.mech_type}
                    onChange={e => setForm(f => ({ ...f, mech_type: e.target.value }))}
                  >
                    {MECH_TYPES.map(t => (
                      <option key={t} value={t}>{MECH_META[t].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-nyx-muted mb-1">Name / Key</label>
                  <input
                    className="w-full border border-nyx-border rounded-xl px-3 py-2 text-xs mono focus:outline-none focus:border-nyx-accent"
                    placeholder="WindowsUpdate"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-nyx-muted mb-1">Trigger</label>
                  <select
                    className="w-full border border-nyx-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-nyx-accent"
                    value={form.trigger}
                    onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
                  >
                    {["ONLOGON", "ONSTART", "DAILY", "HOURLY", "ONIDLE", ""].map(t => (
                      <option key={t} value={t}>{t || "(none)"}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-nyx-muted mb-1">Payload / Path</label>
                  <input
                    className="w-full border border-nyx-border rounded-xl px-3 py-2 text-xs mono focus:outline-none focus:border-nyx-accent"
                    placeholder="C:\Windows\Temp\agent.exe"
                    value={form.payload}
                    onChange={e => setForm(f => ({ ...f, payload: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
                  style={{ background: "#1E3CB8" }}
                >
                  Save Entry
                </button>
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 rounded-xl bg-nyx-bg border border-nyx-border text-nyx-muted text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-xl overflow-hidden border border-nyx-border text-xs font-semibold">
          <button
            onClick={() => setShowActive(true)}
            className="px-3 py-2"
            style={{ background: showActive ? "#1E3CB8" : "#fff", color: showActive ? "#fff" : "#8C95A8" }}
          >
            Active
          </button>
          <button
            onClick={() => setShowActive(false)}
            className="px-3 py-2"
            style={{ background: !showActive ? "#888" : "#fff", color: !showActive ? "#fff" : "#8C95A8" }}
          >
            Removed
          </button>
        </div>

        <input
          className="border border-nyx-border rounded-xl px-3 py-2 text-xs mono w-52 focus:outline-none"
          placeholder="Filter by agent ID..."
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
        />

        <select
          className="border border-nyx-border rounded-xl px-3 py-2 text-xs w-40 focus:outline-none"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">All types</option>
          {MECH_TYPES.map(t => <option key={t} value={t}>{MECH_META[t].label}</option>)}
        </select>

        <span className="text-xs text-nyx-muted ml-auto">{filtered.length} entries</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-nyx-muted text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-nyx-muted text-sm">
          {showActive ? "No active persistence mechanisms recorded." : "No removed entries."}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-nyx-border overflow-hidden">
          <div
            className="grid px-4 py-3"
            style={{
              gridTemplateColumns: "110px 90px 160px 1fr 100px 80px",
              background: "#F8F6F1",
              fontSize: 9, fontWeight: 700, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.08em"
            }}
          >
            <div>Type</div>
            <div>Agent</div>
            <div>Name</div>
            <div>Payload</div>
            <div>Trigger</div>
            <div>Action</div>
          </div>
          {filtered.map((e, i) => {
            const meta = MECH_META[e.mech_type] ?? { label: e.mech_type, color: "#888", icon: "❓" };
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="grid px-4 py-3 items-center"
                style={{
                  gridTemplateColumns: "110px 90px 160px 1fr 100px 80px",
                  borderTop: "1px solid #F0EDE6",
                  opacity: e.status === "removed" ? 0.5 : 1,
                }}
              >
                <div>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-bold"
                    style={{ background: meta.color, fontSize: 10 }}
                  >
                    {meta.icon} {meta.label}
                  </span>
                </div>
                <div className="font-mono text-xs text-nyx-muted truncate" title={e.agent_id}>
                  {e.agent_id.slice(0, 8)}...
                </div>
                <div className="font-semibold text-xs text-nyx-text truncate">{e.name}</div>
                <div className="font-mono text-xs text-nyx-muted truncate" title={e.payload}>{e.payload || "—"}</div>
                <div className="text-xs text-nyx-muted">{e.trigger || "—"}</div>
                <div>
                  {e.status === "active" ? (
                    <button
                      onClick={() => handleRemove(e.id)}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-nyx-red hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={11} /> Remove
                    </button>
                  ) : (
                    <span className="text-xs text-nyx-muted">Removed</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* AD Command Reference */}
      <div className="mt-8 bg-white rounded-2xl border border-nyx-border overflow-hidden">
        <div className="px-5 py-4 border-b border-nyx-border">
          <div className="text-sm font-bold text-nyx-text">Phase 6 Command Reference</div>
          <div className="text-xs text-nyx-muted mt-0.5">AD attacks & persistence commands for the agent console</div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          {[
            { cat: "AD / Credential", color: "#B82828", cmds: [
              { cmd: "lsass-dump [out_path]",                   desc: "MiniDumpWriteDump → LSASS memory dump" },
              { cmd: "pth <domain> <user> <hash> <cmd>",        desc: "Pass-the-Hash via NetOnly logon" },
              { cmd: "ptt <base64_kirbi>",                      desc: "Pass-the-Ticket — inject .kirbi into LSA" },
              { cmd: "dcsync-local [out_dir]",                  desc: "Save SAM/SYSTEM/SECURITY for offline parse" },
              { cmd: "dcsync-domain [out_dir]",                 desc: "VSS snapshot NTDS.dit + SYSTEM (Domain Admin)" },
            ]},
            { cat: "Persistence", color: "#1E3CB8", cmds: [
              { cmd: "persist-reg <name> <payload>",            desc: "HKCU\\Run registry key" },
              { cmd: "persist-svc <name> <bin_path>",           desc: "Windows service (auto-start)" },
              { cmd: "persist-task <name> <cmd> [trigger]",     desc: "Scheduled task (schtasks.exe)" },
              { cmd: "persist-startup <name> <src>",            desc: "Copy to Startup folder" },
              { cmd: "persist-wmi <name> <cmd>",                desc: "WMI event subscription (60s interval)" },
              { cmd: "persist-remove <type> <name>",            desc: "Remove: reg|svc|task|startup|wmi" },
              { cmd: "persist-list",                            desc: "Enumerate all persistence on host" },
            ]},
          ].map(section => (
            <div key={section.cat}>
              <div className="text-xs font-bold mb-2" style={{ color: section.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {section.cat}
              </div>
              {section.cmds.map(({ cmd, desc }) => (
                <div key={cmd} className="mb-2">
                  <code className="block text-xs rounded px-2 py-1 font-mono" style={{ background: "#F8F6F1", color: "#1A1A2E" }}>
                    {cmd}
                  </code>
                  <span className="text-xs text-nyx-muted mt-0.5 block">{desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
