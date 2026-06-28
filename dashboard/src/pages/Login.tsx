import { useState, useRef } from "react";
import { login } from "../api/client";
import { Zap, AlertCircle } from "lucide-react";

interface LoginProps { onLogin: () => void; }

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateZ(4px)`;
  };
  const onLeave = () => {
    if (cardRef.current) cardRef.current.style.transform = "perspective(900px) rotateY(0) rotateX(0) translateZ(0)";
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
    <div className="min-h-screen bg-grid flex items-center justify-center" style={{ background: "#F8F6F1" }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(30,60,184,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(30,60,184,0.025) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }}
      />

      <div className="w-full max-w-sm px-4 relative">
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl items-center justify-center mb-4" style={{ background: "linear-gradient(145deg, #2546CC, #1E3CB8)", boxShadow: "0 4px 20px rgba(30,60,184,0.25)" }}>
            <Zap size={20} className="text-white" />
          </div>
          <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Nyx C2</h1>
          <p className="text-nyx-muted text-sm mt-1.5">Operator authentication required</p>
        </div>

        <div
          ref={cardRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          className="tilt-card rounded-2xl p-6 bg-white"
          style={{ border: "1px solid #E5DDD0", boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)" }}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-nyx-dim text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ fontSize: "10px", letterSpacing: "0.1em" }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm"
                placeholder="operator"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-nyx-dim text-xs font-semibold mb-1.5 uppercase tracking-widest" style={{ fontSize: "10px", letterSpacing: "0.1em" }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-base w-full rounded-xl px-4 py-3 text-sm"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-nyx-red text-xs px-3 py-2.5 rounded-xl font-medium" style={{ background: "#FEF0F0", border: "1px solid rgba(184,40,40,0.15)" }}>
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl text-sm mt-1">
              {loading ? "Authenticating…" : "Connect to Server"}
            </button>
          </form>
        </div>

        <p className="text-center text-nyx-muted text-xs mt-5 mono">operator / nyx2024</p>
      </div>
    </div>
  );
}
