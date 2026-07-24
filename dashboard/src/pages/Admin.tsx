import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Shield, Eye, Edit3, Check, X } from "lucide-react";
import { api } from "../api/client";

interface Operator {
  id: string; username: string;
  role: "admin" | "operator" | "readonly";
  is_active: boolean; last_login: string | null; created_at: string;
}

const ROLE_COLORS: Record<string, { color: string; border: string }> = {
  admin:    { color: "#FF3333", border: "rgba(255,51,51,0.3)" },
  operator: { color: "#00FF41", border: "rgba(0,255,65,0.3)" },
  readonly: { color: "#4A4A4A", border: "#1F1F1F" },
};

const rolePill = (role: string) => {
  const s = ROLE_COLORS[role] ?? ROLE_COLORS.readonly;
  return (
    <span style={{
      background: `${s.color}0D`, color: s.color,
      border: `1px solid ${s.border}`, borderRadius: 2,
      padding: "2px 8px", fontSize: "0.7rem", fontWeight: 700,
      fontFamily: "'Fira Code', monospace",
    }}>
      {role}
    </span>
  );
};

export default function Admin() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin"|"operator"|"readonly">("operator");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string|null>(null);
  const [editRole, setEditRole] = useState<"admin"|"operator"|"readonly">("operator");

  const fetchOperators = async () => {
    try {
      const r = await api.get<Operator[]>("/api/admin/operators");
      setOperators(r.data);
    } catch { setError("ACCESS_DENIED: admin role required"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchOperators(); }, []);

  const createOperator = async () => {
    if (!newUsername || !newPassword) return;
    setCreating(true);
    try {
      await api.post("/api/admin/operators", { username: newUsername, password: newPassword, role: newRole });
      setNewUsername(""); setNewPassword(""); setNewRole("operator"); setShowCreate(false);
      fetchOperators();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Create failed";
      setError(msg);
    } finally { setCreating(false); }
  };

  const updateRole = async (id: string, role: string) => {
    await api.patch(`/api/admin/operators/${id}`, { role });
    setEditId(null);
    fetchOperators();
  };

  const toggleActive = async (op: Operator) => {
    await api.patch(`/api/admin/operators/${op.id}`, { is_active: !op.is_active });
    fetchOperators();
  };

  const deleteOperator = async (id: string) => {
    if (!confirm("Delete this operator?")) return;
    await api.delete(`/api/admin/operators/${id}`);
    fetchOperators();
  };

  const inputStyle = {
    background: "#000", border: "1px solid #1F1F1F",
    color: "#E0E0E0", fontFamily: "'Fira Code', monospace",
    fontSize: "12px", padding: "8px 12px", outline: "none",
  };

  return (
    <div className="p-6 space-y-5" style={{ minHeight: "100%", background: "#000" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-widest uppercase"
            style={{ fontFamily: "'Fira Code', monospace", color: "#00FF41", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
            // OPERATORS
          </h1>
          <p className="text-xs mt-1" style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
            multi-operator RBAC — admin · operator · readonly
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreate(v => !v)}
          className="btn-primary flex items-center gap-2 px-3 py-1.5">
          <Plus size={12} /> ADD_OPERATOR
        </motion.button>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-3 py-2.5 text-xs"
            style={{ fontFamily: "'Fira Code', monospace", color: "#FF3333", background: "rgba(255,51,51,0.05)", border: "1px solid rgba(255,51,51,0.2)" }}>
            <X size={12} /> {error}
            <button onClick={() => setError("")} className="ml-auto" style={{ color: "#4A4A4A" }}><X size={11} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create panel */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
            className="hud-panel p-4 overflow-hidden">
            <div className="text-xs font-bold mb-4 tracking-widest"
              style={{ fontFamily: "'Fira Code', monospace", color: "#00FF41" }}>
              // NEW_OPERATOR
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)}
                placeholder="username" style={inputStyle} className="w-full" />
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="password" style={inputStyle} className="w-full" />
              <select value={newRole} onChange={e => setNewRole(e.target.value as "admin"|"operator"|"readonly")}
                style={{ ...inputStyle, cursor: "pointer" }} className="w-full">
                <option value="operator">operator</option>
                <option value="admin">admin</option>
                <option value="readonly">readonly</option>
              </select>
            </div>
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.96 }} onClick={createOperator} disabled={creating}
                className="btn-primary px-4 py-1.5 flex items-center gap-2">
                {creating
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      style={{ width: 10, height: 10, border: "1px solid #00FF41", borderTopColor: "transparent", borderRadius: "50%" }} />
                  : <Check size={11} />}
                CREATE
              </motion.button>
              <button onClick={() => setShowCreate(false)} className="btn-ghost px-4 py-1.5">CANCEL</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="hud-panel" style={{ overflow: "hidden" }}>
        <div className="grid px-4 py-2.5 text-xs tracking-widest uppercase"
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
            borderBottom: "1px solid #1F1F1F",
            fontFamily: "'Fira Code', monospace", color: "#2A2A2A", fontWeight: 400 }}>
          <span>Username</span><span>Role</span><span>Status</span><span>Last Login</span><span>Actions</span>
        </div>
        {loading && (
          <div className="flex items-center justify-center p-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              style={{ width: 18, height: 18, border: "1px solid #00FF41", borderTopColor: "transparent", borderRadius: "50%" }} />
          </div>
        )}
        <AnimatePresence>
          {operators.map((op, i) => (
            <motion.div key={op.id}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              transition={{ delay: i * 0.04 }}
              className="grid items-center px-4 py-3"
              style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto", borderBottom: "1px solid #1F1F1F" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,255,65,0.02)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center text-xs font-bold"
                  style={{ width: 26, height: 26, border: "1px solid rgba(0,255,65,0.2)", color: "#00FF41", fontFamily: "'Fira Code', monospace" }}>
                  {op.username[0].toUpperCase()}
                </div>
                <span className="font-bold text-xs" style={{ fontFamily: "'Fira Code', monospace", color: "#E0E0E0" }}>
                  {op.username}
                </span>
              </div>
              <div>
                {editId === op.id ? (
                  <div className="flex items-center gap-1.5">
                    <select value={editRole} onChange={e => setEditRole(e.target.value as "admin"|"operator"|"readonly")}
                      style={{ ...inputStyle, padding: "4px 8px", fontSize: "11px" }}>
                      <option value="operator">operator</option>
                      <option value="admin">admin</option>
                      <option value="readonly">readonly</option>
                    </select>
                    <button onClick={() => updateRole(op.id, editRole)} style={{ color: "#00FF41" }}><Check size={12} /></button>
                    <button onClick={() => setEditId(null)} style={{ color: "#4A4A4A" }}><X size={12} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {rolePill(op.role)}
                    {op.role === "admin" && <Shield size={10} style={{ color: "#FF3333" }} />}
                  </div>
                )}
              </div>
              <div>
                <span className="flex items-center gap-1.5 text-xs"
                  style={{ fontFamily: "'Fira Code', monospace", color: op.is_active ? "#00FF41" : "#4A4A4A" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: op.is_active ? "#00FF41" : "#2A2A2A",
                    boxShadow: op.is_active ? "0 0 4px #00FF41" : "none" }} />
                  {op.is_active ? "ONLINE" : "DISABLED"}
                </span>
              </div>
              <span className="text-xs" style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
                {op.last_login ? new Date(op.last_login).toLocaleString() : "never"}
              </span>
              <div className="flex items-center gap-1">
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setEditId(op.id); setEditRole(op.role); }}
                  style={{ color: "#4A4A4A", cursor: "pointer", background: "none", border: "none", padding: "4px" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#00FF41"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#4A4A4A"; }}>
                  <Edit3 size={12} />
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => toggleActive(op)}
                  style={{ color: "#4A4A4A", cursor: "pointer", background: "none", border: "none", padding: "4px" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#9A9A9A"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#4A4A4A"; }}>
                  <Eye size={12} />
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => deleteOperator(op.id)}
                  style={{ color: "#4A4A4A", cursor: "pointer", background: "none", border: "none", padding: "4px" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#FF3333"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#4A4A4A"; }}>
                  <Trash2 size={12} />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {!loading && operators.length === 0 && (
          <div className="text-center py-12 text-xs"
            style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}>
            {"[ NO OPERATORS FOUND ]"}
          </div>
        )}
      </motion.div>

      {/* Role legend */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="hud-panel p-4">
        <div className="text-xs tracking-widest mb-3"
          style={{ fontFamily: "'Fira Code', monospace", color: "#00FF41" }}>
          // ROLE_PERMISSIONS
        </div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          {[
            { role: "admin",    perms: ["All operations", "Operator management", "Delete agents", "IOC export"] },
            { role: "operator", perms: ["View agents", "Execute tasks", "Payload builder", "IOC export"] },
            { role: "readonly", perms: ["View agents", "View tasks", "View reports", "No execution"] },
          ].map(({ role, perms }) => (
            <div key={role} className="flex flex-col gap-2 p-3"
              style={{ background: "#050505", border: "1px solid #1F1F1F" }}>
              <div className="mb-1">{rolePill(role)}</div>
              {perms.map(p => (
                <span key={p} className="flex items-center gap-1.5"
                  style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
                  <Check size={9} style={{ color: "#00FF41", flexShrink: 0 }} /> {p}
                </span>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
