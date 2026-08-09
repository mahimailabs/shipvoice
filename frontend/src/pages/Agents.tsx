import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiError, listAgents } from "../api";
import type { AgentSummary } from "../types";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, Panel } from "../components/ds";

type Load = "loading" | "ok" | "missing" | "error";

/** A value the backend did not give us. Never a zero, never a guess. */
function Cell({ value }: { value: string | null }) {
  if (!value) return <td className="na">-</td>;
  return <td>{value}</td>;
}

function AgentTable({ agents }: { agents: AgentSummary[] }) {
  return (
    <Panel title="Running" meta="providers as declared, not observed" flush>
      <div className="scrollx">
        <table className="tb">
          <tbody>
            <tr>
              <th>Agent</th>
              <th>Business</th>
              <th>STT</th>
              <th>LLM</th>
              <th>TTS</th>
              <th>Prompt</th>
              <th>State</th>
            </tr>
            {agents.map((a) => (
              <tr key={a.slug} className={a.active ? "hl" : undefined}>
                <td className="pri">
                  <Link to={`/agents/${a.slug}`}>{a.agent_name}</Link>
                </td>
                <Cell value={a.business_name} />
                <Cell value={a.stt} />
                <Cell value={a.llm} />
                <Cell value={a.tts} />
                <td style={{ fontFamily: "var(--font-mono)" }}>
                  {a.prompt_path}
                </td>
                <td>
                  {a.active ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="neutral">Idle</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="disclose">
        <Ann>
          Calls in the last 7 days needs per-agent aggregation. The call log
          records which agent answered, but this backend does not roll it up by
          agent, so the column stays a dash. A dash means unmeasured, never
          zero.
        </Ann>
      </div>
    </Panel>
  );
}

export function Agents() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [load, setLoad] = useState<Load>("loading");

  useEffect(() => {
    let live = true;
    listAgents()
      .then((r) => {
        if (!live) return;
        setAgents(r.agents);
        setLoad("ok");
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.isMissing) setLoad("missing");
        else setLoad("error");
      });
    return () => {
      live = false;
    };
  }, []);

  let content;
  if (load === "missing") {
    content = (
      <div className="banner" role="alert">
        <Badge tone="warning">not wired</Badge>
        <span>
          This backend has no /api/v1/agents route, so the agent it runs cannot
          be described here. The agent itself is unaffected.
        </span>
      </div>
    );
  } else if (load === "error") {
    content = (
      <div className="banner bad" role="alert">
        <Badge tone="violation">API unreachable</Badge>
        <span>
          The agent list is unknown, not empty. An agent already running is
          unaffected.
        </span>
      </div>
    );
  } else if (load === "loading") {
    content = <div className="empty">Loading agents…</div>;
  } else if (agents.length === 0) {
    content = (
      <Panel flush>
        <div className="empty">
          <h2>No agent yet</h2>
          <p>
            This deployment is not running one. Describe the agent you want in
            Claude Code and it writes the prompt, the worker config, and the env
            the three services need.
          </p>
          <span className="cmd">/setup</span>
        </div>
      </Panel>
    );
  } else {
    content = <AgentTable agents={agents} />;
  }

  return (
    <>
      <TopBar
        title="Agents"
        meta="one worker, one agent"
        actions={
          <Button
            size="sm"
            disabled
            title="Not built here: an agent is written in Claude Code with /setup, then the worker picks it up on restart."
          >
            New agent
          </Button>
        }
      />
      <div className="pad">{content}</div>
    </>
  );
}
