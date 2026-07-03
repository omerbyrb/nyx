import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Plus, Trash2, Shield, Eye, Edit3, Check, X } from "lucide-react";
import { api } from "../api/client";

interface Operator {
  id: string;
  username: string;
  role: "admin" | "operator" | "readonly";
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

const rolePill = (role: string) => {
  const cfg: Record<string, { bg: string; color: string; border: string }> = {
    admin:    { bg: "#FEF2F2", color: "#B82828", border: "rgba(184,40,40,0.2)" },
    operator: { bg: "#EEF2FF", color: "#1E3CB8", border: "rgba(30,60,184,0.2)" },
    readonly: { bg: "#F4F2EE", color: "#8C95A8", border: "#E5DDD0" },
  };
  const s = cfg[role] ?? cfg.readonly;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 6, padding: "2px 8px", fontSize: "0.7rem", fontWeight: 700 }}>
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
    } catch {
      setError("Access denied — admin role required");
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="flex flex-col bg-nyx-bg" style={{ minHeight: "100vh", padding: "28px", gap: "20px" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white"
            style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <Users size={14} className="text-nyx-accent" />
          </div>
          <div>
            <h1 className="text-nyx-text text-xl font-bold tracking-tight"
              style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>
              Operator Management
            </h1>
            <p className="text-nyx-muted text-xs mt-0.5">Multi-operator RBAC — admin, operator, readonly</p>
          </div>
        </div>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreate(v => !v)}
          className="btn-primary flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold">
          <Plus size={14} /> Add Operator
        </motion.button>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
            style={{ background: "#FEF2F2", border: "1px solid rgba(184,40,40,0.2)", color: "#B82828" }}>
            <X size={14} /> {error}
            <button onClick={() => setError("")} className="ml-auto"><X size={12} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create panel */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl p-5 overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
            <h3 className="font-semibold text-nyx-text text-sm mb-4">New Operator</h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)}
                placeholder="Username" className="input-base rounded-xl px-3 py-2 text-sm" />
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Password" className="input-base rounded-xl px-3 py-2 text-sm" />
              <select value={newRole} onChange={e => setNewRole(e.target.value as "admin"|"operator"|"readonly")}
                className="input-base rounded-xl px-3 py-2 text-sm">
                <option value="operator">operator</option>
                <option value="admin">admin</option>
                <option value="readonly">readonly</option>
              </select>
            </div>
            <div className="flex gap-2">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={createOperator} disabled={creating}
                className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
                {creating ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-3 h-3 rounded-full border border-white border-t-transparent" /> : <Check size={13} />}
                Create
              </motion.button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm text-nyx-muted hover:text-nyx-text transition-colors">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Operators table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl overflow-hidden" style={{ border: "1px solid #E5DDD0" }}>
        <div className="grid text-xs font-semibold text-nyx-muted uppercase tracking-wide px-5 py-3"
          style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto", borderBottom: "1px solid #F0EBE3", letterSpacing: "0.08em" }}>
          <span>Username</span><span>Role</span><span>Status</span><span>Last Login</span><span>Actions</span>
        </div>
        {loading && (
          <div className="flex items-center justify-center p-12">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-5 h-5 rounded-full border-2 border-nyx-accent border-t-transparent" />
          </div>
        )}
        <AnimatePresence>
          {operators.map((op, i) => (
            <motion.div key={op.id}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }}
              transition={{ delay: i * 0.04 }}
              className="grid items-center px-5 py-3.5 hover:bg-nyx-bg transition-colors"
              style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr auto", borderBottom: "1px solid #F8F6F1" }}>
              {/* Username */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{ background: "#EEF2FF", color: "#1E3CB8" }}>
                  {op.username[0].toUpperCase()}
                </div>
                <span className="font-semibold text-nyx-text text-sm mono">{op.username}</span>
              </div>
              {/* Role */}
              <div>
                {editId === op.id ? (
                  <div className="flex items-center gap-1.5">
                    <select value={editRole} onChange={e => setEditRole(e.target.value as "admin"|"operator"|"readonly")}
                      className="input-base rounded-lg px-2 py-1 text-xs">
                      <option value="operator">operator</option>
                      <option value="admin">admin</option>
                      <option value="readonly">readonly</option>
                    </select>
                    <button onClick={() => updateRole(op.id, editRole)}
                      className="p-1 rounded text-nyx-green hover:bg-green-50"><Check size={12} /></button>
                    <button onClick={() => setEditId(null)}
                      className="p-1 rounded text-nyx-muted hover:bg-nyx-bg"><X size={12} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {rolePill(op.role)}
                    {op.role === "admin" && <Shield size={11} style={{ color: "#B82828" }} />}
                  </div>
                )}
              </div>
              {/* Status */}
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold"
                  style={{ color: op.is_active ? "#0A6B4A" : "#8C95A8" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: op.is_active ? "#0A6B4A" : "#C5C9D4" }} />
                  {op.is_active ? "Active" : "Disabled"}
                </span>
              </div>
              {/* Last Login */}
              <span className="mono text-xs text-nyx-muted">
                {op.last_login ? new Date(op.last_login).toLocaleString() : "never"}
              </span>
              {/* Actions */}
              <div className="flex items-center gap-1">
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={() => { setEditId(op.id); setEditRole(op.role); }}
                  className="p-1.5 rounded-lg hover:bg-nyx-bg transition-colors" title="Edit role">
                  <Edit3 size={13} className="text-nyx-muted" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={() => toggleActive(op)}
                  className="p-1.5 rounded-lg hover:bg-nyx-bg transition-colors" title="Toggle active">
                  <Eye size={13} className="text-nyx-muted" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  onClick={() => deleteOperator(op.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Delete">
                  <Trash2 size={13} className="text-nyx-red" />
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {!loading && operators.length === 0 && (
          <div className="text-center py-12 text-nyx-muted text-sm">No operators found</div>
        )}
      </motion.div>

      {/* Role legend */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl p-5" style={{ border: "1px solid #E5DDD0" }}>
        <h3 className="font-semibold text-nyx-text text-sm mb-3">Role Permissions</h3>
        <div className="grid grid-cols-3 gap-4 text-xs">
          {[
            { role: "admin", perms: ["All operations", "Operator management", "Delete agents", "IOC export"] },
            { role: "operator", perms: ["View agents", "Execute tasks", "Payload builder", "IOC export"] },
            { role: "readonly", perms: ["View agents", "View tasks", "View reports", "No execution"] },
          ].map(({ role, perms }) => (
            <div key={role} className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: "#F8F6F1", border: "1px solid #F0EBE3" }}>
              <div className="mb-1">{rolePill(role)}</div>
              {perms.map(p => (
                <span key={p} className="flex items-center gap-1.5 text-nyx-muted">
                  <Check size={10} className="text-nyx-green flex-shrink-0" /> {p}
                </span>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
