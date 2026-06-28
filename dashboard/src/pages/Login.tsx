import { useState, useRef } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { login } from "../api/client";
import { Zap, AlertCircle } from "lucide-react";

interface LoginProps { onLogin: () => void; }

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const glareX  = useTransform(rotateY, [-15, 15], ["0%", "100%"]);
  const glareY  = useTransform(rotateX, [15, -15], ["0%", "100%"]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    rotateY.set(x * 14);
    rotateX.set(-y * 14);
  };
  const onLeave = () => { rotateX.set(0); rotateY.set(0); };

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-grid flex items-center justify-center relative overflow-hidden"
      style={{ background: "#F8F6F1" }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(30,60,184,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(30,60,184,0.025) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      {/* ambient orb */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.06, 0.1, 0.06] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, #1E3CB8 0%, transparent 70%)" }}
      />

      <div className="w-full max-w-sm px-4 relative">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="text-center mb-8"
        >
          <motion.div
            whileHover={{ rotate: [0, -8, 8, 0], scale: 1.08 }}
            transition={{ duration: 0.5 }}
            className="inline-flex w-12 h-12 rounded-2xl items-center justify-center mb-4 cursor-default"
            style={{ background: "linear-gradient(145deg, #2546CC, #1E3CB8)", boxShadow: "0 4px 20px rgba(30,60,184,0.25)" }}
          >
            <Zap size={20} className="text-white" />
          </motion.div>
          <h1 className="text-nyx-text text-2xl font-bold tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Nyx C2</h1>
          <p className="text-nyx-muted text-sm mt-1.5">Operator authentication required</p>
        </motion.div>

        <motion.div
          ref={cardRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 900 }}
          className="rounded-2xl"
        >
          <div className="rounded-2xl p-6 bg-white relative overflow-hidden" style={{ border: "1px solid #E5DDD0", boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)" }}>
            {/* glare overlay */}
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-2xl opacity-0 hover:opacity-100"
              style={{ background: `radial-gradient(circle at ${glareX} ${glareY}, rgba(255,255,255,0.15) 0%, transparent 60%)`, transition: "opacity 0.3s" }}
            />
            <form onSubmit={handleSubmit} className="space-y-4 relative">
              {["Username", "Password"].map((label, i) => (
                <motion.div key={label} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.08 }}>
                  <label className="block text-nyx-dim text-xs font-semibold mb-1.5" style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</label>
                  <input
                    type={i === 1 ? "password" : "text"}
                    value={i === 0 ? username : password}
                    onChange={e => i === 0 ? setUsername(e.target.value) : setPassword(e.target.value)}
                    className="input-base w-full rounded-xl px-4 py-3 text-sm"
                    placeholder={i === 0 ? "operator" : "••••••••"}
                    autoFocus={i === 0}
                  />
                </motion.div>
              ))}

              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-nyx-red text-xs px-3 py-2.5 rounded-xl font-medium"
                  style={{ background: "#FEF0F0", border: "1px solid rgba(184,40,40,0.15)" }}>
                  <AlertCircle size={13} /> {error}
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.01, boxShadow: "0 6px 24px rgba(30,60,184,0.32)" }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="btn-primary ripple w-full py-3 rounded-xl text-sm mt-1"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Authenticating…
                  </span>
                ) : "Connect to Server"}
              </motion.button>
            </form>
          </div>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="text-center text-nyx-muted text-xs mt-5 mono">
          operator / nyx2024
        </motion.p>
      </div>
    </motion.div>
  );
}
