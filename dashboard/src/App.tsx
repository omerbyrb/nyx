import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Console from "./pages/Console";

const pages: Record<string, React.ReactElement> = {
  dashboard: <Dashboard />,
  agents: <Agents />,
  console: <Console />,
};

export default function App() {
  const [page, setPage] = useState("dashboard");

  return (
    <div className="flex h-screen bg-nyx-bg overflow-hidden">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto">
        {pages[page] ?? <Dashboard />}
      </main>
    </div>
  );
}
