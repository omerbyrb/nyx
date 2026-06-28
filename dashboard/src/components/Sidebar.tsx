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
    <aside className="w-60 flex flex-col border-r border-nyx-border bg-nyx-surface" style={{ background: "linear-gradient(180deg, #0C1525 0%, #080F1E 100%)" }}>
      {/* logo */}
      <div className="px-6 py-5 border-b border-nyx-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)", boxShadow: "0 4px 16px rgba(37,99,235,0.4)" }}>
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <div className="text-nyx-cream font-display font-700 tracking-wide text-sm" style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, letterSpacing: "0.08em" }}>NYX C2</div>
            <div className="text-nyx-muted text-xs mono mt-0.5">v0.2.0</div>
          </div>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="text-nyx-muted text-xs uppercase tracking-widest px-3 mb-3" style={{ letterSpacing: "0.12em", fontSize: "10px" }}>Navigation</p>
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
              style={active ? {
                background: "linear-gradient(135deg, rgba(37,99,235,0.2), rgba(37,99,235,0.08))",
                color: "#60A5FA",
                border: "1px solid rgba(37,99,235,0.25)",
              } : {
                color: "#475569",
                border: "1px solid transparent",
              }}
              onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "#94A3B8"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; } }}
              onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.color = "#475569"; (e.currentTarget as HTMLElement).style.background = "transparent"; } }}
            >
              <Icon size={15} />
              {label}
              {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-nyx-accent-light" />}
            </button>
          );
        })}
      </nav>

      {/* footer */}
      <div className="px-3 pb-4 space-y-2 border-t border-nyx-border pt-4">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-nyx-green" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-nyx-green animate-ping opacity-40" />
          </div>
          <span className="text-nyx-dim text-xs">Server Online</span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-nyx-muted transition-all duration-150 hover:text-nyx-red hover:bg-red-950/20"
          style={{ border: "1px solid transparent" }}
        >
          <LogOut size={15} />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
