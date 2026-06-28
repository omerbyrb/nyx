import { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Tasks from "./pages/Tasks";
import Console from "./pages/Console";
import Login from "./pages/Login";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [authed, setAuthed] = useState(!!localStorage.getItem("nyx_token"));

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard />;
      case "agents":    return <Agents onNavigateConsole={() => setPage("console")} />;
      case "tasks":     return <Tasks />;
      case "console":   return <Console />;
      default:          return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-nyx-bg overflow-hidden">
      <Sidebar
        activePage={page}
        onNavigate={setPage}
        onLogout={() => {
          localStorage.removeItem("nyx_token");
          setAuthed(false);
        }}
      />
      <main className="flex-1 overflow-hidden">
        {renderPage()}
      </main>
    </div>
  );
}
