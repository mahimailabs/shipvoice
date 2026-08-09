import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { Overview } from "./pages/Overview";
import { CallLogs } from "./pages/CallLogs";
import { CallDetail } from "./pages/CallDetail";
import { Agents } from "./pages/Agents";
import { AgentDetail } from "./pages/AgentDetail";
import { Deployment } from "./pages/Deployment";
import { TestCall } from "./components/TestCall";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="calls" element={<CallLogs />} />
        <Route path="calls/:id" element={<CallDetail />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:slug" element={<AgentDetail />} />
        {/* The test call is a screen of its own, not a panel inside the
            detail page: there is one test call surface, and this is it. */}
        <Route path="agents/:slug/test" element={<TestCall />} />
        <Route path="deployment" element={<Deployment />} />
        {/* The page was called Settings before it was honest about being read-only. */}
        <Route
          path="settings"
          element={<Navigate to="/deployment" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
