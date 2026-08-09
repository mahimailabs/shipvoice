import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router";
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { listAgents } from "../api";
import type { AgentPattern, AgentSummary } from "../types";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, KV, Panel } from "../components/ds";
import { AGENT_NAME } from "../lib/token-source";

// One agent, in full.
//
// The layout is the full product's agent detail: the flow canvas on the left,
// then Team, Providers and Version history down the right. This starter runs
// one agent under one configuration, so the reference's version bar (v11 active
// / v12 staged / History / Discard / Apply) is gone rather than faked, no node
// carries a call count, and every cell this repo cannot answer renders a dash.
// A dash means unmeasured, never zero.

/** A value this deployment has no reading for. Never a zero, never a guess. */
function Dash({ why }: { why?: string }) {
  return (
    <span className="na fnt" title={why}>
      -
    </span>
  );
}

// ---------- the flow canvas ----------

// The canvas is read-only, so the connection points exist only to anchor an
// edge. Hiding them keeps the card looking like every other card in the console.
const HANDLE: CSSProperties = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: 0,
};

/** A node drawn the way this console draws a card, not the way React Flow does. */
function FlowCard({ data }: NodeProps) {
  return (
    <div
      style={{
        width: 160,
        padding: "10px 12px",
        background: "var(--surface-raised)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--sv-radius-md)",
        textAlign: "left",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={HANDLE}
        isConnectable={false}
      />
      <div className="lb">{String(data.kind ?? "")}</div>
      <div
        style={{
          font: "var(--type-body-sm)",
          color: "var(--text-primary)",
          marginTop: 3,
        }}
      >
        {String(data.name ?? "")}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={HANDLE}
        isConnectable={false}
      />
    </div>
  );
}

// Module scope on purpose: a fresh object on every render makes React Flow tear
// down and rebuild every node.
const NODE_TYPES: NodeTypes = { card: FlowCard };

// React Flow's attribution has to stay visible, which is not the same as
// leaving a white pill on a dark console. Its background is a library variable.
const CANVAS = {
  flex: 1,
  minHeight: 440,
  background: "var(--surface-base)",
  "--xy-attribution-background-color": "transparent",
} as CSSProperties;

const EDGE_STYLE: CSSProperties = {
  stroke: "var(--border-strong)",
  strokeWidth: 1,
  strokeDasharray: "3 3",
};

function card(
  id: string,
  kind: string,
  name: string,
  x: number,
  y: number,
): Node {
  return {
    id,
    type: "card",
    position: { x, y },
    data: { kind, name },
    draggable: false,
    selectable: false,
    connectable: false,
  };
}

function link(source: string, target: string, label?: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: "smoothstep",
    style: EDGE_STYLE,
    label,
    labelShowBg: false,
    labelStyle: { fill: "var(--text-faint)", fontSize: 11 },
  };
}

/**
 * The shape of a call, from the pattern this deployment declares.
 *
 * No node carries a call count. The reference has one on every node; nothing
 * here counts calls through a node, and a plausible "173 calls" would be
 * exactly the invention the rest of this console refuses.
 */
function graph(
  pattern: AgentPattern,
  agentName: string,
): { nodes: Node[]; edges: Edge[] } {
  if (pattern === "supervisor") {
    return {
      nodes: [
        card("entry", "Entry", "Caller connects", 0, 120),
        card("router", "Router", agentName, 215, 120),
        // Generic on purpose. The deployment declares the pattern, not the
        // roster, so naming or counting specialists here would be invention.
        card("specialists", "Specialists", "not named here", 430, 30),
        card("end", "End", "Call ends", 430, 210),
      ],
      edges: [
        link("entry", "router"),
        link("router", "specialists", "delegates a turn"),
        link("router", "end"),
      ],
    };
  }
  return {
    nodes: [
      card("entry", "Entry", "Caller connects", 0, 0),
      card("agent", "Agent", agentName, 215, 0),
      card("end", "End", "Call ends", 430, 0),
    ],
    edges: [link("entry", "agent"), link("agent", "end")],
  };
}

// ---------- the page ----------

export function AgentDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    listAgents()
      .then((r) => {
        if (!live) return;
        setAgents(r.agents);
      })
      .catch(() => {
        if (!live) return;
        setError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const agent = agents?.find((a) => a.slug === slug) ?? null;

  // An unrecognised pattern is a typo, not a third shape. Fall back the way the
  // backend falls back, rather than draw something this repo does not run.
  const pattern: AgentPattern =
    agent?.pattern === "supervisor" ? "supervisor" : "sequential";

  const flow = useMemo(
    () => graph(pattern, agent?.agent_name ?? ""),
    [pattern, agent?.agent_name],
  );

  if (error) {
    return (
      <div className="pad">
        <div className="banner bad" role="alert">
          <Badge tone="violation">API unreachable</Badge>
          <span>
            Could not load this agent. An agent already running is unaffected.
          </span>
        </div>
      </div>
    );
  }

  if (agents === null) {
    return <div className="empty">Loading agent…</div>;
  }

  if (!agent) {
    return (
      <div className="pad">
        <Panel flush>
          <div className="empty">
            <h2>No agent named &quot;{slug}&quot;</h2>
            <p>
              This deployment does not run one under that name. The name may
              have changed, or the link is stale.
            </p>
            <Link
              to="/agents"
              className="fnt"
              style={{ font: "var(--type-body-sm)" }}
            >
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
        badge={
          <>
            {agent.active ? (
              <Badge tone="success">Active</Badge>
            ) : (
              <Badge tone="neutral">Idle</Badge>
            )}
            <Badge tone="accent">
              {pattern === "supervisor"
                ? "Supervisor, router plus specialists"
                : "Sequential"}
            </Badge>
          </>
        }
        meta={agent.business_name ?? undefined}
        actions={
          <>
            <Link className="btn sm" to={`/agents/${agent.slug}/test`}>
              Test call
            </Link>
            <Button
              size="sm"
              disabled
              title="Not built here: this starter has no eval runner, so there is nothing to run this agent against."
            >
              Run evaluation
            </Button>
          </>
        }
      />

      {/* Where the reference puts its config bar. This starter has exactly one
          configuration and no staging, so a version bar would be pure fiction. */}
      <div
        className="row"
        style={{
          gap: 10,
          padding: "10px var(--pad-frame)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <span className="lb">Config</span>
        <span className="mut" style={{ font: "var(--type-body-sm)" }}>
          This starter runs a single configuration, read from the bundle and the
          environment.
        </span>
      </div>

      {nameMismatch && (
        <div className="pad" style={{ paddingBottom: 0 }}>
          <div className="banner" role="alert">
            <Badge tone="warning">names differ</Badge>
            <span>
              The backend declares{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {agent.agent_name}
              </span>{" "}
              and this browser dispatches{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {AGENT_NAME}
              </span>
              . LiveKit matches the name exactly, so a test call from here will
              not reach the worker until they agree.
            </span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0, flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 440px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border-default)",
          }}
        >
          <div className="ph">
            Flow<span className="meta">{pattern} pattern · read-only</span>
          </div>

          <div style={CANVAS}>
            <ReactFlow
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={NODE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              zoomOnDoubleClick={false}
              panOnDrag
              // The canvas must not swallow the page's own scroll.
              preventScrolling={false}
              fitView
              // maxZoom 1: the cards are sized in the console's own type scale,
              // so scaling them up past life size would blur them.
              fitViewOptions={{ padding: 0.06, maxZoom: 1 }}
              aria-label={`${pattern} call flow for ${agent.agent_name}`}
            >
              <Background
                gap={24}
                size={1.4}
                color="var(--border-strong)"
                bgColor="var(--surface-base)"
              />
            </ReactFlow>
          </div>

          <div
            style={{
              padding: "10px var(--pad-frame)",
              borderTop: "1px solid var(--border-default)",
            }}
          >
            <Ann>
              Structure comes from the agent in this repo and the pattern the
              environment declares, not from traffic. Per-node call counts are
              not measured here, so no node carries one.
            </Ann>
          </div>
        </div>

        <div
          style={{
            width: 440,
            flex: "none",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="ph">
            Team
            <span className="meta">
              {pattern === "supervisor"
                ? "router plus specialists"
                : "one agent, whole call"}
            </span>
          </div>
          <div className="pb">
            <p
              className="mut"
              style={{ font: "var(--type-body-sm)", margin: "0 0 10px" }}
            >
              {pattern === "supervisor" ? (
                <>
                  <span style={{ color: "var(--text-primary)" }}>
                    Supervisor.
                  </span>{" "}
                  One router owns the call and delegates a turn at a time.
                  Specialists never speak to each other, and only the router
                  speaks to the caller.
                </>
              ) : (
                <>
                  <span style={{ color: "var(--text-primary)" }}>
                    Sequential.
                  </span>{" "}
                  One agent handles the whole call, from the greeting to the
                  goodbye. There is no router and no handoff.
                </>
              )}
            </p>

            <KV k={pattern === "supervisor" ? "Router" : "Agent"}>
              {agent.agent_name}
            </KV>
            {pattern === "supervisor" && (
              <KV k="Specialists">
                <Dash why="Not reported: this deployment declares the pattern, not the roster. Nothing tells the console how many specialists run, or what each one is called." />
              </KV>
            )}
            <KV k="Dispatched as">{AGENT_NAME}</KV>
            <KV k="Business">
              {agent.business_name ?? (
                <Dash why="Not set: BUSINESS_NAME is empty in the backend environment." />
              )}
            </KV>

            <p
              className="fnt"
              style={{ font: "var(--type-caption)", margin: "12px 0 0" }}
            >
              {pattern === "supervisor"
                ? "The pattern is a declaration, not a roster. Turns per member are not counted here."
                : "This deployment declares one agent and always runs it. Turns per member are not counted here."}
            </p>
          </div>

          <div
            className="ph"
            style={{ borderTop: "1px solid var(--border-default)" }}
          >
            Providers<span className="meta">as declared in the worker</span>
          </div>
          <div className="scrollx">
            <table className="tb">
              <tbody>
                <tr>
                  <th>Slot</th>
                  <th>Declared</th>
                </tr>
                <tr>
                  <td className="fnt">STT</td>
                  {agent.stt ? (
                    <td className="pri">{agent.stt}</td>
                  ) : (
                    <td className="na">-</td>
                  )}
                </tr>
                <tr>
                  <td className="fnt">LLM</td>
                  {agent.llm ? (
                    <td className="pri">{agent.llm}</td>
                  ) : (
                    <td className="na">-</td>
                  )}
                </tr>
                <tr>
                  <td className="fnt">TTS</td>
                  {agent.tts ? (
                    <td className="pri">{agent.tts}</td>
                  ) : (
                    <td className="na">-</td>
                  )}
                </tr>
                <tr>
                  <td className="fnt">Prompt</td>
                  <td
                    className="pri"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {agent.prompt_path}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="pb">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                size="sm"
                disabled
                title={`Not a setting here: the LLM is declared in ${agent.declared_in}, so changing it is a code change and a worker restart.`}
              >
                Change LLM ▾
              </Button>
              <Button
                size="sm"
                disabled
                title={`Not a setting here: the voice is declared in ${agent.declared_in}, so changing it is a code change and a worker restart.`}
              >
                Change voice ▾
              </Button>
            </div>
            <div style={{ marginTop: 12 }}>
              <Ann>
                Declared in {agent.declared_in}, not read back from the running
                process. Swapping a provider is a code change and a worker
                restart, not a setting here.
              </Ann>
            </div>
          </div>

          <div
            className="ph"
            style={{ borderTop: "1px solid var(--border-default)" }}
          >
            Version history
            <Badge tone="accent">placeholder</Badge>
          </div>
          <div className="pb" style={{ flex: 1 }}>
            <p
              className="mut"
              style={{ font: "var(--type-body-sm)", margin: 0 }}
            >
              Configuration is not versioned here: there is one live config, and
              nothing records what it was before, so there is no history to show
              and nothing to revert to.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
