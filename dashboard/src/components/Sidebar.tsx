import { Terminal, Cpu, LayoutDashboard, Activity, LogOut } from "lucide-react";

interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "agents", label: "Agents", icon: Cpu },
  { id: "tasks", label: "Tasks", icon: Activity },
  { id: "console", label: "Console", icon: Terminal },
];

export default function Sidebar({ activePage, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="w-56 bg-nyx-surface border-r border-nyx-border flex flex-col">
      <div className="p-6 border-b border-nyx-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-nyx-accent flex items-center justify-center">
            <span className="text-white text-sm font-bold">N</span>
          </div>
          <div>
            <div className="text-nyx-text font-semibold text-sm">NYX C2</div>
            <div className="text-nyx-muted text-xs">v0.2.0</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
              activePage === id
                ? "bg-nyx-accent text-white"
                : "text-nyx-muted hover:text-nyx-text hover:bg-nyx-border"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-nyx-border space-y-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2 h-2 rounded-full bg-nyx-green animate-pulse" />
          <span className="text-nyx-muted text-xs">Server Online</span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-nyx-muted hover:text-nyx-red hover:bg-nyx-border transition-colors"
        >
          <LogOut size={16} />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
