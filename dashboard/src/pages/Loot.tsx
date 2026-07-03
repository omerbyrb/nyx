import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api/client";
import { Package, Key, Camera, Terminal, Wifi, AlertTriangle, Download, ChevronRight, RefreshCw } from "lucide-react";

type Tab = "files" | "screenshots" | "creds" | "privesc" | "scans" | "ssh";

interface LootSummary { files: number; screenshots: number; creds: number; privesc: number; scans: number; ssh_results: number; }
interface FileEntry { task_id: string; agent: string; filename: string; size_bytes: number; b64: string; timestamp: string; source_path: string; }
interface Screenshot { task_id: string; agent: string; b64: string; timestamp: string; }
interface CredSection { path: string; category: string; lines: string[]; }
interface CredEntry { task_id: string; agent: string; timestamp: string; raw: string; sections: CredSection[]; }
interface PrivescEntry { task_id: string; agent: string; timestamp: string; raw: string; critical: string[]; }
interface ScanEntry { task_id: string; agent: string; command: string; timestamp: string; output: string; open_ports: { port: number; service: string }[]; }
interface SshEntry { task_id: string; agent: string; command: string; output: string; timestamp: string; }

interface LootData {
  summary: LootSummary;
  files: FileEntry[];
  screenshots: Screenshot[];
  creds: CredEntry[];
  privesc: PrivescEntry[];
  scans: ScanEntry[];
  ssh_results: SshEntry[];
}

const tabs: { id: Tab; label: string; icon: React.ElementType; key: keyof LootSummary }[] = [
  { id: "files",       label: "Files",       icon: Package,       key: "files" },
  { id: "screenshots", label: "Screenshots", icon: Camera,        key: "screenshots" },
  { id: "creds",       label: "Credentials", icon: Key,           key: "creds" },
  { id: "privesc",     label: "PrivEsc",     icon: AlertTriangle, key: "privesc" },
  { id: "scans",       label: "Scans",       icon: Wifi,          key: "scans" },
  { id: "ssh",         label: "SSH Exec",    icon: Terminal,      key: "ssh_results" },
];

function downloadB64(b64: string, filename: string) {
  const a = document.createElement("a");
  a.href = `data:application/octet-stream;base64,${b64}`;
  a.download = filename;
  a.click();
}

function fmt(ts: string) { return ts ? new Date(ts).toLocaleString() : "—"; }
function bytes(n: number) { return n > 1024*1024 ? `${(n/1024/1024).toFixed(1)} MB` : n > 1024 ? `${(n/1024).toFixed(1)} KB` : `${n} B`; }

export default function Loot() {
  const [loot, setLoot] = useState<LootData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("files");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setLoot((await api.get<LootData>("/api/loot/")).data); }
    catch { /* server offline */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const count = (k: keyof LootSummary) => loot?.summary[k] ?? 0;

  return (
    <div className="flex flex-col bg-nyx-bg" style={{ minHeight: "100vh", padding: "28px", gap: "20px" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white"
            style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <Package size={14} className="text-nyx-accent" />
          </div>
          <div>
            <h1 className="text-nyx-text text-xl font-bold tracking-tight"
              style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Loot</h1>
            <p className="text-nyx-muted text-xs mt-0.5">Harvested files · credentials · scans · screenshots</p>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={load}
          className="btn-ghost flex items-center gap-2 px-3 py-2 rounded-xl text-sm">
          <motion.span animate={loading ? { rotate: 360 } : {}} transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}>
            <RefreshCw size={13} />
          </motion.span> Refresh
        </motion.button>
      </motion.div>

      {/* Summary chips */}
      {loot && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-6 gap-3">
          {tabs.map(({ id, label, icon: Icon, key }) => (
            <motion.button key={id} onClick={() => setTab(id)}
              whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
              className="flex flex-col gap-1 p-3 rounded-xl text-left"
              style={tab === id
                ? { background: "#EEF2FF", border: "1px solid rgba(30,60,184,0.25)" }
                : { background: "#FFFFFF", border: "1px solid #E5DDD0" }}>
              <Icon size={13} style={{ color: tab === id ? "#1E3CB8" : "#8C95A8" }} />
              <span className="text-2xl font-bold mono" style={{ color: tab === id ? "#1E3CB8" : "#0C0F1A" }}>
                {count(key)}
              </span>
              <span className="text-xs text-nyx-muted">{label}</span>
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center p-16">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-6 h-6 rounded-full border-2 border-nyx-accent border-t-transparent" />
        </div>
      )}

      <AnimatePresence mode="wait">
        {!loading && loot && (
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }} className="flex flex-col gap-3">

            {/* FILES */}
            {tab === "files" && (
              loot.files.length === 0 ? <Empty label="No files downloaded yet" /> :
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
                <div className="grid text-xs font-semibold text-nyx-muted uppercase tracking-wide px-5 py-3"
                  style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto", borderBottom: "1px solid #F0EBE3", letterSpacing: "0.07em" }}>
                  <span>Filename / Path</span><span>Agent</span><span>Size</span><span>Time</span><span></span>
                </div>
                {loot.files.map((f, i) => (
                  <motion.div key={f.task_id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="grid items-center px-5 py-3 hover:bg-nyx-bg transition-colors"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto", borderBottom: "1px solid #F8F6F1" }}>
                    <div>
                      <p className="mono text-sm font-semibold text-nyx-text">{f.filename}</p>
                      <p className="mono text-xs text-nyx-muted mt-0.5">{f.source_path}</p>
                    </div>
                    <span className="mono text-xs text-nyx-muted">{f.agent}</span>
                    <span className="mono text-xs text-nyx-muted">{bytes(f.size_bytes)}</span>
                    <span className="mono text-xs text-nyx-muted">{fmt(f.timestamp)}</span>
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      onClick={() => downloadB64(f.b64, f.filename)}
                      className="p-1.5 rounded-lg hover:bg-nyx-bg transition-colors" title="Download">
                      <Download size={13} className="text-nyx-accent" />
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            )}

            {/* SCREENSHOTS */}
            {tab === "screenshots" && (
              loot.screenshots.length === 0 ? <Empty label="No screenshots captured yet" /> :
              <div className="grid grid-cols-2 gap-4">
                {loot.screenshots.map((s, i) => (
                  <motion.div key={s.task_id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                    className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
                    <img src={`data:image/png;base64,${s.b64}`} alt="screenshot" className="w-full" />
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid #F0EBE3" }}>
                      <div>
                        <p className="mono text-xs font-semibold text-nyx-text">{s.agent}</p>
                        <p className="mono text-xs text-nyx-muted">{fmt(s.timestamp)}</p>
                      </div>
                      <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={() => downloadB64(s.b64, `screenshot-${s.agent}-${s.task_id.slice(0,8)}.png`)}
                        className="p-1.5 rounded-lg hover:bg-nyx-bg">
                        <Download size={13} className="text-nyx-accent" />
                      </motion.button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* CREDENTIALS */}
            {tab === "creds" && (
              loot.creds.length === 0 ? <Empty label="No credentials harvested yet — run 'creds' on an agent" /> :
              <div className="flex flex-col gap-3">
                {loot.creds.map((c) => (
                  <div key={c.task_id} className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
                    <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #F0EBE3" }}>
                      <span className="font-semibold text-sm text-nyx-text flex items-center gap-2">
                        <Key size={13} className="text-nyx-accent" /> {c.agent}
                      </span>
                      <span className="mono text-xs text-nyx-muted">{fmt(c.timestamp)}</span>
                    </div>
                    {c.sections.map((sec, si) => (
                      <div key={si}>
                        <motion.button
                          onClick={() => setExpanded(expanded === `${c.task_id}-${si}` ? null : `${c.task_id}-${si}`)}
                          className="w-full flex items-center gap-2 px-5 py-2.5 text-left hover:bg-nyx-bg transition-colors"
                          style={{ borderBottom: "1px solid #F8F6F1" }}>
                          <motion.span animate={{ rotate: expanded === `${c.task_id}-${si}` ? 90 : 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                            <ChevronRight size={12} className="text-nyx-muted" />
                          </motion.span>
                          <span className="mono text-xs font-bold px-2 py-0.5 rounded"
                            style={{ background: "#EEF2FF", color: "#1E3CB8" }}>{sec.category}</span>
                          <span className="mono text-xs text-nyx-muted">{sec.path}</span>
                        </motion.button>
                        <AnimatePresence>
                          {expanded === `${c.task_id}-${si}` && (
                            <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                              className="overflow-hidden mono text-xs px-5 py-3 overflow-x-auto"
                              style={{ background: "#F8F6F1", color: "#0C0F1A", maxHeight: 400, overflowY: "auto" }}>
                              {sec.lines.join("\n")}
                            </motion.pre>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* PRIVESC */}
            {tab === "privesc" && (
              loot.privesc.length === 0 ? <Empty label="No privesc data yet — run 'privesc' on an agent" /> :
              <div className="flex flex-col gap-3">
                {loot.privesc.map((p) => (
                  <div key={p.task_id} className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
                    <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #F0EBE3" }}>
                      <span className="font-semibold text-sm text-nyx-text flex items-center gap-2">
                        <AlertTriangle size={13} style={{ color: p.critical.length > 0 ? "#B82828" : "#8C95A8" }} />
                        {p.agent}
                        {p.critical.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded font-bold"
                            style={{ background: "#FEF2F2", color: "#B82828", border: "1px solid rgba(184,40,40,0.2)" }}>
                            {p.critical.length} critical
                          </span>
                        )}
                      </span>
                      <span className="mono text-xs text-nyx-muted">{fmt(p.timestamp)}</span>
                    </div>
                    {p.critical.length > 0 && (
                      <div className="px-5 py-3 flex flex-col gap-1" style={{ borderBottom: "1px solid #F0EBE3" }}>
                        {p.critical.map((c, ci) => (
                          <p key={ci} className="mono text-xs font-bold" style={{ color: "#B82828" }}>{c}</p>
                        ))}
                      </div>
                    )}
                    <pre className="px-5 py-3 mono text-xs overflow-x-auto" style={{ color: "#0C0F1A", maxHeight: 400, overflowY: "auto" }}>
                      {p.raw}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {/* SCANS */}
            {tab === "scans" && (
              loot.scans.length === 0 ? <Empty label="No scans yet — run 'portscan' or 'hostscan' on an agent" /> :
              <div className="flex flex-col gap-3">
                {loot.scans.map((s) => (
                  <div key={s.task_id} className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
                    <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #F0EBE3" }}>
                      <span className="font-semibold text-sm text-nyx-text flex items-center gap-2">
                        <Wifi size={13} className="text-nyx-accent" />
                        <span className="mono">{s.command}</span>
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-nyx-muted">{s.agent}</span>
                        <span className="mono text-xs text-nyx-muted">{fmt(s.timestamp)}</span>
                      </div>
                    </div>
                    {s.open_ports.length > 0 && (
                      <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: "1px solid #F0EBE3" }}>
                        {s.open_ports.map(p => (
                          <span key={p.port} className="mono text-xs px-2 py-1 rounded-lg font-semibold"
                            style={{ background: "#EDFAF4", color: "#0A6B4A", border: "1px solid rgba(10,107,74,0.2)" }}>
                            {p.port}/{p.service}
                          </span>
                        ))}
                      </div>
                    )}
                    <pre className="px-5 py-3 mono text-xs overflow-x-auto" style={{ color: "#0C0F1A", maxHeight: 300, overflowY: "auto" }}>
                      {s.output}
                    </pre>
                  </div>
                ))}
              </div>
            )}

            {/* SSH */}
            {tab === "ssh" && (
              loot.ssh_results.length === 0 ? <Empty label="No SSH exec results yet — run 'ssh-exec' on an agent" /> :
              <div className="flex flex-col gap-3">
                {loot.ssh_results.map((s) => (
                  <div key={s.task_id} className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
                    <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #F0EBE3" }}>
                      <span className="font-semibold text-sm text-nyx-text flex items-center gap-2">
                        <Terminal size={13} className="text-nyx-accent" />
                        <span className="mono text-xs">{s.command}</span>
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-nyx-muted">{s.agent}</span>
                        <span className="mono text-xs text-nyx-muted">{fmt(s.timestamp)}</span>
                      </div>
                    </div>
                    <pre className="px-5 py-3 mono text-xs overflow-x-auto" style={{ color: "#0C0F1A", maxHeight: 300, overflowY: "auto" }}>
                      {s.output}
                    </pre>
                  </div>
                ))}
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-3 p-12 bg-white rounded-2xl"
      style={{ border: "1px dashed #E5DDD0" }}>
      <Package size={28} style={{ color: "#E5DDD0" }} />
      <p className="text-nyx-muted text-sm">{label}</p>
    </motion.div>
  );
}
