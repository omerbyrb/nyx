import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Shield, Cpu, AlertTriangle,
  RefreshCw, ExternalLink, ChevronDown, ChevronUp, Zap
} from "lucide-react";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────────────
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

interface MitreTech {
  id: string; name: string; tactic: string; url: string; count: number; order: number;
}

interface GeoAgent {
  agent_id: string; hostname: string; ip: string;
  country: string; country_code: string; city: string;
  isp: string; lat: number; lon: number; flag: string; status: string;
}

interface Stats {
  total_events: number; high_risk_24h: number;
  tactics_used: number; techniques_used: number; plugins_loaded: number;
}

// ── Score badge ───────────────────────────────────────────────────────────────
function ScoreBadge({ score, color }: { score: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-bold"
      style={{ background: color, minWidth: "2.5rem", justifyContent: "center" }}>
      {score}/10
    </span>
  );
}

// ── Tactic pill ───────────────────────────────────────────────────────────────
const TACTIC_COLORS: Record<string, string> = {
  "Execution":          "#1E3CB8",
  "Persistence":        "#6B2FB8",
  "Privilege Escalation":"#B82861",
  "Defense Evasion":    "#B86428",
  "Credential Access":  "#B82828",
  "Discovery":          "#1E7CB8",
  "Lateral Movement":   "#0A6B4A",
  "Collection":         "#6B7B0A",
  "Command and Control":"#4A4A4A",
  "Exfiltration":       "#8B0000",
  "Impact":             "#000000",
};

function TacticPill({ tactic }: { tactic: string }) {
  const color = TACTIC_COLORS[tactic] ?? "#888";
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-white text-xs font-semibold"
      style={{ background: color }}>
      {tactic}
    </span>
  );
}

// ── Event row ─────────────────────────────────────────────────────────────────
function EventRow({ ev }: { ev: IntelEvent }) {
  const [open, setOpen] = useState(false);
  const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "";
  const date = ev.timestamp ? new Date(ev.timestamp).toLocaleDateString() : "";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="border-b last:border-0" style={{ borderColor: "#E5DDD0" }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-nyx-hover text-left transition-colors">
        {/* OPSEC score */}
        <ScoreBadge score={ev.opsec_score} label={ev.opsec_label} color={ev.opsec_color} />
        {/* Command */}
        <span className="mono text-nyx-text text-xs font-semibold truncate w-36 flex-shrink-0">{ev.command_type}</span>
        {/* Tactic */}
        {ev.mitre_tactic && <TacticPill tactic={ev.mitre_tactic} />}
        {/* MITRE ID */}
        {ev.mitre_id && (
          <span className="mono text-nyx-muted text-xs hidden sm:block flex-shrink-0">{ev.mitre_id}</span>
        )}
        {/* Agent */}
        <span className="text-nyx-muted text-xs truncate flex-1 hidden md:block">
          {ev.agent_id?.slice(0, 8)}
        </span>
        {/* Time */}
        <span className="text-nyx-dim text-xs flex-shrink-0 hidden sm:block">{date} {ts}</span>
        {open ? <ChevronUp size={13} className="text-nyx-muted flex-shrink-0" />
               : <ChevronDown size={13} className="text-nyx-muted flex-shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3">
              {/* Full command */}
              <div className="rounded-xl px-3 py-2 mono text-nyx-text text-xs"
                style={{ background: "#F0EDE6", border: "1px solid #E5DDD0" }}>
                {ev.command}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* MITRE */}
                {ev.mitre_id && (
                  <div className="rounded-xl p-3" style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
                    <p className="text-nyx-muted text-xs font-semibold uppercase mb-1" style={{ letterSpacing: "0.06em" }}>MITRE ATT&CK</p>
                    <p className="text-nyx-text text-xs font-bold">{ev.mitre_id}</p>
                    <p className="text-nyx-dim text-xs mt-0.5">{ev.mitre_name}</p>
                    {ev.mitre_url && (
                      <a href={ev.mitre_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-nyx-accent text-xs mt-1 hover:underline">
                        View on ATT&CK <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}
                {/* OPSEC */}
                <div className="rounded-xl p-3" style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
                  <p className="text-nyx-muted text-xs font-semibold uppercase mb-1" style={{ letterSpacing: "0.06em" }}>OPSEC</p>
                  <div className="flex items-center gap-2 mb-1">
                    <ScoreBadge score={ev.opsec_score} label={ev.opsec_label} color={ev.opsec_color} />
                    <span className="text-nyx-dim text-xs font-semibold">{ev.opsec_label}</span>
                  </div>
                  <p className="text-nyx-muted text-xs">{ev.opsec_notes}</p>
                </div>
              </div>
              {/* Output preview */}
              {ev.output_preview && (
                <div>
                  <p className="text-nyx-muted text-xs font-semibold mb-1">Output Preview</p>
                  <pre className="text-nyx-text text-xs rounded-xl p-3 overflow-x-auto"
                    style={{ background: "#1A1A1A", color: "#C8F7C5", maxHeight: "8rem" }}>
                    {ev.output_preview}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Intelligence() {
  const [tab, setTab]         = useState<"timeline" | "opsec" | "mitre" | "geo" | "plugins">("timeline");
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
    } finally {
      setLoading(false);
    }
  }, [filterTactic, filterScore]);

  useEffect(() => { load(); }, [load]);

  const reloadPlugins = async () => {
    await api.post("/api/intel/plugins/reload");
    load();
  };

  // Unique tactics from events for filter
  const tactics = [...new Set(events.map(e => e.mitre_tactic).filter(Boolean))].sort();

  return (
    <div className="p-7 space-y-6 bg-nyx-bg min-h-full">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-nyx-text text-2xl font-bold tracking-tight"
              style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>
              Intelligence
            </h1>
            <p className="text-nyx-muted text-sm mt-1">Kill chain timeline · OPSEC scoring · ATT&CK heatmap · GeoIP</p>
          </div>
          <motion.button onClick={load} whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-nyx-dim"
            style={{ background: "#F0EDE6", border: "1px solid #E5DDD0" }}>
            <motion.span animate={loading ? { rotate: 360 } : {}}
              transition={{ duration: 0.8, repeat: loading ? Infinity : 0, ease: "linear" }}>
              <RefreshCw size={13} />
            </motion.span>
            Refresh
          </motion.button>
        </div>
      </motion.div>

      {/* Stats bar */}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-5 gap-3">
          {[
            { label: "Total Events",     value: stats.total_events,    icon: Activity, color: "#1E3CB8" },
            { label: "High Risk (24h)",  value: stats.high_risk_24h,   icon: AlertTriangle, color: "#B82828" },
            { label: "Tactics Covered",  value: stats.tactics_used,    icon: Shield,   color: "#6B2FB8" },
            { label: "Techniques Used",  value: stats.techniques_used, icon: Zap,      color: "#B86428" },
            { label: "Plugins Loaded",   value: stats.plugins_loaded,  icon: Cpu,      color: "#0A6B4A" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl p-4 flex items-center gap-3"
              style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: color + "18" }}>
                <Icon size={14} style={{ color }} />
              </div>
              <div>
                <div className="text-nyx-text text-lg font-bold leading-none">{value}</div>
                <div className="text-nyx-muted text-xs mt-0.5">{label}</div>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-white rounded-2xl p-1" style={{ border: "1px solid #E5DDD0", width: "fit-content" }}>
        {(["timeline", "opsec", "mitre", "geo", "plugins"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all"
            style={{
              background: tab === t ? "#1E3CB8" : "transparent",
              color:      tab === t ? "#FFFFFF" : "#6B7183",
            }}>
            {t === "mitre" ? "ATT&CK" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Timeline Tab ──────────────────────────────────────────────────── */}
      {tab === "timeline" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <select value={filterTactic} onChange={e => setFilterTactic(e.target.value)}
              className="input-base rounded-xl px-3 py-2 text-xs"
              style={{ minWidth: "10rem" }}>
              <option value="">All Tactics</option>
              {tactics.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterScore} onChange={e => setFilterScore(Number(e.target.value))}
              className="input-base rounded-xl px-3 py-2 text-xs">
              <option value={0}>All OPSEC Scores</option>
              <option value={5}>≥ 5 (Medium+)</option>
              <option value={7}>≥ 7 (High+)</option>
              <option value={9}>≥ 9 (Critical)</option>
            </select>
            <button onClick={load} className="btn-primary px-4 py-2 rounded-xl text-xs">Apply</button>
          </div>

          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#E5DDD0", background: "#F8F6F1" }}>
              <span className="text-nyx-muted text-xs font-semibold w-16">OPSEC</span>
              <span className="text-nyx-muted text-xs font-semibold w-36">Command</span>
              <span className="text-nyx-muted text-xs font-semibold">Tactic</span>
              <span className="text-nyx-muted text-xs font-semibold hidden sm:block">Technique</span>
              <span className="text-nyx-muted text-xs font-semibold flex-1 hidden md:block">Agent</span>
              <span className="text-nyx-muted text-xs font-semibold hidden sm:block">Time</span>
            </div>
            {events.length === 0 ? (
              <div className="py-12 text-center text-nyx-muted text-sm">
                No events yet — execute commands on agents to populate the timeline
              </div>
            ) : (
              events.map(ev => <EventRow key={ev.id} ev={ev} />)
            )}
          </div>
        </motion.div>
      )}

      {/* ── OPSEC Tab ─────────────────────────────────────────────────────── */}
      {tab === "opsec" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {opsec.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center text-nyx-muted text-sm"
              style={{ border: "1px solid #E5DDD0" }}>
              No agents with events yet
            </div>
          ) : (
            opsec.map(a => (
              <div key={a.agent_id} className="bg-white rounded-2xl p-5 space-y-4"
                style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-nyx-text text-sm font-bold">{a.username}@{a.hostname}</div>
                    <div className="text-nyx-muted text-xs mono">{a.agent_id.slice(0, 16)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black" style={{ color: a.cumulative >= 8 ? "#B82828" : a.cumulative >= 5 ? "#D4A017" : "#0A6B4A" }}>
                      {a.cumulative}/10
                    </div>
                    <div className="text-nyx-muted text-xs">{a.event_count} events</div>
                  </div>
                </div>
                {/* Risk bar */}
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E5DDD0" }}>
                  <motion.div className="h-full rounded-full"
                    initial={{ width: 0 }} animate={{ width: `${a.cumulative * 10}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{ background: a.cumulative >= 8 ? "#B82828" : a.cumulative >= 5 ? "#D4A017" : "#0A6B4A" }}
                  />
                </div>
                {/* High-risk events */}
                {a.high_risk.length > 0 && (
                  <div>
                    <p className="text-nyx-muted text-xs font-semibold uppercase mb-2" style={{ letterSpacing: "0.06em" }}>Recent High-Risk Actions</p>
                    <div className="space-y-1">
                      {a.high_risk.map(ev => (
                        <div key={ev.id} className="flex items-center gap-2 rounded-xl px-3 py-2"
                          style={{ background: "#FFF5F5", border: "1px solid rgba(184,40,40,0.15)" }}>
                          <ScoreBadge score={ev.opsec_score} label={ev.opsec_label} color={ev.opsec_color} />
                          <span className="mono text-nyx-text text-xs">{ev.command_type}</span>
                          {ev.mitre_tactic && <TacticPill tactic={ev.mitre_tactic} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </motion.div>
      )}

      {/* ── ATT&CK Heatmap Tab ────────────────────────────────────────────── */}
      {tab === "mitre" && mitre && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(mitre.tactic_totals).sort((a,b) => b[1]-a[1]).map(([tactic, count]) => (
              <div key={tactic} className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                style={{ background: (TACTIC_COLORS[tactic] ?? "#888") + "20", border: `1px solid ${(TACTIC_COLORS[tactic] ?? "#888")}40` }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: TACTIC_COLORS[tactic] ?? "#888" }} />
                <span className="text-xs font-semibold" style={{ color: TACTIC_COLORS[tactic] ?? "#888" }}>{tactic}</span>
                <span className="text-xs text-nyx-muted">{count}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {mitre.techniques.filter(t => t.count > 0).map(t => (
              <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer"
                className="bg-white rounded-xl p-3 hover:shadow-sm transition-shadow cursor-pointer no-underline"
                style={{ border: "1px solid #E5DDD0" }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="mono text-nyx-accent text-xs font-bold">{t.id}</span>
                  <span className="text-white text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: t.count >= 5 ? "#B82828" : t.count >= 2 ? "#D4A017" : "#0A6B4A" }}>
                    {t.count}
                  </span>
                </div>
                <div className="text-nyx-text text-xs font-semibold leading-tight">{t.name}</div>
                <div className="mt-1">
                  <TacticPill tactic={t.tactic} />
                </div>
              </a>
            ))}
            {mitre.techniques.filter(t => t.count > 0).length === 0 && (
              <div className="col-span-3 py-12 text-center text-nyx-muted text-sm">
                No ATT&CK techniques observed yet
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── GeoIP Tab ─────────────────────────────────────────────────────── */}
      {tab === "geo" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
            {geo.length === 0 ? (
              <div className="py-12 text-center text-nyx-muted text-sm">No agents with geo data</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#F8F6F1", borderBottom: "1px solid #E5DDD0" }}>
                    {["Agent", "IP", "Location", "ISP", "Coords", "Status"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-nyx-muted text-xs font-semibold uppercase"
                        style={{ letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {geo.map(a => (
                    <tr key={a.agent_id} style={{ borderBottom: "1px solid #F0EDE6" }}
                      className="hover:bg-nyx-hover transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-nyx-text text-xs font-semibold">{a.hostname}</div>
                        <div className="mono text-nyx-muted text-xs">{a.agent_id.slice(0, 12)}</div>
                      </td>
                      <td className="px-4 py-3 mono text-nyx-dim text-xs">{a.ip}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg">{a.flag}</span>
                          <div>
                            <div className="text-nyx-text text-xs font-semibold">{a.country}</div>
                            <div className="text-nyx-muted text-xs">{a.city}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-nyx-dim text-xs">{a.isp}</td>
                      <td className="px-4 py-3 mono text-nyx-muted text-xs">
                        {a.lat.toFixed(2)}, {a.lon.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            background: a.status === "active" ? "rgba(10,107,74,0.1)" : "rgba(107,113,131,0.1)",
                            color:      a.status === "active" ? "#0A6B4A" : "#6B7183",
                          }}>
                          {a.status}
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

      {/* ── Plugins Tab ───────────────────────────────────────────────────── */}
      {tab === "plugins" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex justify-end">
            <motion.button onClick={reloadPlugins} whileTap={{ scale: 0.95 }}
              className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-xs">
              <RefreshCw size={13} /> Reload Plugins
            </motion.button>
          </div>
          <div className="bg-white rounded-2xl p-5 space-y-3" style={{ border: "1px solid #E5DDD0" }}>
            <p className="text-nyx-muted text-xs">
              Plugins live in <span className="mono font-semibold text-nyx-dim">plugins/</span> directory.
              Each file exports hooks: <span className="mono text-nyx-dim">on_agent_new</span>,{" "}
              <span className="mono text-nyx-dim">on_task_result</span>,{" "}
              <span className="mono text-nyx-dim">on_event</span>, etc.
            </p>
            {plugins.length === 0 ? (
              <div className="py-8 text-center text-nyx-muted text-sm">No plugins loaded</div>
            ) : (
              plugins.map(p => (
                <div key={p.name} className="rounded-xl p-4 flex items-start gap-3"
                  style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
                  <Cpu size={16} className="text-nyx-accent mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-nyx-text text-sm font-bold">{p.name}</span>
                      <span className="mono text-nyx-muted text-xs">v{p.version}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.hooks.map(h => (
                        <span key={h} className="mono text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "#1E3CB818", color: "#1E3CB8", border: "1px solid #1E3CB830" }}>
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
