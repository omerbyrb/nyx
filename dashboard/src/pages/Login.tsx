import { useState } from "react";
import { login } from "../api/client";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await login(username, password);
      localStorage.setItem("nyx_token", data.access_token);
      onLogin();
    } catch {
      setError("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-nyx-bg flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-lg bg-nyx-accent flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">N</span>
          </div>
          <h1 className="text-nyx-text text-2xl font-semibold">Nyx C2</h1>
          <p className="text-nyx-muted text-sm mt-1">Operator authentication required</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-nyx-surface border border-nyx-border rounded-lg p-6 space-y-4">
          <div>
            <label className="text-nyx-muted text-xs uppercase tracking-wider block mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-nyx-bg border border-nyx-border rounded px-3 py-2 text-nyx-text text-sm focus:outline-none focus:border-nyx-accent"
              placeholder="operator"
              autoFocus
            />
          </div>
          <div>
            <label className="text-nyx-muted text-xs uppercase tracking-wider block mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-nyx-bg border border-nyx-border rounded px-3 py-2 text-nyx-text text-sm focus:outline-none focus:border-nyx-accent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-nyx-red text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-nyx-accent hover:bg-violet-700 disabled:opacity-50 text-white py-2 rounded text-sm font-medium transition-colors"
          >
            {loading ? "Authenticating..." : "Connect"}
          </button>
        </form>

        <p className="text-center text-nyx-muted text-xs mt-4">
          Default: operator / nyx2024
        </p>
      </div>
    </div>
  );
}
