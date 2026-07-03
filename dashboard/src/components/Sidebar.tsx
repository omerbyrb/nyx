import { motion } from "framer-motion";
import { Terminal, Cpu, LayoutDashboard, Activity, LogOut, Package, FileText, Users, Archive } from "lucide-react";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "agents",    label: "Agents",    icon: Cpu },
  { id: "tasks",     label: "Tasks",     icon: Activity },
  { id: "console",   label: "Console",   icon: Terminal },
  { id: "builder",   label: "Builder",   icon: Package },
  { id: "reports",   label: "Reports",   icon: FileText },
  { id: "loot",      label: "Loot",      icon: Archive },
  { id: "admin",     label: "Operators", icon: Users },
];

export default function Sidebar({ activePage, onNavigate, onLogout }: SidebarProps) {
  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0,   opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-56 flex flex-col bg-white border-r border-nyx-border"
      style={{ boxShadow: "1px 0 0 #E5DDD0" }}
    >
      {/* logo */}
      <div className="px-5 py-5 border-b border-nyx-border">
        <div className="flex items-center gap-3">
          <motion.img
            src="/logo.png"
            alt="Nyx"
            whileHover={{ scale: 1.08, rotate: -3 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="w-9 h-9 rounded-xl cursor-default object-cover"
            style={{ boxShadow: "0 2px 8px rgba(30,60,184,0.25)" }}
          />
          <div>
            <div className="text-nyx-text font-semibold text-sm" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.01em" }}>Nyx C2</div>
            <div className="text-nyx-muted text-xs mono">v0.3.0</div>
          </div>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-nyx-muted px-3 mb-3 font-semibold" style={{ fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Menu</p>
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <motion.button
              key={id}
              onClick={() => onNavigate(id)}
              whileHover={{ x: active ? 0 : 3 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium relative"
              style={{
                color: active ? "#1E3CB8" : "#8C95A8",
                border: "1px solid transparent",
                background: "transparent",
              }}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: "#EEF1FB", border: "1px solid rgba(30,60,184,0.15)" }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2.5 w-full">
                <Icon size={15} />
                {label}
                {active && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="ml-auto w-1.5 h-1.5 rounded-full bg-nyx-accent"
                  />
                )}
              </span>
            </motion.button>
          );
        })}
      </nav>

      {/* footer */}
      <div className="px-3 pb-4 pt-3 border-t border-nyx-border space-y-1">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-nyx-green" />
            <motion.div
              animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 w-2 h-2 rounded-full bg-nyx-green"
            />
          </div>
          <span className="text-nyx-muted text-xs font-medium">Server Online</span>
        </div>
        <motion.button
          onClick={onLogout}
          whileHover={{ x: 3 }}
          whileTap={{ scale: 0.97 }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-nyx-muted transition-colors duration-150 hover:text-nyx-red hover:bg-red-50"
          style={{ border: "1px solid transparent" }}
        >
          <LogOut size={15} />
          Disconnect
        </motion.button>
      </div>
    </motion.aside>
  );
}
