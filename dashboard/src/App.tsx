import { useState } from "react";
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
import Login from "./pages/Login";

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

export default function App() {
  const [page, setPage]   = useState("dashboard");
  const [authed, setAuthed] = useState(!!localStorage.getItem("nyx_token"));

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
    </div>
  );
}
