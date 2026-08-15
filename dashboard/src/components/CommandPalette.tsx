import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Cpu, Activity, Terminal, Package, FileText,
  Archive, Globe, Brain, ShieldAlert, Wifi, ListChecks, Users,
  LogOut, Search,
} from "lucide-react";

interface Command {
  id: string;
  label: string;
  category: string;
  icon: React.ElementType;
  action: () => void;
  shortcut?: string;
}

interface Props {
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

export default function CommandPalette({ onNavigate, onLogout }: Props) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => { setOpen(false); setQuery(""); setSelected(0); }, []);

  const commands: Command[] = [
    { id: "dashboard",    label: "Dashboard",    category: "Navigate", icon: LayoutDashboard, action: () => onNavigate("dashboard"),    shortcut: "Alt+1" },
    { id: "agents",       label: "Agents",       category: "Navigate", icon: Cpu,             action: () => onNavigate("agents"),       shortcut: "Alt+2" },
    { id: "tasks",        label: "Tasks",        category: "Navigate", icon: Activity,        action: () => onNavigate("tasks"),        shortcut: "Alt+3" },
    { id: "console",      label: "Console",      category: "Navigate", icon: Terminal,        action: () => onNavigate("console"),      shortcut: "Alt+4" },
    { id: "reports",      label: "Reports",      category: "Navigate", icon: FileText,        action: () => onNavigate("reports"),      shortcut: "Alt+5" },
    { id: "builder",      label: "Builder",      category: "Navigate", icon: Package,         action: () => onNavigate("builder") },
    { id: "loot",         label: "Loot",         category: "Navigate", icon: Archive,         action: () => onNavigate("loot") },
    { id: "network",      label: "Network Map",  category: "Navigate", icon: Globe,           action: () => onNavigate("network") },
    { id: "intelligence", label: "Intelligence", category: "Navigate", icon: Brain,           action: () => onNavigate("intelligence") },
    { id: "persistence",  label: "Persistence",  category: "Navigate", icon: ShieldAlert,     action: () => onNavigate("persistence") },
    { id: "extc2",        label: "Ext C2",       category: "Navigate", icon: Wifi,            action: () => onNavigate("extc2") },
    { id: "playbooks",    label: "Playbooks",    category: "Navigate", icon: ListChecks,      action: () => onNavigate("playbooks") },
    { id: "admin",        label: "Operators",    category: "Navigate", icon: Users,           action: () => onNavigate("admin") },
    { id: "logout",       label: "Disconnect",   category: "Actions",  icon: LogOut,          action: onLogout },
  ];

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      )
    : commands;

  const groups = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    (acc[cmd.category] ??= []).push(cmd);
    return acc;
  }, {});

  const flat = Object.values(groups).flat();

  const run = useCallback((cmd: Command) => {
    cmd.action();
    close();
  }, [close]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => { if (!o) { setQuery(""); setSelected(0); } return !o; });
        return;
      }
      if (!open) return;
      if (e.key === "Escape")    { close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && flat[selected]) run(flat[selected]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flat, selected, run, close]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 40); }, [open]);
  useEffect(() => { setSelected(0); }, [query]);

  const KBD = ({ children }: { children: React.ReactNode }) => (
    <span style={{
      fontFamily: "'Fira Code', monospace", fontSize: 9, color: "#2A2A2A",
      background: "#0A0A0A", border: "1px solid #1F1F1F", padding: "1px 5px",
    }}>
      {children}
    </span>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={close}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000 }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              position: "fixed", top: "18%", left: "50%", transform: "translateX(-50%)",
              width: "min(520px, 90vw)", zIndex: 1001, overflow: "hidden",
              background: "#050505", border: "1px solid #2A2A2A",
              boxShadow: "0 0 40px rgba(0,255,65,0.07), 0 24px 60px rgba(0,0,0,0.85)",
            }}
          >
            {/* Search input */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #1F1F1F" }}>
              <Search size={13} style={{ color: "#4A4A4A", flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="search commands..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontFamily: "'Fira Code', monospace", fontSize: 13, color: "#E0E0E0",
                }}
              />
              <KBD>ESC</KBD>
            </div>

            {/* Results */}
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {Object.entries(groups).map(([category, cmds]) => (
                <div key={category}>
                  <div style={{
                    padding: "8px 16px 4px",
                    fontFamily: "'Fira Code', monospace", fontSize: 9,
                    color: "#2A2A2A", letterSpacing: "0.2em", textTransform: "uppercase",
                  }}>
                    // {category}
                  </div>
                  {cmds.map(cmd => {
                    const idx = flat.indexOf(cmd);
                    const active = idx === selected;
                    const Icon = cmd.icon;
                    return (
                      <div
                        key={cmd.id}
                        onClick={() => run(cmd)}
                        onMouseEnter={() => setSelected(idx)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "9px 16px", cursor: "pointer",
                          background: active ? "rgba(0,255,65,0.06)" : "transparent",
                          borderLeft: active ? "2px solid #00FF41" : "2px solid transparent",
                          transition: "all 0.08s",
                        }}
                      >
                        <Icon size={12} style={{ color: active ? "#00FF41" : "#4A4A4A", flexShrink: 0 }} />
                        <span style={{
                          fontFamily: "'Fira Code', monospace", fontSize: 12,
                          color: active ? "#E0E0E0" : "#9A9A9A", flex: 1,
                        }}>
                          {cmd.label}
                        </span>
                        {cmd.shortcut && <KBD>{cmd.shortcut}</KBD>}
                      </div>
                    );
                  })}
                </div>
              ))}

              {filtered.length === 0 && (
                <div style={{ padding: "32px 16px", textAlign: "center", fontFamily: "'Fira Code', monospace", fontSize: 11, color: "#2A2A2A" }}>
                  {"[ NO COMMANDS FOUND ]"}
                </div>
              )}
            </div>

            {/* Footer hints */}
            <div style={{ padding: "6px 14px", borderTop: "1px solid #1F1F1F", display: "flex", gap: 14, alignItems: "center" }}>
              {([["↑↓", "navigate"], ["↵", "execute"], ["ESC", "close"]] as [string, string][]).map(([key, label]) => (
                <span key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'Fira Code', monospace", fontSize: 9, color: "#2A2A2A" }}>
                  <KBD>{key}</KBD>{label}
                </span>
              ))}
              <span style={{ marginLeft: "auto", fontFamily: "'Fira Code', monospace", fontSize: 9, color: "#1F1F1F" }}>
                ⌘K
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
