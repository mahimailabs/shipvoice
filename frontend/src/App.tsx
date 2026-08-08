import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { Overview } from "./pages/Overview";
import { CallLogs } from "./pages/CallLogs";
import { CallDetail } from "./pages/CallDetail";
import { Agents } from "./pages/Agents";
import { AgentDetail } from "./pages/AgentDetail";
import { Settings } from "./pages/Settings";

// No sign-in. The console is a local tool for whoever owns the deployment, so
// it opens straight onto the agent. See the deploy note in the README before
// putting it on a public address.
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="calls" element={<CallLogs />} />
        <Route path="calls/:id" element={<CallDetail />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:slug" element={<AgentDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
