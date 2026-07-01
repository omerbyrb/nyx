import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getIOCReport, getYARARule } from "../api/client";
import { FileText, Shield, Download, Copy, Check, ChevronRight, AlertTriangle, Terminal } from "lucide-react";

type Tab = "ioc" | "yara";

interface TTP { id: string; name: string; }
interface IOCReport {
  generated_at: string;
  version: string;
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
  navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  });
}

const pill = (label: string, color: string) => (
  <span key={label} style={{ background: color + "15", color, border: `1px solid ${color}30`, borderRadius: 6, padding: "1px 8px", fontSize: "0.7rem", fontWeight: 600 }}>
    {label}
  </span>
);

export default function Reports() {
  const [tab, setTab] = useState<Tab>("ioc");
  const [iocData, setIocData] = useState<IOCReport | null>(null);
  const [yaraData, setYaraData] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copiedIOC, setCopiedIOC] = useState(false);
  const [copiedYARA, setCopiedYARA] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const fetchIOC = async () => {
    setLoading(true);
    try { setIocData(await getIOCReport()); } catch { /* skip */ }
    setLoading(false);
  };

  const fetchYARA = async () => {
    setLoading(true);
    try { const r = await getYARARule(); setYaraData(r.yara); } catch { /* skip */ }
    setLoading(false);
  };

  const handleTab = (t: Tab) => {
    setTab(t);
    if (t === "ioc" && !iocData) fetchIOC();
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

  return (
    <div className="flex flex-col bg-nyx-bg" style={{ minHeight: "100vh", padding: "28px", gap: "20px" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white"
            style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <FileText size={14} className="text-nyx-accent" />
          </div>
          <div>
            <h1 className="text-nyx-text text-xl font-bold tracking-tight"
              style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>
              Reports
            </h1>
            <p className="text-nyx-muted text-xs mt-0.5">IOC export · YARA rules · MITRE ATT&CK mapping</p>
          </div>
        </div>
        <div className="flex gap-2">
          {tab === "ioc" && iocData && (
            <>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => copyToClipboard(JSON.stringify(iocData, null, 2), setCopiedIOC)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white"
                style={{ border: "1px solid #E5DDD0", color: "#0C0F1A" }}>
                {copiedIOC ? <Check size={12} /> : <Copy size={12} />}
                {copiedIOC ? "Copied" : "Copy JSON"}
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={downloadJSON}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold">
                <Download size={12} /> Export JSON
              </motion.button>
            </>
          )}
          {tab === "yara" && yaraData && (
            <>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => copyToClipboard(yaraData, setCopiedYARA)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white"
                style={{ border: "1px solid #E5DDD0", color: "#0C0F1A" }}>
                {copiedYARA ? <Check size={12} /> : <Copy size={12} />}
                {copiedYARA ? "Copied" : "Copy YARA"}
              </motion.button>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={downloadYARA}
                className="btn-primary flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold">
                <Download size={12} /> Export .yar
              </motion.button>
            </>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="flex gap-1 p-1 rounded-xl bg-white flex-shrink-0"
        style={{ border: "1px solid #E5DDD0", width: "fit-content" }}>
        {([["ioc", "IOC Report", FileText], ["yara", "YARA Rules", Shield]] as [Tab, string, React.ElementType][]).map(([t, label, Icon]) => (
          <motion.button key={t} onClick={() => handleTab(t)}
            className="relative flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            style={{ color: tab === t ? "#1E3CB8" : "#8C95A8" }}>
            {tab === t && (
              <motion.div layoutId="report-tab-active" className="absolute inset-0 rounded-lg"
                style={{ background: "#EEF2FF", border: "1px solid rgba(30,60,184,0.2)" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }} />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon size={13} /> {label}
            </span>
          </motion.button>
        ))}
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {tab === "ioc" && (
          <motion.div key="ioc" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }} className="flex flex-col gap-4">
            {!iocData && !loading && (
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={fetchIOC}
                className="flex flex-col items-center gap-3 p-12 rounded-2xl bg-white cursor-pointer"
                style={{ border: "1px dashed #E5DDD0" }}>
                <FileText size={32} style={{ color: "#E5DDD0" }} />
                <p className="text-nyx-muted text-sm">Click to generate IOC report</p>
              </motion.button>
            )}
            {loading && (
              <div className="flex items-center justify-center p-12">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-6 h-6 rounded-full border-2 border-nyx-accent border-t-transparent" />
              </div>
            )}
            {iocData && !loading && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { label: "Total Agents", value: iocData.summary.total_agents, color: "#1E3CB8" },
                    { label: "Active Agents", value: iocData.summary.active_agents, color: "#0A6B4A" },
                    { label: "Total Tasks", value: iocData.summary.total_tasks, color: "#6B46C1" },
                    { label: "Completed", value: iocData.summary.completed_tasks, color: "#0A6B4A" },
                    { label: "Failed", value: iocData.summary.failed_tasks, color: "#B82828" },
                  ].map((s, i) => (
                    <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="bg-white rounded-xl p-4" style={{ border: "1px solid #E5DDD0" }}>
                      <p className="text-nyx-muted text-xs mb-1">{s.label}</p>
                      <p className="text-2xl font-bold" style={{ color: s.color, fontFamily: "Geist Mono, monospace" }}>{s.value}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Indicators */}
                <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E5DDD0" }}>
                  <h3 className="font-semibold text-nyx-text text-sm mb-4 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-nyx-accent" /> Network Indicators
                  </h3>
                  <div className="grid grid-cols-2 gap-6">
                    {[
                      { label: "IP Addresses", items: iocData.indicators.ips },
                      { label: "Hostnames", items: iocData.indicators.hostnames },
                      { label: "Usernames", items: iocData.indicators.usernames },
                      { label: "OS Platforms", items: iocData.indicators.os_list },
                    ].map(({ label, items }) => (
                      <div key={label}>
                        <p className="text-nyx-muted text-xs mb-2 font-semibold uppercase tracking-wide">{label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.length === 0 ? <span className="text-nyx-muted text-xs">—</span> :
                            items.map(v => (
                              <span key={v} className="mono text-xs px-2 py-0.5 rounded-md"
                                style={{ background: "#F4F2EE", border: "1px solid #E5DDD0", color: "#0C0F1A" }}>{v}</span>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* MITRE TTPs */}
                {iocData.ttps.length > 0 && (
                  <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E5DDD0" }}>
                    <h3 className="font-semibold text-nyx-text text-sm mb-4 flex items-center gap-2">
                      <Shield size={14} className="text-nyx-accent" /> MITRE ATT&CK TTPs Observed
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {iocData.ttps.map(ttp => (
                        <motion.div key={ttp.id} whileHover={{ scale: 1.02 }}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl"
                          style={{ background: "#F4F2EE", border: "1px solid #E5DDD0" }}>
                          <span className="mono text-xs font-bold" style={{ color: "#1E3CB8" }}>{ttp.id}</span>
                          <span className="text-xs text-nyx-muted">{ttp.name}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agent breakdown */}
                <div className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E5DDD0" }}>
                  <h3 className="font-semibold text-nyx-text text-sm mb-4 flex items-center gap-2">
                    <Terminal size={14} className="text-nyx-accent" /> Compromised Hosts ({iocData.agents.length})
                  </h3>
                  <div className="flex flex-col gap-2">
                    {iocData.agents.map((a, i) => (
                      <motion.div key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}>
                        <motion.button
                          onClick={() => setExpandedAgent(expandedAgent === a.id ? null : a.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-nyx-bg transition-colors"
                          style={{ border: "1px solid #F0EBE3" }}>
                          <motion.span animate={{ rotate: expandedAgent === a.id ? 90 : 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                            <ChevronRight size={13} className="text-nyx-muted" />
                          </motion.span>
                          <div className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: a.persistence_installed ? "#B82828" : "#0A6B4A" }} />
                          <span className="mono text-sm font-semibold text-nyx-text flex-1">{a.hostname}</span>
                          <span className="mono text-xs text-nyx-muted">{a.ip}</span>
                          <span className="text-xs text-nyx-muted">{a.os} / {a.arch}</span>
                          <span className="mono text-xs px-2 py-0.5 rounded"
                            style={{ background: "#F4F2EE", color: "#8C95A8" }}>
                            {a.task_count} tasks
                          </span>
                          {a.persistence_installed && pill("persistence", "#B82828")}
                          {a.tags && a.tags.split(",").filter(Boolean).map(t => pill(t.trim(), "#6B46C1"))}
                        </motion.button>
                        <AnimatePresence>
                          {expandedAgent === a.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="p-4 rounded-xl mt-1 mono text-xs flex flex-col gap-2"
                                style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
                                <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                                  <span><span className="text-nyx-muted">User: </span><span className="text-nyx-text">{a.username}</span></span>
                                  <span><span className="text-nyx-muted">First seen: </span><span className="text-nyx-text">{new Date(a.first_seen).toLocaleString()}</span></span>
                                  <span><span className="text-nyx-muted">Agent ID: </span><span className="text-nyx-text">{a.id.slice(0, 16)}…</span></span>
                                  <span><span className="text-nyx-muted">Last seen: </span><span className="text-nyx-text">{new Date(a.last_seen).toLocaleString()}</span></span>
                                </div>
                                {a.commands_run.length > 0 && (
                                  <div>
                                    <p className="text-nyx-muted mb-1">Commands run ({a.commands_run.length}):</p>
                                    <div className="flex flex-wrap gap-1">
                                      {[...new Set(a.commands_run)].map((c, ci) => (
                                        <span key={ci} className="px-2 py-0.5 rounded"
                                          style={{ background: "#EEF2FF", color: "#1E3CB8", border: "1px solid rgba(30,60,184,0.2)" }}>{c}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {a.file_downloads.length > 0 && (
                                  <div>
                                    <p className="text-nyx-muted mb-1">Files exfiltrated:</p>
                                    <div className="flex flex-col gap-0.5">
                                      {a.file_downloads.map((f, fi) => (
                                        <span key={fi} style={{ color: "#B82828" }}>↑ {f}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {a.notes && <p><span className="text-nyx-muted">Notes: </span><span className="text-nyx-text">{a.notes}</span></p>}
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
          <motion.div key="yara" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }} className="flex flex-col gap-4">
            {!yaraData && !loading && (
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={fetchYARA}
                className="flex flex-col items-center gap-3 p-12 rounded-2xl bg-white cursor-pointer"
                style={{ border: "1px dashed #E5DDD0" }}>
                <Shield size={32} style={{ color: "#E5DDD0" }} />
                <p className="text-nyx-muted text-sm">Click to generate YARA rules</p>
              </motion.button>
            )}
            {loading && (
              <div className="flex items-center justify-center p-12">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-6 h-6 rounded-full border-2 border-nyx-accent border-t-transparent" />
              </div>
            )}
            {yaraData && !loading && (
              <div className="bg-white rounded-2xl" style={{ border: "1px solid #E5DDD0" }}>
                <div className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: "1px solid #F0EBE3" }}>
                  <span className="text-sm font-semibold text-nyx-text flex items-center gap-2">
                    <Shield size={13} className="text-nyx-accent" /> nyx-detection.yar
                  </span>
                  <span className="mono text-xs text-nyx-muted">{yaraData.split("\n").length} lines</span>
                </div>
                <pre className="overflow-auto p-5 mono text-xs leading-6"
                  style={{ color: "#0C0F1A", maxHeight: "70vh" }}>
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
        let color = "#0C0F1A";
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("/*") || line.trimStart().startsWith("*")) color = "#8C95A8";
        else if (/^rule /.test(line)) color = "#1E3CB8";
        else if (/^\s+(meta:|strings:|condition:)$/.test(line)) color = "#6B46C1";
        else if (/^\s+\$/.test(line)) color = "#0A6B4A";
        else if (/^\s+(description|author|date|severity|platform|reference)\s*=/.test(line)) color = "#A85F0A";
        return <span key={i} style={{ color, display: "block" }}>{line || " "}</span>;
      })}
    </>
  );
}
