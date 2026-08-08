import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Tasks from "./pages/Tasks";
import Console from "./pages/Console";
import Builder from "./pages/Builder";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import Loot from "./pages/Loot";
import NetworkMap from "./pages/NetworkMap";
import Intelligence from "./pages/Intelligence";
import Persistence from "./pages/Persistence";
import ExtC2 from "./pages/ExtC2";
import Playbooks from "./pages/Playbooks";
import Login from "./pages/Login";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

const KONAMI = [
  "ArrowUp","ArrowUp","ArrowDown","ArrowDown",
  "ArrowLeft","ArrowRight","ArrowLeft","ArrowRight",
  "b","a",
];

const CHEAT_LINES = [
  "OPERATOR SKILL: +9999",
  "STEALTH MODE: MAXIMUM",
  "DETECTED: 0 TIMES",
  "NYX SUPREME HACKER MODE",
  "// gg ez",
];

function KonamiOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 20,
      }}
      onClick={onDone}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 18 }}
        style={{
          fontFamily: "'Fira Code', monospace",
          fontSize: 11,
          color: "#2A2A2A",
          letterSpacing: "0.3em",
          textTransform: "uppercase",
        }}
      >
        ↑ ↑ ↓ ↓ ← → ← → B A
      </motion.div>

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: [0.5, 1.1, 1], opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        style={{
          fontFamily: "'Fira Code', monospace",
          fontSize: 32,
          fontWeight: "bold",
          color: "#00FF41",
          textShadow: "0 0 30px rgba(0,255,65,0.8), 0 0 60px rgba(0,255,65,0.4)",
          letterSpacing: "0.08em",
          textAlign: "center",
        }}
      >
        // CHEAT CODE ACTIVATED
      </motion.div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {CHEAT_LINES.map((line, i) => (
          <motion.div
            key={line}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.2 }}
            style={{
              fontFamily: "'Fira Code', monospace",
              fontSize: 12,
              color: "#00FF41",
              opacity: 0.7,
              letterSpacing: "0.15em",
            }}
          >
            {line}
          </motion.div>
        ))}
      </div>

      <motion.div
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        style={{
          marginTop: 16,
          fontFamily: "'Fira Code', monospace",
          fontSize: 10,
          color: "#2A2A2A",
          letterSpacing: "0.2em",
        }}
      >
        [ CLICK TO DISMISS ]
      </motion.div>
    </motion.div>
  );
}

const HOTKEYS: Record<string, string> = {
  "alt+1": "dashboard",
  "alt+2": "agents",
  "alt+3": "tasks",
  "alt+4": "console",
  "alt+5": "reports",
};

export default function App() {
  const [page, setPage]     = useState("dashboard");
  const [authed, setAuthed] = useState(!!localStorage.getItem("nyx_token"));
  const [cheat, setCheat]   = useState(false);
  const konamiIdx = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey) {
        const key = `alt+${e.key}`;
        if (HOTKEYS[key]) { e.preventDefault(); setPage(HOTKEYS[key]); return; }
      }

      if (e.key === KONAMI[konamiIdx.current]) {
        konamiIdx.current += 1;
        if (konamiIdx.current === KONAMI.length) {
          konamiIdx.current = 0;
          setCheat(true);
        }
      } else {
        konamiIdx.current = e.key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard />;
      case "agents":    return <Agents onNavigateConsole={() => setPage("console")} />;
      case "tasks":     return <Tasks />;
      case "console":   return <Console />;
      case "builder":   return <Builder />;
      case "reports":   return <Reports />;
      case "loot":      return <Loot />;
      case "network":       return <NetworkMap />;
      case "intelligence":  return <Intelligence />;
      case "persistence":   return <Persistence />;
      case "extc2":         return <ExtC2 />;
      case "playbooks":     return <Playbooks />;
      case "admin":         return <Admin />;
      default:          return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-nyx-bg overflow-hidden">
      <Sidebar activePage={page} onNavigate={setPage} onLogout={() => { localStorage.removeItem("nyx_token"); setAuthed(false); }} />
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="h-full overflow-y-auto"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {cheat && <KonamiOverlay onDone={() => setCheat(false)} />}
      </AnimatePresence>
    </div>
  );
}
