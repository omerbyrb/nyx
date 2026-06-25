import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Console from "./pages/Console";
import Login from "./pages/Login";

const pages: Record<string, React.ReactElement> = {
  dashboard: <Dashboard />,
  agents: <Agents />,
  console: <Console />,
};

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [authed, setAuthed] = useState(!!localStorage.getItem("nyx_token"));

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="flex h-screen bg-nyx-bg overflow-hidden">
      <Sidebar activePage={page} onNavigate={setPage} onLogout={() => {
        localStorage.removeItem("nyx_token");
        setAuthed(false);
      }} />
      <main className="flex-1 overflow-y-auto">
        {pages[page] ?? <Dashboard />}
      </main>
    </div>
  );
}
