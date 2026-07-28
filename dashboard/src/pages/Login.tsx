import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { login } from "../api/client";
import { AlertCircle, Shield } from "lucide-react";

interface LoginProps { onLogin: () => void; }

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await login(username, password);
      localStorage.setItem("nyx_token", data.access_token);
      onLogin();
    } catch { setError("Invalid credentials"); }
    finally { setLoading(false); }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          opacity: 0.25,
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative w-full max-w-sm px-4"
      >
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 flex items-center justify-center rounded-xl mb-4"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid rgba(0, 255, 65, 0.25)",
            }}
          >
            <Shield size={22} color="var(--accent)" />
          </div>
          <h1
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: "20px",
              color: "var(--text)",
              letterSpacing: "-0.01em",
              marginBottom: 4,
            }}
          >
            Nyx C2
          </h1>
          <p
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              color: "var(--text-faint)",
            }}
          >
            v1.5.0
          </p>
        </div>

        {/* Card */}
        <div
          className="card"
          style={{ padding: "28px 24px" }}
        >
          <h2
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: "15px",
              color: "var(--text)",
              marginBottom: "4px",
            }}
          >
            Sign in
          </h2>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "13px",
              color: "var(--text-muted)",
              marginBottom: "20px",
            }}
          >
            Operator authentication required
          </p>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Username */}
            <div>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Username
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
                style={{
                  display: "block",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  marginBottom: "6px",
                }}
              >
                Password
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
                  className="flex items-center gap-2 px-3 py-2.5 rounded"
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: "13px",
                    color: "var(--red)",
                    background: "var(--red-dim)",
                    border: "1px solid rgba(239,68,68,0.25)",
                  }}
                >
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="btn-primary w-full py-2.5 mt-1"
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.75, repeat: Infinity, ease: "linear" }}
                    style={{
                      display: "inline-block", width: 13, height: 13,
                      border: "2px solid #000",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                    }}
                  />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </motion.button>
          </form>
        </div>

        {/* Dev hint */}
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            color: "var(--text-faint)",
            textAlign: "center",
            marginTop: "16px",
          }}
        >
          operator / nyx2024
        </p>
      </motion.div>
    </div>
  );
}
