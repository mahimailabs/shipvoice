import { useEffect, useState } from "react";
import { API_BASE, ApiError, getDeployment, getSummary } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, KV, Panel } from "../components/ds";
import type { DeploymentRead } from "../types";

// What this deployment is pointed at, and who can reach it. Nothing about the
// agent lives here: its name, its prompt and its voice stack belong to the
// agent, and duplicating them on a deployment-wide page was how this page ended
// up as a second, worse copy of Agent detail.
//
// It is called Deployment and not Settings because nothing on it is settable.
// The console reads; the terminal writes.
//
// No file line numbers anywhere. A row that says agent.py:63 is wrong the next
// time somebody adds an import. Rows name the env var that owns the value, or
// the file, never a position inside one.

/** A value the console cannot read. Never a zero, never a plausible default. */
function Dash() {
  return <span className="na">-</span>;
}

/** The muted line under a value, naming what owns it. */
function Owner({ children }: { children: string }) {
  return (
    <span className="fnt" style={{ display: "block", font: "var(--type-caption)" }}>
      {children}
    </span>
  );
}

/**
 * The honest answers to "is the backend there". Collapsing these into a boolean
 * sends people to restart Docker when the real problem is CORS.
 */
type Reach = "checking" | "ok" | "unreachable" | "missing" | "refused";

const REACH: Record<Reach, { text: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  checking: { text: "Checking", tone: "neutral" },
  ok: { text: "Reachable", tone: "success" },
  unreachable: { text: "No answer", tone: "danger" },
  missing: { text: "Reachable, call log not wired", tone: "warning" },
  refused: { text: "Reachable, request refused", tone: "warning" },
};

export function Deployment() {
  const [dep, setDep] = useState<DeploymentRead | null>(null);
  const [reach, setReach] = useState<Reach>("checking");

  useEffect(() => {
    let live = true;

    getDeployment()
      .then((d) => live && setDep(d))
      .catch(() => undefined);

    // One probe, when the page loads. This is not a health monitor.
    getSummary()
      .then(() => live && setReach("ok"))
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.isMissing) return setReach("missing");
        if (e instanceof ApiError && e.isForbidden) return setReach("refused");
        setReach("unreachable");
      });

    return () => {
      live = false;
    };
  }, []);

  const origin = window.location.origin;
  const corsAllowsUs =
    dep == null ? null : dep.cors_origins.includes("*") || dep.cors_origins.includes(origin);

  return (
    <>
      <TopBar
        title="Deployment"
        badge={<Badge tone={REACH[reach].tone}>{REACH[reach].text}</Badge>}
        meta={dep?.env ? `env ${dep.env}` : undefined}
      />

      <div className="pad">
        <Panel title="Connection" meta="where this console is pointed">
          <KV k="Backend">
            {API_BASE}
            <Owner>VITE_API_BASE_URL, baked in at build time</Owner>
          </KV>
          <KV k="LiveKit project" mono>
            {dep?.livekit_url ?? <Dash />}
            <Owner>LIVEKIT_URL, shared by the backend and the worker</Owner>
          </KV>
          <KV k="This console">
            {origin}
            {corsAllowsUs === false && (
              <span style={{ color: "var(--danger)" }}>
                {" "}
                not in the backend's allowed origins
              </span>
            )}
            <Owner>CORS_ORIGINS_STR on the backend</Owner>
          </KV>
        </Panel>

        <Panel title="Access" meta="who can open this">
          <KV k="Sign-in">
            None. Whoever can reach this page can read everything on it.
            <Owner>frontend/src/App.tsx</Owner>
          </KV>
          <KV k="Registration">
            {dep == null ? <Dash /> : dep.allow_open_registration ? "Open" : "Closed"}
            <Owner>ALLOW_OPEN_REGISTRATION on the backend</Owner>
          </KV>
        </Panel>

        <Panel
          title={<span style={{ color: "var(--warning)" }}>Compliance</span>}
          meta="read this one"
        >
          <p style={{ margin: 0, font: "var(--type-body-sm)", lineHeight: "var(--lh-relaxed)" }}>
            This starter has no compliance gate. Nothing in it checks consent, a suppression list,
            or the local calling window, and it will dial whoever you point it at. There is no
            setting on this page that changes that, because there is no code behind one. You are the
            caller of record and the liability is yours.
          </p>
        </Panel>

        <Ann>
          Nothing here is editable. Each row names the variable or file that owns the value, and
          changing it means editing that file and restarting the process that reads it.
        </Ann>
      </div>
    </>
  );
}
