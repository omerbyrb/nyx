import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Cpu, LayoutDashboard, Activity,
  Package, FileText, Users, Archive, Globe, Brain,
  ShieldAlert, Wifi, ListChecks, Power, Shield
} from "lucide-react";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const navGroups = [
  {
    label: "Operations",
    items: [
      { id: "dashboard", label: "Dashboard",  icon: LayoutDashboard },
      { id: "agents",    label: "Agents",     icon: Cpu },
      { id: "tasks",     label: "Tasks",      icon: Activity },
      { id: "console",   label: "Console",    icon: Terminal },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "loot",         label: "Loot",        icon: Archive },
      { id: "network",      label: "Network",     icon: Globe },
      { id: "intelligence", label: "Intel",       icon: Brain },
      { id: "playbooks",    label: "Playbooks",   icon: ListChecks },
    ],
  },
  {
    label: "Deployment",
    items: [
      { id: "builder",     label: "Builder",     icon: Package },
      { id: "persistence", label: "Persistence", icon: ShieldAlert },
      { id: "extc2",       label: "Ext C2",      icon: Wifi },
    ],
  },
  {
    label: "System",
    items: [
      { id: "reports", label: "Reports",   icon: FileText },
      { id: "admin",   label: "Operators", icon: Users },
    ],
  },
];

function NavItem({
  id, label, icon: Icon, active, onClick,
}: {
  id: string; label: string; icon: React.ElementType; active: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      key={id}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="relative w-full flex items-center gap-2.5 px-3 py-1.5 rounded text-sm"
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
        fontWeight: active ? 500 : 400,
        transition: "all 0.12s ease",
        color: active ? "var(--accent)" : "var(--text-muted)",
        textAlign: "left",
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text)";
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
      }}
    >
      <AnimatePresence>
        {active && (
          <motion.div
            layoutId="sidebar-active"
            className="absolute inset-0 rounded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ background: "var(--accent-dim)" }}
            transition={{ duration: 0.15 }}
          />
        )}
      </AnimatePresence>

      {active && (
        <div
          className="absolute left-0 top-1 bottom-1 rounded-full"
          style={{ width: 2, background: "var(--accent)" }}
        />
      )}

      <span className="relative z-10 flex items-center gap-2.5 w-full">
        <Icon size={14} style={{ flexShrink: 0 }} />
        {label}
      </span>
    </motion.button>
  );
}

export default function Sidebar({ activePage, onNavigate, onLogout }: SidebarProps) {
  return (
    <motion.aside
      initial={{ x: -16, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-52 flex flex-col"
      style={{
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        minHeight: "100vh",
      }}
    >
      {/* Logo */}
      <div
        className="px-4 py-4 flex items-center gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div
          className="w-7 h-7 flex items-center justify-center rounded"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid rgba(0, 255, 65, 0.3)",
          }}
        >
          <Shield size={14} color="var(--accent)" />
        </div>
        <div>
          <div
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: "13px",
              color: "var(--text)",
              letterSpacing: "0.04em",
            }}
          >
            NYX C2
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "10px",
              color: "var(--text-faint)",
            }}
          >
            v1.5.0
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {navGroups.map(group => (
          <div key={group.label}>
            <div
              className="px-3 mb-1"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {group.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              {group.items.map(({ id, label, icon }) => (
                <NavItem
                  key={id}
                  id={id}
                  label={label}
                  icon={icon}
                  active={activePage === id}
                  onClick={() => onNavigate(id)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-2 pb-3 pt-3"
        style={{ borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px" }}
      >
        {/* Status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div style={{ position: "relative", width: 7, height: 7, flexShrink: 0 }}>
            <div
              style={{
                width: 7, height: 7,
                borderRadius: "50%",
                background: "var(--accent)",
                position: "relative",
                zIndex: 1,
              }}
            />
            <motion.div
              animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "var(--accent)",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "10px",
              color: "var(--text-faint)",
            }}
          >
            Server online
          </span>
        </div>

        {/* Logout */}
        <motion.button
          onClick={onLogout}
          whileTap={{ scale: 0.97 }}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded text-sm"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-faint)",
            fontFamily: "'Inter', sans-serif",
            cursor: "pointer",
            transition: "all 0.12s",
            textAlign: "left",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--red)";
            el.style.background = "var(--red-dim)";
            el.style.borderRadius = "6px";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "var(--text-faint)";
            el.style.background = "transparent";
          }}
        >
          <Power size={14} />
          Sign out
        </motion.button>
      </div>
    </motion.aside>
  );
}
