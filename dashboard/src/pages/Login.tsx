import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { login } from "../api/client";
import { AlertCircle, Lock } from "lucide-react";

interface LoginProps { onLogin: () => void; }

function BootLine({ text, delay }: { text: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.15 }}
      className="text-xs"
      style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}
    >
      {text}
    </motion.div>
  );
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBootDone(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await login(username, password);
      localStorage.setItem("nyx_token", data.access_token);
      onLogin();
    } catch { setError("AUTH_FAILED: invalid credentials"); }
    finally { setLoading(false); }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden bg-grid"
      style={{ background: "#000" }}
    >
      {/* Matrix grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,255,65,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,65,0.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Ambient glow */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.04, 0.08, 0.04] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute pointer-events-none"
        style={{
          top: "40%", left: "50%", transform: "translate(-50%,-50%)",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, #00FF41 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-sm px-4">
        {/* Boot sequence */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mb-6 space-y-0.5"
        >
          <BootLine text="[BOOT] NYX C2 v1.4.0 kernel loaded" delay={0.0} />
          <BootLine text="[INIT] Operator authentication module" delay={0.2} />
          <BootLine text="[OK  ] Encrypted channel established" delay={0.5} />
          <BootLine text="[WAIT] Operator credentials required" delay={0.8} />
        </motion.div>

        {/* Auth panel */}
        <AnimatePresence>
          {bootDone && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="hud-panel"
              style={{ padding: "24px" }}
            >
              {/* Panel header */}
              <div
                className="flex items-center gap-2 mb-6 pb-4"
                style={{ borderBottom: "1px solid #1F1F1F" }}
              >
                <Lock size={13} color="#00FF41" />
                <span
                  className="text-xs tracking-widest uppercase"
                  style={{
                    fontFamily: "'Fira Code', monospace",
                    color: "#00FF41",
                    textShadow: "0 0 6px rgba(0,255,65,0.5)",
                  }}
                >
                  OPERATOR AUTH
                </span>
                <div className="ml-auto flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.3 }}
                      style={{ width: 4, height: 4, background: "#00FF41", borderRadius: "50%" }}
                    />
                  ))}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div>
                  <label
                    className="block text-xs mb-1.5 tracking-widest uppercase"
                    style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
                  >
                    // USERNAME
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="input-base w-full px-3 py-2.5"
                    placeholder="operator"
                    autoFocus
                  />
                </div>

                {/* Password */}
                <div>
                  <label
                    className="block text-xs mb-1.5 tracking-widest uppercase"
                    style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
                  >
                    // PASSWORD
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-base w-full px-3 py-2.5"
                    placeholder="••••••••"
                  />
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 px-3 py-2 text-xs"
                      style={{
                        fontFamily: "'Fira Code', monospace",
                        color: "#FF3333",
                        background: "rgba(255,51,51,0.05)",
                        border: "1px solid rgba(255,51,51,0.2)",
                        textShadow: "0 0 4px rgba(255,51,51,0.4)",
                      }}
                    >
                      <AlertCircle size={12} />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileTap={{ scale: 0.98 }}
                  className="btn-primary ripple w-full py-2.5 mt-1"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        style={{
                          display: "inline-block", width: 12, height: 12,
                          border: "1px solid #00FF41", borderTopColor: "transparent",
                          borderRadius: "50%",
                        }}
                      />
                      AUTHENTICATING...
                    </span>
                  ) : (
                    <span className="cursor-blink">CONNECT</span>
                  )}
                </motion.button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="text-center mt-4 text-xs"
          style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}
        >
          operator / nyx2024
        </motion.p>
      </div>
    </div>
  );
}
