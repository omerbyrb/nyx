import { useState, useRef } from "react";
import { login } from "../api/client";
import { Zap, Lock } from "lucide-react";

interface LoginProps { onLogin: () => void; }

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    card.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(4px)`;
  };

  const handleMouseLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = "perspective(800px) rotateY(0deg) rotateX(0deg) translateZ(0)";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await login(username, password);
      localStorage.setItem("nyx_token", data.access_token);
      onLogin();
    } catch { setError("Invalid credentials"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-nyx-bg bg-grid flex items-center justify-center relative overflow-hidden">
      {/* ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #2563EB 0%, transparent 70%)" }} />

      <div className="w-full max-w-sm px-4">
        {/* header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", boxShadow: "0 8px 32px rgba(37,99,235,0.4)" }}>
            <Zap size={22} className="text-white" />
          </div>
          <h1 className="text-nyx-cream text-2xl font-bold tracking-tight" style={{ fontFamily: "Syne, sans-serif" }}>Nyx C2</h1>
          <p className="text-nyx-muted text-sm mt-1">Operator authentication required</p>
        </div>

        {/* card with 3D tilt */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="tilt-card rounded-2xl p-6"
          style={{ background: "linear-gradient(135deg, #0C1525, #0F1C30)", border: "1px solid #1A2E4A", boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-nyx-dim text-xs uppercase tracking-widest block mb-2" style={{ letterSpacing: "0.1em" }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm mono"
                placeholder="operator"
                autoFocus
              />
            </div>
            <div>
              <label className="text-nyx-dim text-xs uppercase tracking-widest block mb-2" style={{ letterSpacing: "0.1em" }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-nyx-red text-xs bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                <Lock size={12} /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 mt-2"
            >
              {loading ? "Authenticating..." : "Connect to Server"}
            </button>
          </form>
        </div>

        <p className="text-center text-nyx-muted text-xs mt-5 mono">
          Default: operator / nyx2024
        </p>
      </div>
    </div>
  );
}
