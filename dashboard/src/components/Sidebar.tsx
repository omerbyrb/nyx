import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Cpu, LayoutDashboard, Activity,
  Package, FileText, Users, Archive, Globe, Brain,
  ShieldAlert, Wifi, Power, ListChecks
} from "lucide-react";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const navItems = [
  { id: "dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { id: "agents",       label: "Agents",       icon: Cpu },
  { id: "tasks",        label: "Tasks",        icon: Activity },
  { id: "console",      label: "Console",      icon: Terminal },
  { id: "builder",      label: "Builder",      icon: Package },
  { id: "reports",      label: "Reports",      icon: FileText },
  { id: "loot",         label: "Loot",         icon: Archive },
  { id: "network",      label: "Network",      icon: Globe },
  { id: "intelligence", label: "Intelligence", icon: Brain },
  { id: "persistence",  label: "Persistence",  icon: ShieldAlert },
  { id: "extc2",        label: "Ext C2",       icon: Wifi },
  { id: "playbooks",    label: "Playbooks",    icon: ListChecks },
  { id: "admin",        label: "Operators",    icon: Users },
];

export default function Sidebar({ activePage, onNavigate, onLogout }: SidebarProps) {
  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-52 flex flex-col scanlines"
      style={{
        background: "#000",
        borderRight: "1px solid #1F1F1F",
        boxShadow: "1px 0 0 #00FF4108",
        minHeight: "100vh",
      }}
    >
      {/* Logo */}
      <div
        className="px-4 py-4"
        style={{ borderBottom: "1px solid #1F1F1F" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 flex items-center justify-center"
            style={{
              border: "1px solid #00FF41",
              boxShadow: "0 0 10px rgba(0,255,65,0.4), inset 0 0 8px rgba(0,255,65,0.06)",
            }}
          >
            <Terminal size={14} color="#00FF41" />
          </div>
          <div>
            <div
              className="text-sm font-bold tracking-widest glitch"
              style={{
                fontFamily: "'Fira Code', monospace",
                color: "#00FF41",
                textShadow: "0 0 8px rgba(0,255,65,0.6)",
                letterSpacing: "0.12em",
              }}
            >
              NYX C2
            </div>
            <div
              className="text-xs"
              style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}
            >
              v1.4.0
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        <div
          className="px-2 mb-3 text-xs tracking-widest"
          style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}
        >
          // NAVIGATION
        </div>
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <motion.button
              key={id}
              onClick={() => onNavigate(id)}
              whileTap={{ scale: 0.97 }}
              className="relative w-full flex items-center gap-2.5 px-3 py-2 text-xs"
              style={{
                background: "transparent",
                border: "1px solid transparent",
                cursor: "pointer",
                fontFamily: "'Fira Code', monospace",
                transition: "all 0.12s ease",
              }}
            >
              <AnimatePresence>
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      background: "rgba(0,255,65,0.05)",
                      border: "1px solid rgba(0,255,65,0.25)",
                      boxShadow: "inset 1px 0 0 #00FF41",
                    }}
                    transition={{ duration: 0.15 }}
                  />
                )}
              </AnimatePresence>

              {/* active left-bar accent */}
              {active && (
                <div
                  className="absolute left-0 top-0 bottom-0"
                  style={{ width: "2px", background: "#00FF41", boxShadow: "0 0 6px #00FF41" }}
                />
              )}

              <span
                className="relative z-10 flex items-center gap-2.5 w-full"
                style={{
                  color: active ? "#00FF41" : "#4A4A4A",
                  textShadow: active ? "0 0 4px rgba(0,255,65,0.5)" : "none",
                  transition: "color 0.12s",
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = "#9A9A9A";
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = "#4A4A4A";
                }}
              >
                <Icon size={13} />
                {label}
                {active && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="ml-auto"
                    style={{
                      width: 4, height: 4,
                      background: "#00FF41",
                      borderRadius: "50%",
                      boxShadow: "0 0 4px #00FF41",
                    }}
                  />
                )}
              </span>
            </motion.button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-2 pb-3 pt-3 space-y-1"
        style={{ borderTop: "1px solid #1F1F1F" }}
      >
        {/* Status */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="relative flex-shrink-0">
            <div
              style={{
                width: 6, height: 6,
                borderRadius: "50%",
                background: "#00FF41",
                boxShadow: "0 0 6px #00FF41",
              }}
            />
            <motion.div
              animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: "#00FF41",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: "10px",
              color: "#4A4A4A",
            }}
          >
            SERVER_ONLINE
          </span>
        </div>

        {/* Logout */}
        <motion.button
          onClick={onLogout}
          whileTap={{ scale: 0.97 }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs"
          style={{
            background: "transparent",
            border: "1px solid transparent",
            color: "#4A4A4A",
            fontFamily: "'Fira Code', monospace",
            cursor: "pointer",
            transition: "all 0.12s",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "#FF3333";
            el.style.border = "1px solid rgba(255,51,51,0.2)";
            el.style.background = "rgba(255,51,51,0.05)";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLElement;
            el.style.color = "#4A4A4A";
            el.style.border = "1px solid transparent";
            el.style.background = "transparent";
          }}
        >
          <Power size={13} />
          DISCONNECT
        </motion.button>
      </div>
    </motion.aside>
  );
}
