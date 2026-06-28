import { Terminal, Cpu, LayoutDashboard, Activity, LogOut, Zap } from "lucide-react";

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
];

export default function Sidebar({ activePage, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="w-56 flex flex-col bg-white border-r border-nyx-border" style={{ boxShadow: "1px 0 0 #E5DDD0" }}>
      <div className="px-5 py-5 border-b border-nyx-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(145deg, #2546CC, #1E3CB8)", boxShadow: "0 2px 8px rgba(30,60,184,0.3)" }}>
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <div className="text-nyx-text font-semibold text-sm tracking-tight" style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.01em" }}>Nyx C2</div>
            <div className="text-nyx-muted text-xs mono">v0.2.0</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-nyx-muted text-xs px-3 mb-3 font-medium" style={{ fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Menu</p>
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
              style={active ? {
                background: "#EEF1FB",
                color: "#1E3CB8",
                border: "1px solid rgba(30,60,184,0.15)",
              } : {
                color: "#8C95A8",
                border: "1px solid transparent",
                background: "transparent",
              }}
              onMouseEnter={e => { if (!active) { const el = e.currentTarget; el.style.background = "#F8F6F1"; el.style.color = "#3D4559"; } }}
              onMouseLeave={e => { if (!active) { const el = e.currentTarget; el.style.background = "transparent"; el.style.color = "#8C95A8"; } }}
            >
              <Icon size={15} />
              {label}
              {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-nyx-accent" />}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-4 pt-3 border-t border-nyx-border space-y-1">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-nyx-green" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-nyx-green animate-ping opacity-40" />
          </div>
          <span className="text-nyx-muted text-xs font-medium">Server Online</span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-nyx-muted hover:text-nyx-red"
          style={{ border: "1px solid transparent" }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.background = "#FEF0F0"; el.style.borderColor = "rgba(184,40,40,0.1)"; }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.background = "transparent"; el.style.borderColor = "transparent"; }}
        >
          <LogOut size={15} />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
