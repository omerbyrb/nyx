import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api/client";
import { Globe, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";

interface Port { port: number; service: string; }
interface ScanEntry { task_id: string; agent: string; command: string; output: string; open_ports: Port[]; timestamp: string; }
interface LootData { scans: ScanEntry[]; }

interface Node { id: string; label: string; type: "agent" | "target" | "c2"; ports: Port[]; x: number; y: number; agent: string; }
interface Edge { from: string; to: string; }

const SERVICE_COLORS: Record<string, string> = {
  ssh: "#00FF41", http: "#00CC33", https: "#00FF41",
  rdp: "#FF3333", smb: "#FFB800", ftp: "#9A9A9A",
  mysql: "#00FF41", mssql: "#FF3333", redis: "#FFB800",
  vnc: "#FF3333", telnet: "#FF3333",
};

function serviceColor(s: string): string { return SERVICE_COLORS[s.toLowerCase()] ?? "#4A4A4A"; }

function buildGraph(scans: ScanEntry[]): { nodes: Node[]; edges: Edge[] } {
  const nodeMap = new Map<string, Node>();
  const edges: Edge[] = [];
  const cx = 400, cy = 300;

  nodeMap.set("c2", { id: "c2", label: "Nyx C2", type: "c2", ports: [], x: cx, y: cy, agent: "" });

  const agents = [...new Set(scans.map(s => s.agent))];
  agents.forEach((agent, i) => {
    const angle = (i / Math.max(agents.length, 1)) * 2 * Math.PI;
    const id = `agent-${agent}`;
    nodeMap.set(id, { id, label: agent, type: "agent", ports: [], agent: "",
      x: cx + Math.cos(angle) * 120, y: cy + Math.sin(angle) * 120 });
    edges.push({ from: "c2", to: id });
  });

  scans.forEach(scan => {
    if (scan.open_ports.length === 0) return;
    const host = scan.command.split(" ")[1] ?? "unknown";
    if (!host || host === "unknown") return;
    const targetId = `target-${host}`;
    const agentId  = `agent-${scan.agent}`;
    const agentNode = nodeMap.get(agentId);

    if (!nodeMap.has(targetId)) {
      const existingCount = [...nodeMap.values()].filter(n => n.type === "target").length;
      const angle = (existingCount / 8) * 2 * Math.PI + (agentNode ? Math.atan2(agentNode.y - cy, agentNode.x - cx) : 0);
      nodeMap.set(targetId, { id: targetId, label: host, type: "target",
        ports: scan.open_ports, x: cx + Math.cos(angle) * 220, y: cy + Math.sin(angle) * 220, agent: scan.agent });
    } else {
      const existing = nodeMap.get(targetId)!;
      const existingPorts = new Set(existing.ports.map(p => p.port));
      scan.open_ports.forEach(p => { if (!existingPorts.has(p.port)) existing.ports.push(p); });
    }
    edges.push({ from: agentId || "c2", to: targetId });
  });

  return { nodes: [...nodeMap.values()], edges };
}

export default function NetworkMap() {
  const [loot, setLoot]       = useState<LootData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Node | null>(null);
  const [zoom, setZoom]       = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const load = () => {
    setLoading(true);
    api.get<LootData>("/api/loot/")
      .then(r => setLoot(r.data)).catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const { nodes, edges } = buildGraph(loot?.scans ?? []);

  const nodeColor = (n: Node) =>
    n.type === "c2" ? "#00FF41" : n.type === "agent" ? "#00CC33" : "#0D0D0D";
  const nodeStroke = (n: Node) =>
    n.type === "c2" ? "#00FF41" : n.type === "agent" ? "#00CC33" : "#1F1F1F";

  return (
    <div className="flex flex-col" style={{ minHeight: "100vh", padding: "28px", gap: "16px", background: "#000" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
        className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold tracking-widest uppercase"
            style={{ fontFamily: "'Fira Code', monospace", color: "#00FF41", textShadow: "0 0 10px rgba(0,255,65,0.5)" }}>
            // NETWORK_MAP
          </h1>
          <p className="text-xs mt-1" style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
            Topology built from portscan and hostscan results
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { icon: ZoomIn,    onClick: () => setZoom(z => Math.min(z + 0.2, 2)) },
            { icon: ZoomOut,   onClick: () => setZoom(z => Math.max(z - 0.2, 0.4)) },
            { icon: RefreshCw, onClick: load },
          ].map(({ icon: Icon, onClick }, i) => (
            <motion.button key={i} whileTap={{ scale: 0.9 }} onClick={onClick}
              className="p-2"
              style={{ background: "transparent", border: "1px solid #1F1F1F", color: "#4A4A4A", cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#00FF41"; (e.currentTarget as HTMLElement).style.color = "#00FF41"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1F1F1F"; (e.currentTarget as HTMLElement).style.color = "#4A4A4A"; }}>
              <Icon size={13} />
            </motion.button>
          ))}
        </div>
      </motion.div>

      <div className="flex gap-4 flex-1" style={{ minHeight: 0 }}>
        {/* SVG Map */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
          className="flex-1 hud-panel relative"
          style={{ minHeight: 500, overflow: "hidden" }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                style={{ width: 20, height: 20, border: "1px solid #00FF41", borderTopColor: "transparent", borderRadius: "50%" }} />
            </div>
          )}
          {!loading && nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Globe size={36} style={{ color: "#1F1F1F" }} />
              <p className="text-xs" style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}>
                No scan data yet
              </p>
              <p className="text-xs" style={{ fontFamily: "'Fira Code', monospace", color: "#1F1F1F" }}>
                Run <code style={{ color: "#00FF41" }}>portscan</code> or <code style={{ color: "#00FF41" }}>hostscan</code> on an agent
              </p>
            </div>
          )}
          {!loading && nodes.length > 0 && (
            <svg ref={svgRef} width="100%" height="100%" style={{ minHeight: 500 }}>
              <defs>
                <pattern id="nyx-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="0.8" fill="#1F1F1F" />
                </pattern>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                  <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <rect width="2000" height="2000" fill="url(#nyx-grid)" />
              <g transform={`scale(${zoom})`}>
                {/* Edges */}
                {edges.map((e, i) => {
                  const from = nodes.find(n => n.id === e.from);
                  const to   = nodes.find(n => n.id === e.to);
                  if (!from || !to) return null;
                  return (
                    <line key={i}
                      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="#1F1F1F" strokeWidth={1} strokeDasharray="4 4" />
                  );
                })}

                {/* Nodes */}
                {nodes.map(node => (
                  <g key={node.id} onClick={() => setSelected(selected?.id === node.id ? null : node)}
                    style={{ cursor: "pointer" }}>
                    {/* Selection ring */}
                    {selected?.id === node.id && (
                      <circle cx={node.x} cy={node.y} r={32}
                        fill="none" stroke="#00FF41" strokeWidth={1} strokeOpacity={0.3} />
                    )}
                    {/* Node circle */}
                    <circle cx={node.x} cy={node.y} r={22}
                      fill={nodeColor(node)}
                      stroke={nodeStroke(node)}
                      strokeWidth={node.type === "target" ? 1 : 2}
                      filter={node.type !== "target" ? "url(#glow)" : undefined}
                    />
                    {/* Port dots */}
                    {node.ports.slice(0, 8).map((p, pi) => {
                      const angle = (pi / Math.max(node.ports.length, 8)) * 2 * Math.PI - Math.PI / 2;
                      const pr = 34;
                      return (
                        <circle key={pi}
                          cx={node.x + Math.cos(angle) * pr} cy={node.y + Math.sin(angle) * pr}
                          r={4} fill={serviceColor(p.service)} stroke="#000" strokeWidth={1} />
                      );
                    })}
                    {/* Label */}
                    <text x={node.x} y={node.y + 38} textAnchor="middle"
                      style={{ fontSize: 10, fontFamily: "'Fira Code', monospace",
                        fill: node.type === "target" ? "#4A4A4A" : "#00FF41", fontWeight: 600 }}>
                      {node.label}
                    </text>
                    {node.type !== "c2" && node.agent && (
                      <text x={node.x} y={node.y + 50} textAnchor="middle"
                        style={{ fontSize: 8, fontFamily: "'Fira Code', monospace", fill: "#2A2A2A" }}>
                        via {node.agent}
                      </text>
                    )}
                    {/* Icon letter */}
                    <text x={node.x} y={node.y + 5} textAnchor="middle"
                      style={{ fontSize: 12, fontFamily: "'Fira Code', monospace", fontWeight: 700,
                        fill: node.type === "target" ? "#E0E0E0" : "#000" }}>
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
              className="w-64 flex-shrink-0 hud-panel p-4 flex flex-col gap-4"
              style={{ alignSelf: "flex-start" }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div style={{ width: 8, height: 8, borderRadius: "50%",
                    background: selected.type === "c2" ? "#00FF41" : selected.type === "agent" ? "#00CC33" : "#1F1F1F",
                    boxShadow: selected.type !== "target" ? "0 0 5px #00FF41" : "none" }} />
                  <span className="font-bold text-xs"
                    style={{ fontFamily: "'Fira Code', monospace", color: "#E0E0E0" }}>{selected.label}</span>
                </div>
                <span className="text-xs capitalize" style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
                  {selected.type}
                </span>
                {selected.agent && (
                  <p className="text-xs mt-0.5" style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A" }}>
                    via {selected.agent}
                  </p>
                )}
              </div>
              {selected.ports.length > 0 && (
                <div>
                  <p className="text-xs font-bold tracking-widest mb-2"
                    style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A", textTransform: "uppercase" }}>
                    OPEN_PORTS
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {selected.ports.map(p => (
                      <div key={p.port} className="flex items-center justify-between px-2 py-1.5"
                        style={{ background: "#050505", border: "1px solid #1F1F1F" }}>
                        <span className="font-bold text-xs" style={{ fontFamily: "'Fira Code', monospace",
                          color: serviceColor(p.service) }}>{p.port}</span>
                        <span className="text-xs" style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
                          {p.service}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setSelected(null)}
                className="text-xs mt-auto"
                style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A",
                  background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#00FF41"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#2A2A2A"; }}>
                CLOSE ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
        className="flex items-center gap-6 flex-shrink-0">
        {[
          { color: "#00FF41", glow: true,  label: "C2 Server" },
          { color: "#00CC33", glow: true,  label: "Compromised Agent" },
          { color: "#1F1F1F", glow: false, label: "Discovered Host" },
        ].map(({ color, glow, label }) => (
          <div key={label} className="flex items-center gap-2 text-xs"
            style={{ fontFamily: "'Fira Code', monospace", color: "#4A4A4A" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: color,
              boxShadow: glow ? `0 0 5px ${color}` : "none",
              border: glow ? "none" : "1px solid #1F1F1F" }} />
            {label}
          </div>
        ))}
        <span style={{ fontFamily: "'Fira Code', monospace", color: "#1F1F1F", fontSize: "11px" }}>·</span>
        <span style={{ fontFamily: "'Fira Code', monospace", color: "#2A2A2A", fontSize: "11px" }}>
          Colored dots = open ports
        </span>
      </motion.div>
    </div>
  );
}
