import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, listAgents } from "../api";
import type { AgentSummary } from "../types";
import { Ann, TopBar } from "../components/AppShell";
import { TestCall } from "../components/TestCall";
import { Badge, KV, Panel } from "../components/ds";
import { AGENT_NAME } from "../lib/token-source";

// One agent, described only from what this deployment can answer for, and every
// row naming the file or env var that owns the value. That ownership line is
// the point of the page: nothing here is editable from the console, so a reader
// who wants to change something needs to know where it actually lives.

/** The owning env var or file, under the value it owns. */
function Owner({ children }: { children: string }) {
  return (
    <span className="fnt" style={{ display: "block", font: "var(--type-caption)" }}>
      {children}
    </span>
  );
}

function Dash() {
  return <span className="na">-</span>;
}

export function AgentDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    listAgents()
      .then((r) => {
        if (!live) return;
        setAgents(r.agents);
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.isExpiredSession) return;
        if (e instanceof ApiError && e.isForbidden) setForbidden(true);
        else setError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  if (forbidden) {
    return (
      <div className="pad">
        <Panel flush>
          <div className="empty">
            <h2>This account is not an administrator</h2>
            <p>
              The backend is reachable and answered. Agent detail is admin-only, and this account
              does not have is_superuser set.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pad">
        <div className="banner bad" role="alert">
          <Badge tone="violation">API unreachable</Badge>
          <span>Could not load this agent. An agent already running is unaffected.</span>
        </div>
      </div>
    );
  }

  if (agents === null) {
    return <div className="empty">Loading agent…</div>;
  }

  const agent = agents.find((a) => a.slug === slug);

  if (!agent) {
    return (
      <div className="pad">
        <Panel flush>
          <div className="empty">
            <h2>No agent named &quot;{slug}&quot;</h2>
            <p>
              This deployment does not run one under that name. The name may have changed, or the
              link is stale.
            </p>
            <Link to="/agents" className="fnt" style={{ font: "var(--type-body-sm)" }}>
              ← Back to Agents
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  // Three places declare this name and LiveKit matches it exactly: the worker
  // registers under it, the backend reports it, and this browser dispatches it.
  // The browser can only compare two of the three, so it compares those.
  const nameMismatch = agent.agent_name !== AGENT_NAME;

  return (
    <>
      <TopBar
        back={{ to: "/agents", label: "Agents" }}
        title={agent.agent_name}
        badge={agent.active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Idle</Badge>}
        meta={agent.business_name ?? agent.slug}
      />

      <div className="pad">
        {nameMismatch && (
          <div className="banner" role="alert">
            <Badge tone="warning">names differ</Badge>
            <span>
              The backend declares <span style={{ fontFamily: "var(--font-mono)" }}>{agent.agent_name}</span>{" "}
              and this browser dispatches{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>{AGENT_NAME}</span>. LiveKit matches
              the name exactly, so a test call from here will not reach the worker until they agree.
            </span>
          </div>
        )}

        <div className="split">
          <Panel title="Test call" meta="talks to the agent from this browser" flush>
            <TestCall />
          </Panel>

          <div style={{ display: "grid", gap: "var(--pad-frame)" }}>
            <Panel title="Identity">
              <KV k="Agent name">
                {agent.agent_name}
                <Owner>AGENT_NAME in agent/.env, the name the worker registers under</Owner>
              </KV>
              <KV k="Dispatched as">
                {AGENT_NAME}
                <Owner>VITE_AGENT_NAME in frontend/.env, the name this browser asks for</Owner>
              </KV>
              <KV k="Business">
                {agent.business_name ?? <Dash />}
                <Owner>BUSINESS_NAME in backend/.env, spoken in the greeting</Owner>
              </KV>
              <KV k="Prompt" mono>
                {agent.prompt_path}
                <Owner>the file the worker reads its instructions from</Owner>
              </KV>
              <KV k="State">
                {agent.active ? "active" : "idle"}
                <Owner>this deployment declares one agent and always runs it</Owner>
              </KV>
            </Panel>

            <Panel title="Providers" meta="the voice stack">
              <KV k="STT">{agent.stt ?? <Dash />}</KV>
              <KV k="LLM">{agent.llm ?? <Dash />}</KV>
              <KV k="TTS">{agent.tts ?? <Dash />}</KV>
              <div style={{ marginTop: 10 }}>
                <Ann>
                  Declared in the worker source at agent/src/agent.py, not read back from the running
                  process. Swapping a provider is a code change and a worker restart, not a setting
                  here.
                </Ann>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
