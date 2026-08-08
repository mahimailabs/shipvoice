import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { SESSION_EXPIRED_EVENT, clearToken, getToken } from "./api";
import { AppShell } from "./components/AppShell";
import { LoginForm } from "./components/LoginForm";
import { Overview } from "./pages/Overview";
import { CallLogs } from "./pages/CallLogs";
import { CallDetail } from "./pages/CallDetail";
import { Agents } from "./pages/Agents";
import { AgentDetail } from "./pages/AgentDetail";
import { Settings } from "./pages/Settings";
import { Campaigns } from "./pages/locked/Campaigns";
import { Channels } from "./pages/locked/Channels";
import { Customers } from "./pages/locked/Customers";
import { Evaluations } from "./pages/locked/Evaluations";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => getToken() != null);

  // A 401 anywhere means the token lapsed. api.ts clears it and fires this
  // event so every page does not have to handle expiry on its own.
  useEffect(() => {
    const onExpired = (): void => setLoggedIn(false);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    setLoggedIn(false);
  }, []);

  if (!loggedIn) {
    return <LoginForm onLoggedIn={() => setLoggedIn(true)} />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="calls" element={<CallLogs />} />
        <Route path="calls/:id" element={<CallDetail />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:slug" element={<AgentDetail />} />
        <Route path="settings" element={<Settings onLogout={handleLogout} />} />
        {/* Designed in ShipVoice Pro, not backed there yet. These routes open
            and say so; they are previews, not a paywall. */}
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="channels" element={<Channels />} />
        <Route path="customers" element={<Customers />} />
        <Route path="evaluations" element={<Evaluations />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
