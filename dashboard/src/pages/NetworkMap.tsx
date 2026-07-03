import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api/client";
import { Globe, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";

interface Port { port: number; service: string; }
interface ScanEntry { task_id: string; agent: string; command: string; output: string; open_ports: Port[]; timestamp: string; }
interface LootData { scans: ScanEntry[]; }

interface Node {
  id: string;
  label: string;
  type: "agent" | "target" | "c2";
  ports: Port[];
  x: number;
  y: number;
  agent: string;
}

interface Edge { from: string; to: string; }

const SERVICE_COLORS: Record<string, string> = {
  ssh: "#0A6B4A", http: "#1E3CB8", https: "#6B46C1",
  rdp: "#B82828", smb: "#A85F0A", ftp: "#8C95A8",
  mysql: "#0A6B4A", mssql: "#B82828", redis: "#A85F0A",
  vnc: "#B82828", telnet: "#B82828",
};

function serviceColor(s: string): string {
  return SERVICE_COLORS[s.toLowerCase()] ?? "#8C95A8";
}

export default function NetworkMap() {
  const [loot, setLoot] = useState<LootData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Node | null>(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    api.get<LootData>("/api/loot/")
      .then(r => setLoot(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const { nodes, edges } = buildGraph(loot?.scans ?? []);

  return (
    <div className="flex flex-col bg-nyx-bg" style={{ minHeight: "100vh", padding: "28px", gap: "16px" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white"
            style={{ border: "1px solid #E5DDD0", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <Globe size={14} className="text-nyx-accent" />
          </div>
          <div>
            <h1 className="text-nyx-text text-xl font-bold tracking-tight"
              style={{ fontFamily: "Bricolage Grotesque, sans-serif", letterSpacing: "-0.02em" }}>Network Map</h1>
            <p className="text-nyx-muted text-xs mt-0.5">Topology built from portscan and hostscan results</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setZoom(z => Math.min(z + 0.2, 2))}
            className="p-2 rounded-xl bg-white" style={{ border: "1px solid #E5DDD0" }}>
            <ZoomIn size={14} className="text-nyx-muted" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setZoom(z => Math.max(z - 0.2, 0.4))}
            className="p-2 rounded-xl bg-white" style={{ border: "1px solid #E5DDD0" }}>
            <ZoomOut size={14} className="text-nyx-muted" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => { setLoading(true); api.get<LootData>("/api/loot/").then(r => setLoot(r.data)).finally(() => setLoading(false)); }}
            className="p-2 rounded-xl bg-white" style={{ border: "1px solid #E5DDD0" }}>
            <motion.span animate={loading ? { rotate: 360 } : {}} transition={loading ? { duration: 0.8, repeat: Infinity, ease: "linear" } : {}}>
              <RefreshCw size={14} className="text-nyx-muted" />
            </motion.span>
          </motion.button>
        </div>
      </motion.div>

      <div className="flex gap-4 flex-1" style={{ minHeight: 0 }}>
        {/* SVG Map */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
          className="flex-1 bg-white rounded-2xl overflow-hidden relative"
          style={{ border: "1px solid #E5DDD0", minHeight: 500 }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-6 h-6 rounded-full border-2 border-nyx-accent border-t-transparent" />
            </div>
          )}
          {!loading && nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Globe size={40} style={{ color: "#E5DDD0" }} />
              <p className="text-nyx-muted text-sm">No scan data yet</p>
              <p className="text-nyx-muted text-xs">Run <span className="mono font-semibold">portscan</span> or <span className="mono font-semibold">hostscan</span> on an agent</p>
            </div>
          )}
          {!loading && nodes.length > 0 && (
            <svg ref={svgRef} width="100%" height="100%" style={{ minHeight: 500 }}>
              <g transform={`scale(${zoom})`}>
                {/* Grid dots */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <circle cx="20" cy="20" r="1" fill="#E5DDD0" />
                  </pattern>
                </defs>
                <rect width="2000" height="2000" fill="url(#grid)" />

                {/* Edges */}
                {edges.map((e, i) => {
                  const from = nodes.find(n => n.id === e.from);
                  const to   = nodes.find(n => n.id === e.to);
                  if (!from || !to) return null;
                  return (
                    <line key={i}
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="#E5DDD0" strokeWidth={1.5} strokeDasharray="4 4" />
                  );
                })}

                {/* Nodes */}
                {nodes.map(node => (
                  <g key={node.id} onClick={() => setSelected(selected?.id === node.id ? null : node)}
                    style={{ cursor: "pointer" }}>
                    {/* Glow ring for selected */}
                    {selected?.id === node.id && (
                      <circle cx={node.x} cy={node.y} r={32}
                        fill="none" stroke="#1E3CB8" strokeWidth={2} strokeOpacity={0.3} />
                    )}
                    {/* Node circle */}
                    <circle cx={node.x} cy={node.y} r={22}
                      fill={node.type === "c2" ? "#1E3CB8" : node.type === "agent" ? "#0A6B4A" : "#FFFFFF"}
                      stroke={node.type === "target" ? "#E5DDD0" : "none"}
                      strokeWidth={2}
                      style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.1))" }} />
                    {/* Port dots around node */}
                    {node.ports.slice(0, 8).map((p, pi) => {
                      const angle = (pi / Math.max(node.ports.length, 8)) * 2 * Math.PI - Math.PI / 2;
                      const r = 34;
                      const px = node.x + Math.cos(angle) * r;
                      const py = node.y + Math.sin(angle) * r;
                      return <circle key={pi} cx={px} cy={py} r={5} fill={serviceColor(p.service)}
                        stroke="white" strokeWidth={1.5} />;
                    })}
                    {/* Label */}
                    <text x={node.x} y={node.y + 40} textAnchor="middle"
                      style={{ fontSize: 11, fontFamily: "Geist Mono, monospace", fill: "#0C0F1A", fontWeight: 600 }}>
                      {node.label}
                    </text>
                    {node.type !== "c2" && node.agent && (
                      <text x={node.x} y={node.y + 52} textAnchor="middle"
                        style={{ fontSize: 9, fontFamily: "Geist Mono, monospace", fill: "#8C95A8" }}>
                        via {node.agent}
                      </text>
                    )}
                    {/* Icon letter */}
                    <text x={node.x} y={node.y + 5} textAnchor="middle"
                      style={{ fontSize: 14, fontFamily: "Bricolage Grotesque, sans-serif", fontWeight: 700,
                        fill: node.type === "target" ? "#0C0F1A" : "#FFFFFF" }}>
                      {node.type === "c2" ? "C2" : node.type === "agent" ? "A" : node.label[0].toUpperCase()}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          )}
        </motion.div>

        {/* Side panel */}
        <AnimatePresence>
          {selected && (
            <motion.div key={selected.id}
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              className="w-64 bg-white rounded-2xl p-5 flex flex-col gap-4 flex-shrink-0"
              style={{ border: "1px solid #E5DDD0", alignSelf: "flex-start" }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full"
                    style={{ background: selected.type === "c2" ? "#1E3CB8" : selected.type === "agent" ? "#0A6B4A" : "#E5DDD0" }} />
                  <span className="mono font-bold text-sm text-nyx-text">{selected.label}</span>
                </div>
                <span className="text-xs text-nyx-muted capitalize">{selected.type}</span>
                {selected.agent && <p className="text-xs text-nyx-muted mt-0.5">via {selected.agent}</p>}
              </div>
              {selected.ports.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-nyx-muted uppercase tracking-wide mb-2">Open Ports</p>
                  <div className="flex flex-col gap-1.5">
                    {selected.ports.map(p => (
                      <div key={p.port} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                        style={{ background: "#F8F6F1", border: "1px solid #F0EBE3" }}>
                        <span className="mono text-xs font-bold" style={{ color: serviceColor(p.service) }}>{p.port}</span>
                        <span className="mono text-xs text-nyx-muted">{p.service}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setSelected(null)} className="text-xs text-nyx-muted hover:text-nyx-text transition-colors mt-auto">
                Close ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="flex items-center gap-6 flex-shrink-0">
        {[
          { color: "#1E3CB8", label: "C2 Server" },
          { color: "#0A6B4A", label: "Compromised Agent" },
          { color: "#E5DDD0", label: "Discovered Host" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs text-nyx-muted">
            <div className="w-3 h-3 rounded-full" style={{ background: color, border: color === "#E5DDD0" ? "1px solid #C5C9D4" : "none" }} />
            {label}
          </div>
        ))}
        <span className="text-nyx-muted text-xs">·</span>
        <span className="text-nyx-muted text-xs">Colored dots = open ports</span>
      </motion.div>
    </div>
  );
}

function buildGraph(scans: ScanEntry[]): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map<string, Node>();
  const edges: Edge[] = [];

  // C2 node at center
  const cx = 400, cy = 300;
  nodeMap.set("c2", { id: "c2", label: "Nyx C2", type: "c2", ports: [], x: cx, y: cy, agent: "" });

  // Agent nodes around C2
  const agents = [...new Set(scans.map(s => s.agent))];
  agents.forEach((agent, i) => {
    const angle = (i / Math.max(agents.length, 1)) * 2 * Math.PI;
    const r = 120;
    const id = `agent-${agent}`;
    nodeMap.set(id, {
      id, label: agent, type: "agent", ports: [], agent: "",
      x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r,
    });
    edges.push({ from: "c2", to: id });
  });

  // Target nodes from scans
  scans.forEach(scan => {
    if (scan.open_ports.length === 0) return;
    const cmdParts = scan.command.split(" ");
    const host = cmdParts[1] ?? "unknown";
    if (!host || host === "unknown") return;

    const targetId = `target-${host}`;
    const agentId = `agent-${scan.agent}`;
    const agentNode = nodeMap.get(agentId);

    if (!nodeMap.has(targetId)) {
      const existingCount = [...nodeMap.values()].filter(n => n.type === "target").length;
      const angle = (existingCount / 8) * 2 * Math.PI + (agentNode ? Math.atan2(agentNode.y - cy, agentNode.x - cx) : 0);
      const r = 220;
      nodeMap.set(targetId, {
        id: targetId, label: host, type: "target",
        ports: scan.open_ports,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        agent: scan.agent,
      });
    } else {
      // Merge ports
      const existing = nodeMap.get(targetId)!;
      const existingPorts = new Set(existing.ports.map(p => p.port));
      scan.open_ports.forEach(p => { if (!existingPorts.has(p.port)) existing.ports.push(p); });
    }

    edges.push({ from: agentId || "c2", to: targetId });
  });

  return { nodes: [...nodeMap.values()], edges };
}
