import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Shield, Cpu, AlertTriangle, RefreshCw, ExternalLink, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { api } from "../api/client";

interface IntelEvent {
  id: string; timestamp: string; agent_id: string; task_id: string;
  command: string; command_type: string; output_preview: string; status: string;
  mitre_id: string; mitre_name: string; mitre_tactic: string; mitre_url: string;
  opsec_score: number; opsec_label: string; opsec_notes: string; opsec_color: string;
}
interface OpsecAgent {
  agent_id: string; hostname: string; username: string;
  cumulative: number; event_count: number; high_risk: IntelEvent[];
}
interface MitreTech { id: string; name: string; tactic: string; url: string; count: number; order: number; }
interface GeoAgent {
  agent_id: string; hostname: string; ip: string;
  country: string; country_code: string; city: string;
  isp: string; lat: number; lon: number; flag: string; status: string;
}
interface Stats {
  total_events: number; high_risk_24h: number;
  tactics_used: number; techniques_used: number; plugins_loaded: number;
}

const TACTIC_COLORS: Record<string, string> = {
  "Execution":           "var(--accent)", "Persistence":       "var(--text-muted)",
  "Privilege Escalation":"var(--red)", "Defense Evasion":   "#FFB800",
  "Credential Access":   "var(--red)", "Discovery":         "#00CC33",
  "Lateral Movement":    "var(--accent)", "Collection":        "var(--text-muted)",
  "Command and Control": "var(--text-faint)", "Exfiltration":      "var(--red)",
  "Impact":              "var(--red)",
};

function ScoreBadge({ score, color }: { score: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-center justify-center text-xs font-black px-2 py-0.5"
      style={{ fontFamily: "'JetBrains Mono', monospace", background: color + "20", color, border: `1px solid ${color}40`, minWidth: "2.5rem" }}>
      {score}/10
    </span>
  );
}

function TacticPill({ tactic }: { tactic: string }) {
  const color = TACTIC_COLORS[tactic] ?? "var(--text-faint)";
  return (
    <span className="inline-block px-2 py-0.5 text-xs font-semibold"
      style={{ fontFamily: "'JetBrains Mono', monospace", background: color + "10",
        color, border: `1px solid ${color}30`, fontSize: "9px" }}>
      {tactic}
    </span>
  );
}

function EventRow({ ev }: { ev: IntelEvent }) {
  const [open, setOpen] = useState(false);
  const ts   = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "";
  const date = ev.timestamp ? new Date(ev.timestamp).toLocaleDateString() : "";

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: "none", border: "none", cursor: "pointer" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
        <ScoreBadge score={ev.opsec_score} label={ev.opsec_label} color={ev.opsec_color} />
        <span className="text-xs font-semibold truncate flex-shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)", width: "9rem" }}>
          {ev.command_type}
        </span>
        {ev.mitre_tactic && <TacticPill tactic={ev.mitre_tactic} />}
        {ev.mitre_id && (
          <span className="text-xs hidden sm:block flex-shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
            {ev.mitre_id}
          </span>
        )}
        <span className="text-xs truncate flex-1 hidden md:block" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
          {ev.agent_id?.slice(0, 8)}
        </span>
        <span className="text-xs flex-shrink-0 hidden sm:block" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
          {date} {ts}
        </span>
        {open ? <ChevronUp size={11} style={{ color: "var(--text-faint)" }} /> : <ChevronDown size={11} style={{ color: "var(--text-faint)" }} />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3">
              <div className="px-3 py-2 text-xs"
                style={{ fontFamily: "'JetBrains Mono', monospace", background: "var(--bg)",
                  border: "1px solid var(--border)", color: "var(--text)" }}>
                {ev.command}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {ev.mitre_id && (
                  <div className="p-3" style={{ background: "#050505", border: "1px solid var(--border)" }}>
                    <p className="text-xs font-bold tracking-widest mb-1"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      MITRE ATT&CK
                    </p>
                    <p className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                      {ev.mitre_id}
                    </p>
                    <p className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      {ev.mitre_name}
                    </p>
                    {ev.mitre_url && (
                      <a href={ev.mitre_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs mt-1"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: "#00CC33" }}>
                        View on ATT&CK <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                )}
                <div className="p-3" style={{ background: "#050505", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-bold tracking-widest mb-1"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    OPSEC
                  </p>
                  <div className="flex items-center gap-2 mb-1">
                    <ScoreBadge score={ev.opsec_score} label={ev.opsec_label} color={ev.opsec_color} />
                    <span className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      {ev.opsec_label}
                    </span>
                  </div>
                  <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {ev.opsec_notes}
                  </p>
                </div>
              </div>
              {ev.output_preview && (
                <div>
                  <p className="text-xs mb-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    Output Preview
                  </p>
                  <pre className="text-xs p-3 overflow-x-auto"
                    style={{ fontFamily: "'JetBrains Mono', monospace", background: "var(--bg)",
                      border: "1px solid var(--border)", color: "var(--text-muted)", maxHeight: "8rem" }}>
                    {ev.output_preview}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Intelligence() {
  const [tab, setTab]         = useState<"timeline"|"opsec"|"mitre"|"geo"|"plugins">("timeline");
  const [events, setEvents]   = useState<IntelEvent[]>([]);
  const [opsec, setOpsec]     = useState<OpsecAgent[]>([]);
  const [mitre, setMitre]     = useState<{ techniques: MitreTech[]; tactic_totals: Record<string,number>; total_events: number } | null>(null);
  const [geo, setGeo]         = useState<GeoAgent[]>([]);
  const [plugins, setPlugins] = useState<{ name: string; version: string; hooks: string[] }[]>([]);
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterTactic, setFilterTactic] = useState("");
  const [filterScore, setFilterScore]   = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, opsecRes, mitreRes, geoRes, plugRes, statRes] = await Promise.allSettled([
        api.get<IntelEvent[]>(`/api/intel/timeline?limit=100${filterTactic ? `&tactic=${filterTactic}` : ""}${filterScore > 0 ? `&min_score=${filterScore}` : ""}`),
        api.get<OpsecAgent[]>("/api/intel/opsec"),
        api.get("/api/intel/mitre"),
        api.get<GeoAgent[]>("/api/intel/geo"),
        api.get<{ plugins: typeof plugins }>("/api/intel/plugins"),
        api.get<Stats>("/api/intel/stats"),
      ]);
      if (evRes.status    === "fulfilled") setEvents(evRes.value.data);
      if (opsecRes.status === "fulfilled") setOpsec(opsecRes.value.data);
      if (mitreRes.status === "fulfilled") setMitre(mitreRes.value.data);
      if (geoRes.status   === "fulfilled") setGeo(geoRes.value.data);
      if (plugRes.status  === "fulfilled") setPlugins(plugRes.value.data.plugins);
      if (statRes.status  === "fulfilled") setStats(statRes.value.data);
    } finally { setLoading(false); }
  }, [filterTactic, filterScore]);

  useEffect(() => { load(); }, [load]);

  const reloadPlugins = async () => { await api.post("/api/intel/plugins/reload"); load(); };
  const tactics = [...new Set(events.map(e => e.mitre_tactic).filter(Boolean))].sort();

  const selectStyle = {
    background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-faint)",
    fontFamily: "'JetBrains Mono', monospace", fontSize: "11px",
    padding: "6px 10px", outline: "none",
  };

  const emptyPanel = (msg: string) => (
    <div className="hud-panel py-16 text-center text-xs"
      style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
      {msg}
    </div>
  );

  return (
    <div className="p-6 space-y-5" style={{ minHeight: "100%", background: "var(--bg)" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-widest uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
              // INTELLIGENCE
            </h1>
            <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              Kill chain timeline · OPSEC scoring · ATT&amp;CK heatmap · GeoIP
            </p>
          </div>
          <motion.button onClick={load} whileTap={{ scale: 0.95 }} className="btn-ghost flex items-center gap-2 px-3 py-1.5">
            <motion.span animate={loading ? { rotate: 360 } : {}}
              transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: "linear" }}>
              <RefreshCw size={12} />
            </motion.span>
            REFRESH
          </motion.button>
        </div>
      </motion.div>

      {/* Stats bar */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-5 gap-3">
          {[
            { label: "Total Events",    value: stats.total_events,    icon: Activity,      color: "var(--accent)" },
            { label: "High Risk (24h)", value: stats.high_risk_24h,   icon: AlertTriangle, color: "var(--red)" },
            { label: "Tactics",         value: stats.tactics_used,    icon: Shield,        color: "var(--text-muted)" },
            { label: "Techniques",      value: stats.techniques_used, icon: Zap,           color: "#FFB800" },
            { label: "Plugins",         value: stats.plugins_loaded,  icon: Cpu,           color: "#00CC33" },
          ].map(({ label, value, icon: Icon, color }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="hud-panel p-4 flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0"
                style={{ width: 30, height: 30, border: `1px solid ${color}20`, background: color + "08" }}>
                <Icon size={13} style={{ color }} />
              </div>
              <div>
                <div className="text-lg font-black leading-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color, textShadow: `0 0 8px ${color}40` }}>
                  {value}
                </div>
                <div className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{label}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Tab bar */}
      <div className="flex" style={{ border: "1px solid var(--border)", width: "fit-content" }}>
        {(["timeline", "opsec", "mitre", "geo", "plugins"] as const).map((t, i) => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 text-xs font-semibold capitalize"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              background: tab === t ? "rgba(0,255,65,0.06)" : "transparent",
              color: tab === t ? "var(--accent)" : "var(--text-faint)",
              borderTop: "none", borderLeft: "none",
              borderRight: i < 4 ? "1px solid var(--border)" : "none",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
            }}>
            {t === "mitre" ? "ATT&CK" : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* TIMELINE */}
      {tab === "timeline" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex gap-3 mb-4">
            <select value={filterTactic} onChange={e => setFilterTactic(e.target.value)} style={{ ...selectStyle, minWidth: "10rem" }}>
              <option value="">All Tactics</option>
              {tactics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterScore} onChange={e => setFilterScore(Number(e.target.value))} style={selectStyle}>
              <option value={0}>All OPSEC Scores</option>
              <option value={5}>≥ 5 (Medium+)</option>
              <option value={7}>≥ 7 (High+)</option>
              <option value={9}>≥ 9 (Critical)</option>
            </select>
            <button onClick={load} className="btn-primary px-4 py-1.5 text-xs">APPLY</button>
          </div>
          <div className="hud-panel" style={{ overflow: "hidden" }}>
            <div className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: "1px solid var(--border)", background: "#050505" }}>
              {["OPSEC", "Command", "Tactic", "Technique", "Agent", "Time"].map(h => (
                <span key={h} className="text-xs font-bold tracking-widest"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{h}</span>
              ))}
            </div>
            {events.length === 0
              ? <div className="py-12 text-center text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  No events yet — execute commands on agents to populate the timeline
                </div>
              : events.map(ev => <EventRow key={ev.id} ev={ev} />)
            }
          </div>
        </motion.div>
      )}

      {/* OPSEC */}
      {tab === "opsec" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {opsec.length === 0 ? emptyPanel("No agents with events yet") :
            opsec.map(a => {
              const riskColor = a.cumulative >= 8 ? "var(--red)" : a.cumulative >= 5 ? "#FFB800" : "var(--accent)";
              return (
                <div key={a.agent_id} className="hud-panel p-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                        {a.username}@{a.hostname}
                      </div>
                      <div className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        {a.agent_id.slice(0, 16)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: riskColor, textShadow: `0 0 8px ${riskColor}40` }}>
                        {a.cumulative}/10
                      </div>
                      <div className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        {a.event_count} events
                      </div>
                    </div>
                  </div>
                  {/* Risk bar */}
                  <div style={{ height: 3, background: "var(--border)", overflow: "hidden" }}>
                    <motion.div style={{ height: "100%", background: riskColor,
                        boxShadow: `0 0 6px ${riskColor}` }}
                      initial={{ width: 0 }} animate={{ width: `${a.cumulative * 10}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }} />
                  </div>
                  {/* High-risk events */}
                  {a.high_risk.length > 0 && (
                    <div>
                      <p className="text-xs font-bold tracking-widest mb-2"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        RECENT_HIGH_RISK_ACTIONS
                      </p>
                      <div className="space-y-1">
                        {a.high_risk.map(ev => (
                          <div key={ev.id} className="flex items-center gap-2 px-3 py-2"
                            style={{ background: "rgba(255,51,51,0.04)", border: "1px solid rgba(255,51,51,0.1)" }}>
                            <ScoreBadge score={ev.opsec_score} label={ev.opsec_label} color={ev.opsec_color} />
                            <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                              {ev.command_type}
                            </span>
                            {ev.mitre_tactic && <TacticPill tactic={ev.mitre_tactic} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          }
        </motion.div>
      )}

      {/* ATT&CK HEATMAP */}
      {tab === "mitre" && mitre && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(mitre.tactic_totals).sort((a, b) => b[1] - a[1]).map(([tactic, count]) => {
              const color = TACTIC_COLORS[tactic] ?? "var(--text-faint)";
              return (
                <div key={tactic} className="flex items-center gap-1.5 px-3 py-1.5"
                  style={{ background: color + "10", border: `1px solid ${color}30` }}>
                  <div style={{ width: 5, height: 5, background: color }} />
                  <span className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>{tactic}</span>
                  <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{count}</span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {mitre.techniques.filter(t => t.count > 0).map(t => {
              const heatColor = t.count >= 5 ? "var(--red)" : t.count >= 2 ? "#FFB800" : "var(--accent)";
              return (
                <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                  className="hud-panel p-3 block no-underline"
                  style={{ textDecoration: "none" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,255,65,0.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                      {t.id}
                    </span>
                    <span className="text-xs font-black px-1.5 py-0.5"
                      style={{ fontFamily: "'JetBrains Mono', monospace", background: heatColor + "20",
                        color: heatColor, border: `1px solid ${heatColor}40` }}>
                      {t.count}
                    </span>
                  </div>
                  <div className="text-xs font-semibold leading-tight mb-1"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                    {t.name}
                  </div>
                  <TacticPill tactic={t.tactic} />
                </a>
              );
            })}
            {mitre.techniques.filter(t => t.count > 0).length === 0 && (
              <div className="col-span-3 py-12 text-center text-xs"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                No ATT&CK techniques observed yet
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* GEOIP */}
      {tab === "geo" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="hud-panel" style={{ overflow: "hidden" }}>
            {geo.length === 0 ? emptyPanel("No agents with geo data") : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#050505", borderBottom: "1px solid var(--border)" }}>
                    {["Agent", "IP", "Location", "ISP", "Coords", "Status"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold tracking-widest uppercase"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)", fontWeight: 400 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {geo.map(a => (
                    <tr key={a.agent_id} style={{ borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                      <td className="px-4 py-3">
                        <div className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                          {a.hostname}
                        </div>
                        <div className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                          {a.agent_id.slice(0, 12)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        {a.ip}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{a.flag}</span>
                          <div>
                            <div className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                              {a.country}
                            </div>
                            <div className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                              {a.city}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        {a.isp}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        {a.lat.toFixed(2)}, {a.lon.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5"
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            background: a.status === "active" ? "rgba(0,255,65,0.05)" : "rgba(255,255,255,0.02)",
                            color: a.status === "active" ? "var(--accent)" : "var(--text-faint)",
                            border: `1px solid ${a.status === "active" ? "rgba(0,255,65,0.2)" : "var(--border)"}`,
                          }}>
                          {a.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      )}

      {/* PLUGINS */}
      {tab === "plugins" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex justify-end">
            <motion.button onClick={reloadPlugins} whileTap={{ scale: 0.95 }}
              className="btn-primary flex items-center gap-2 px-4 py-1.5">
              <RefreshCw size={12} /> RELOAD_PLUGINS
            </motion.button>
          </div>
          <div className="hud-panel p-5 space-y-3">
            <p className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              Plugins live in <code style={{ color: "var(--accent)" }}>plugins/</code> directory.
              Each file exports hooks: <code style={{ color: "var(--text-muted)" }}>on_agent_new</code>,{" "}
              <code style={{ color: "var(--text-muted)" }}>on_task_result</code>,{" "}
              <code style={{ color: "var(--text-muted)" }}>on_event</code>, etc.
            </p>
            {plugins.length === 0
              ? <div className="py-8 text-center text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  No plugins loaded
                </div>
              : plugins.map(p => (
                <div key={p.name} className="p-4 flex items-start gap-3"
                  style={{ background: "#050505", border: "1px solid var(--border)" }}>
                  <Cpu size={14} style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                        {p.name}
                      </span>
                      <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                        v{p.version}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.hooks.map(h => (
                        <span key={h} className="text-xs px-2 py-0.5"
                          style={{ fontFamily: "'JetBrains Mono', monospace", background: "rgba(0,255,65,0.05)",
                            color: "#00CC33", border: "1px solid rgba(0,255,65,0.15)" }}>
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </motion.div>
      )}
    </div>
  );
}
