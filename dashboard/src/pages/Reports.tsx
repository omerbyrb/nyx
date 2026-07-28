import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getIOCReport, getYARARule } from "../api/client";
import { FileText, Shield, Download, Copy, Check, ChevronRight, AlertTriangle, Terminal } from "lucide-react";

type Tab = "ioc" | "yara";

interface TTP { id: string; name: string; }
interface IOCReport {
  generated_at: string; version: string;
  summary: { total_agents: number; active_agents: number; total_tasks: number; completed_tasks: number; failed_tasks: number; };
  indicators: { ips: string[]; hostnames: string[]; usernames: string[]; os_list: string[]; };
  agents: {
    id: string; hostname: string; username: string; os: string; arch: string; ip: string;
    first_seen: string; last_seen: string; task_count: number; completed_tasks: number;
    commands_run: string[]; file_downloads: string[]; persistence_installed: boolean;
    notes: string; tags: string;
  }[];
  ttps: TTP[];
}

function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
  navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
}

function TagPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color + "15", color, border: `1px solid ${color}30`,
      borderRadius: 2, padding: "1px 8px", fontSize: "0.7rem", fontWeight: 600,
      fontFamily: "'JetBrains Mono', monospace" }}>
      #{label}
    </span>
  );
}

export default function Reports() {
  const [tab, setTab]               = useState<Tab>("ioc");
  const [iocData, setIocData]       = useState<IOCReport | null>(null);
  const [yaraData, setYaraData]     = useState<string>("");
  const [loading, setLoading]       = useState(false);
  const [copiedIOC, setCopiedIOC]   = useState(false);
  const [copiedYARA, setCopiedYARA] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const fetchIOC  = async () => { setLoading(true); try { setIocData(await getIOCReport()); } catch {/* skip */} setLoading(false); };
  const fetchYARA = async () => { setLoading(true); try { const r = await getYARARule(); setYaraData(r.yara); } catch {/* skip */} setLoading(false); };

  const handleTab = (t: Tab) => {
    setTab(t);
    if (t === "ioc"  && !iocData)  fetchIOC();
    if (t === "yara" && !yaraData) fetchYARA();
  };

  const downloadJSON = () => {
    if (!iocData) return;
    const blob = new Blob([JSON.stringify(iocData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "nyx-ioc-report.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadYARA = () => {
    if (!yaraData) return;
    const blob = new Blob([yaraData], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "nyx-detection.yar"; a.click();
    URL.revokeObjectURL(url);
  };

  const Spinner = () => (
    <div className="flex items-center justify-center p-16">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        style={{ width: 20, height: 20, border: "1px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%" }} />
    </div>
  );

  return (
    <div className="flex flex-col" style={{ minHeight: "100vh", padding: "28px", gap: "20px", background: "var(--bg)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-widest uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
            // REPORTS
          </h1>
          <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
            IOC export · YARA rules · MITRE ATT&amp;CK mapping
          </p>
        </div>
        <div className="flex gap-2">
          {tab === "ioc" && iocData && (
            <>
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => copyToClipboard(JSON.stringify(iocData, null, 2), setCopiedIOC)}
                className="btn-ghost flex items-center gap-1.5 px-3 py-1.5">
                {copiedIOC ? <Check size={11} /> : <Copy size={11} />}
                {copiedIOC ? "COPIED" : "COPY JSON"}
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={downloadJSON}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5">
                <Download size={11} /> EXPORT JSON
              </motion.button>
            </>
          )}
          {tab === "yara" && yaraData && (
            <>
              <motion.button whileTap={{ scale: 0.97 }}
                onClick={() => copyToClipboard(yaraData, setCopiedYARA)}
                className="btn-ghost flex items-center gap-1.5 px-3 py-1.5">
                {copiedYARA ? <Check size={11} /> : <Copy size={11} />}
                {copiedYARA ? "COPIED" : "COPY YARA"}
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={downloadYARA}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5">
                <Download size={11} /> EXPORT .YAR
              </motion.button>
            </>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="flex flex-shrink-0" style={{ width: "fit-content", border: "1px solid var(--border)" }}>
        {([["ioc", "IOC_REPORT", FileText], ["yara", "YARA_RULES", Shield]] as [Tab, string, React.ElementType][]).map(([t, label, Icon]) => (
          <motion.button key={t} onClick={() => handleTab(t)}
            className="relative flex items-center gap-1.5 px-4 py-2 text-xs font-semibold"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: tab === t ? "rgba(0,255,65,0.06)" : "transparent",
              color: tab === t ? "var(--accent)" : "var(--text-faint)",
              borderRight: t === "ioc" ? "1px solid var(--border)" : "none",
              borderBottom: tab === t ? "1px solid var(--accent)" : "1px solid transparent",
              cursor: "pointer",
            }}>
            <Icon size={11} /> {label}
          </motion.button>
        ))}
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {tab === "ioc" && (
          <motion.div key="ioc" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
            className="flex flex-col gap-4">
            {!iocData && !loading && (
              <motion.button whileTap={{ scale: 0.99 }} onClick={fetchIOC}
                className="flex flex-col items-center gap-3 p-16 cursor-pointer"
                style={{ border: "1px dashed var(--border)", background: "transparent" }}>
                <FileText size={28} style={{ color: "var(--border)" }} />
                <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  Click to generate IOC report
                </p>
              </motion.button>
            )}
            {loading && <Spinner />}
            {iocData && !loading && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: "Total Agents",  value: iocData.summary.total_agents,    color: "var(--accent)" },
                    { label: "Active Agents", value: iocData.summary.active_agents,   color: "var(--accent)" },
                    { label: "Total Tasks",   value: iocData.summary.total_tasks,     color: "var(--text-muted)" },
                    { label: "Completed",     value: iocData.summary.completed_tasks, color: "var(--accent)" },
                    { label: "Failed",        value: iocData.summary.failed_tasks,    color: "var(--red)" },
                  ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }} className="hud-panel p-4">
                      <p className="text-xs mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        {s.label}
                      </p>
                      <p className="text-2xl font-black" style={{ fontFamily: "'JetBrains Mono', monospace",
                        color: s.color, textShadow: `0 0 8px ${s.color}40` }}>
                        {String(s.value).padStart(2, "0")}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* Indicators */}
                <div className="hud-panel p-5">
                  <h3 className="text-xs font-bold tracking-widest mb-4 flex items-center gap-2"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                    <AlertTriangle size={11} /> // NETWORK_INDICATORS
                  </h3>
                  <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: "IP_ADDRESSES", items: iocData.indicators.ips },
                      { label: "HOSTNAMES",    items: iocData.indicators.hostnames },
                      { label: "USERNAMES",    items: iocData.indicators.usernames },
                      { label: "OS_PLATFORMS", items: iocData.indicators.os_list },
                    ].map(({ label, items }) => (
                      <div key={label}>
                        <p className="text-xs mb-2 font-bold tracking-widest uppercase"
                          style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.length === 0
                            ? <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--border)" }}>—</span>
                            : items.map(v => (
                              <span key={v} className="text-xs px-2 py-0.5"
                                style={{ fontFamily: "'JetBrains Mono', monospace", background: "#050505",
                                  border: "1px solid var(--border)", color: "var(--text-faint)" }}>
                                {v}
                              </span>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* MITRE TTPs */}
                {iocData.ttps.length > 0 && (
                  <div className="hud-panel p-5">
                    <h3 className="text-xs font-bold tracking-widest mb-4 flex items-center gap-2"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                      <Shield size={11} /> // MITRE_ATT&CK_TTPS
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {iocData.ttps.map(ttp => (
                        <motion.div key={ttp.id} whileHover={{ scale: 1.02 }}
                          className="flex items-center gap-2 px-3 py-2"
                          style={{ background: "#050505", border: "1px solid var(--border)" }}>
                          <span className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                            {ttp.id}
                          </span>
                          <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                            {ttp.name}
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent breakdown */}
                <div className="hud-panel p-5">
                  <h3 className="text-xs font-bold tracking-widest mb-4 flex items-center gap-2"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                    <Terminal size={11} /> // COMPROMISED_HOSTS ({iocData.agents.length})
                  </h3>
                  <div className="flex flex-col gap-2">
                    {iocData.agents.map((a, i) => (
                      <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}>
                        <motion.button
                          onClick={() => setExpandedAgent(expandedAgent === a.id ? null : a.id)}
                          className="w-full flex items-center gap-3 p-3 text-left"
                          style={{ border: "1px solid var(--border)", background: "transparent", cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                          <motion.span animate={{ rotate: expandedAgent === a.id ? 90 : 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                            <ChevronRight size={11} style={{ color: "var(--text-faint)" }} />
                          </motion.span>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                            background: a.persistence_installed ? "var(--red)" : "var(--accent)",
                            boxShadow: a.persistence_installed ? "0 0 4px var(--red)" : "0 0 4px var(--accent)" }} />
                          <span className="text-xs font-bold flex-1"
                            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                            {a.hostname}
                          </span>
                          <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                            {a.ip}
                          </span>
                          <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                            {a.os}/{a.arch}
                          </span>
                          <span className="text-xs px-2 py-0.5"
                            style={{ fontFamily: "'JetBrains Mono', monospace", background: "#050505",
                              border: "1px solid var(--border)", color: "var(--text-faint)" }}>
                            {a.task_count} tasks
                          </span>
                          {a.persistence_installed && <TagPill label="persistence" color="var(--red)" />}
                          {a.tags && a.tags.split(",").filter(Boolean).map(t => <TagPill key={t} label={t.trim()} color="var(--text-muted)" />)}
                        </motion.button>
                        <AnimatePresence>
                          {expandedAgent === a.id && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
                              className="overflow-hidden">
                              <div className="p-4 text-xs flex flex-col gap-2"
                                style={{ fontFamily: "'JetBrains Mono', monospace", background: "#050505",
                                  border: "1px solid var(--border)", borderTop: "none" }}>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                                  {[
                                    ["User",       a.username],
                                    ["First seen", new Date(a.first_seen).toLocaleString()],
                                    ["Agent ID",   a.id.slice(0, 16) + "…"],
                                    ["Last seen",  new Date(a.last_seen).toLocaleString()],
                                  ].map(([label, val]) => (
                                    <span key={label}>
                                      <span style={{ color: "var(--text-faint)" }}>{label}: </span>
                                      <span style={{ color: "var(--text-muted)" }}>{val}</span>
                                    </span>
                                  ))}
                                </div>
                                {a.commands_run.length > 0 && (
                                  <div>
                                    <p className="mb-1" style={{ color: "var(--text-faint)" }}>
                                      Commands run ({a.commands_run.length}):
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {[...new Set(a.commands_run)].map((c, ci) => (
                                        <span key={ci} className="px-2 py-0.5"
                                          style={{ background: "rgba(0,255,65,0.05)", color: "var(--accent)",
                                            border: "1px solid rgba(0,255,65,0.15)" }}>{c}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {a.file_downloads.length > 0 && (
                                  <div>
                                    <p className="mb-1" style={{ color: "var(--text-faint)" }}>Files exfiltrated:</p>
                                    <div className="flex flex-col gap-0.5">
                                      {a.file_downloads.map((f, fi) => (
                                        <span key={fi} style={{ color: "var(--red)" }}>↑ {f}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {a.notes && (
                                  <p>
                                    <span style={{ color: "var(--text-faint)" }}>Notes: </span>
                                    <span style={{ color: "var(--text-muted)" }}>{a.notes}</span>
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}

        {tab === "yara" && (
          <motion.div key="yara" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
            className="flex flex-col gap-4">
            {!yaraData && !loading && (
              <motion.button whileTap={{ scale: 0.99 }} onClick={fetchYARA}
                className="flex flex-col items-center gap-3 p-16 cursor-pointer"
                style={{ border: "1px dashed var(--border)", background: "transparent" }}>
                <Shield size={28} style={{ color: "var(--border)" }} />
                <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  Click to generate YARA rules
                </p>
              </motion.button>
            )}
            {loading && <Spinner />}
            {yaraData && !loading && (
              <div className="hud-panel" style={{ overflow: "hidden" }}>
                <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs font-bold tracking-widest flex items-center gap-2"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                    <Shield size={11} /> nyx-detection.yar
                  </span>
                  <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {yaraData.split("\n").length} lines
                  </span>
                </div>
                <pre className="overflow-auto p-5 text-xs leading-6"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)", maxHeight: "70vh" }}>
                  <YaraHighlight source={yaraData} />
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function YaraHighlight({ source }: { source: string }) {
  const lines = source.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        let color = "var(--text-faint)";
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("/*") || line.trimStart().startsWith("*"))
          color = "var(--text-faint)";
        else if (/^rule /.test(line)) color = "var(--accent)";
        else if (/^\s+(meta:|strings:|condition:)$/.test(line)) color = "var(--text-muted)";
        else if (/^\s+\$/.test(line)) color = "#00CC33";
        else if (/^\s+(description|author|date|severity|platform|reference)\s*=/.test(line)) color = "#FFB800";
        return <span key={i} style={{ color, display: "block" }}>{line || " "}</span>;
      })}
    </>
  );
}
