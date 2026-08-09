import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Cell, Pie, PieChart } from "recharts";
import { ApiError, getCallRollup, listAgents } from "../api";
import type { AgentSummary, CallRollupResponse, RollupByAgent } from "../types";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, DottedLineChart, LegendGrid } from "../components/ds";

// The Agents page, matched cell for cell to the reference console.
//
// Every column the reference has is still here. The ones this repo can answer
// carry real data; the ones it cannot carry a dash on .na with a title saying
// what is not recorded. A dash is unmeasured. It is never a zero, and it is
// never a number we made up to fill the grid.

type Load = "loading" | "ok" | "missing" | "error";

/** The rollup answered, did not answer, or has not been asked yet. */
type RollupState =
  | { kind: "pending" }
  | { kind: "ok"; data: CallRollupResponse }
  | { kind: "unavailable" };

/**
 * Concrete colours for the donut. Recharts paints SVG fills, and a fill of
 * "var(--sv-chart-1)" does not resolve as an attribute, so the token has to be
 * read off the document first. The hex fallbacks are the same values console.css
 * declares, used when there is no live stylesheet (tests, SSR).
 */
const TOKEN_FALLBACK: Record<string, string> = {
  "--sv-chart-1": "#e5323f",
  "--sv-chart-2": "#ff6f78",
  "--sv-chart-3": "#b81f2b",
  "--sv-chart-4": "#ffcbcd",
  "--brand-300": "#ff6f78",
  "--brand-500": "#b81f2b",
  "--surface-base": "#171717",
};

const SLICE_TOKENS = [
  "--sv-chart-1",
  "--sv-chart-2",
  "--sv-chart-3",
  "--sv-chart-4",
  "--brand-300",
  "--brand-500",
];

function readToken(name: string): string {
  const fallback = TOKEN_FALLBACK[name] ?? "#e5323f";
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/**
 * Six flat sample points. This repo runs no evaluations, so the shape is here
 * to hold the reference's layout and nothing more. The panel says so on a chip
 * and again in words underneath.
 */
// Percent, to match the reference axis (91 / 46 / 0) rather than 0.90 / 0.45.
const PLACEHOLDER_SCORES = [91, 91, 91, 91, 91, 91];
const PLACEHOLDER_RUNS = ["#1", "#2", "#3", "#4", "#5", "#6"];

const NOT_RECORDED = {
  config:
    "Not recorded here: this repo does not version agent config, so the prompt on disk is simply what runs.",
  evaA: "Not recorded here: nothing in this repo scores an agent.",
  evaX: "Not recorded here: nothing in this repo scores an agent.",
  kept: "Not recorded here: nothing in this repo bills a caller, so there is no revenue to keep.",
  callsUnknown:
    "The 7 day rollup did not answer, so this count is unknown rather than zero.",
  team: "The agent list did not report a pattern, so the team shape is unknown.",
  channels:
    "This starter answers browser calls. SIP is wired in the backend, but nothing here proves a number is attached to this agent.",
};

/** A cell the backend did not give us. Never a zero, never a guess. */
function Na({ why }: { why: string }) {
  return (
    <td className="na" title={why}>
      -
    </td>
  );
}

function patternOf(agent: AgentSummary): "sequential" | "supervisor" | null {
  if (agent.pattern === "supervisor") return "supervisor";
  if (agent.pattern === "sequential") return "sequential";
  return null;
}

function AgentRows({
  agents,
  rollup,
}: {
  agents: AgentSummary[];
  rollup: RollupState;
}) {
  return (
    <>
      {agents.map((a) => {
        const pattern = patternOf(a);
        // A missing agent in a rollup that answered is a real zero: the window
        // was counted and this agent was not in it. A rollup that never
        // answered is unknown, which is a dash.
        const counted =
          rollup.kind === "ok"
            ? (rollup.data.by_agent.find((r) => r.agent_name === a.agent_name)
                ?.calls ?? 0)
            : null;

        return (
          <tr key={a.slug} className={a.active ? "hl" : undefined}>
            <td className="pri">
              <Link to={`/agents/${a.slug}`}>{a.agent_name}</Link>
            </td>
            {pattern === null ? (
              <Na why={NOT_RECORDED.team} />
            ) : (
              <td>
                <Badge tone={pattern === "supervisor" ? "accent" : "neutral"}>
                  {pattern === "supervisor" ? "Supervisor" : "Sequential"}
                </Badge>
              </td>
            )}
            {pattern === null ? (
              <Na why={NOT_RECORDED.team} />
            ) : (
              <td>
                {pattern === "supervisor"
                  ? "supervisor + specialists"
                  : "single agent"}
              </td>
            )}
            <td title={NOT_RECORDED.channels}>Web</td>
            <Na why={NOT_RECORDED.config} />
            <Na why={NOT_RECORDED.evaA} />
            <Na why={NOT_RECORDED.evaX} />
            {counted === null ? (
              <Na why={NOT_RECORDED.callsUnknown} />
            ) : (
              <td className="pri">{counted.toLocaleString()}</td>
            )}
            <Na why={NOT_RECORDED.kept} />
            <td>
              {a.active ? (
                <Badge tone="success">Active</Badge>
              ) : (
                <Badge tone="neutral">Idle</Badge>
              )}
            </td>
            <td className="fnt">
              <Link
                to={`/agents/${a.slug}`}
                aria-label={`Open ${a.agent_name}`}
                style={{ color: "inherit" }}
              >
                ›
              </Link>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function AgentTable({
  agents,
  rollup,
}: {
  agents: AgentSummary[];
  rollup: RollupState;
}) {
  return (
    <div className="scrollx">
      <table className="tb">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Pattern</th>
            <th>Team</th>
            <th>Channels</th>
            <th>Config</th>
            <th>EVA-A</th>
            <th>EVA-X</th>
            <th>Calls · 7d</th>
            <th>Kept · 7d</th>
            <th>State</th>
            <th style={{ width: 28 }} />
          </tr>
        </thead>
        <tbody>
          <AgentRows agents={agents} rollup={rollup} />
        </tbody>
      </table>
    </div>
  );
}

/** "Scores over time". Illustrative only: nothing in this repo scores an agent. */
function ScoresPanel() {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="ph">
        Scores over time
        <Badge tone="accent">placeholder</Badge>
        <span className="meta">EVA-A, last 6 runs</span>
      </div>
      <div className="pb" style={{ flex: 1, minHeight: 210 }}>
        <div className="chartbox">
          <DottedLineChart
            points={PLACEHOLDER_SCORES}
            height={132}
            label="Placeholder shape. No evaluation runs this agent."
            showAxis
            xLabels={PLACEHOLDER_RUNS}
          />
        </div>
        <p
          className="fnt"
          style={{
            font: "var(--type-body-sm)",
            color: "var(--text-muted)",
            margin: "14px 0 0",
          }}
        >
          Nothing here scores an agent. The shape is illustrative and the
          numbers are not readings.
        </p>
      </div>
    </div>
  );
}

/** The donut. This one is real: every slice is a counted call. */
function CallsDonut({ slices }: { slices: RollupByAgent[] }) {
  const colors = useMemo(() => SLICE_TOKENS.map(readToken), []);
  const seam = useMemo(() => readToken("--surface-base"), []);
  const total = slices.reduce((sum, s) => sum + s.calls, 0);

  return (
    <>
      <div style={{ position: "relative", width: 150, height: 150, flex: "none" }}>
        <PieChart width={150} height={150}>
          <Pie
            data={slices}
            dataKey="calls"
            nameKey="agent_name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={75}
            startAngle={90}
            endAngle={-270}
            stroke={seam}
            strokeWidth={1}
            isAnimationActive={false}
          >
            {slices.map((s, i) => (
              <Cell key={s.agent_name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
        </PieChart>
        <div
          style={{
            position: "absolute",
            inset: 23,
            borderRadius: "var(--radius-full)",
            background: "var(--surface-base)",
            border: "1px dotted var(--border-strong)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            pointerEvents: "none",
          }}
        >
          <span className="num" style={{ font: "var(--type-metric)" }}>
            {total.toLocaleString()}
          </span>
          <span className="fnt" style={{ font: "var(--type-caption)" }}>
            calls
          </span>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          alignSelf: "stretch",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderLeft: "1px solid var(--border-default)",
          paddingLeft: 24,
        }}
      >
        <LegendGrid
          items={slices.map((s, i) => ({
            label: s.agent_name,
            value: s.calls.toLocaleString(),
            color: colors[i % colors.length],
          }))}
        />
      </div>
    </>
  );
}

function CallsLandingPanel({ rollup }: { rollup: RollupState }) {
  const slices =
    rollup.kind === "ok"
      ? rollup.data.by_agent.filter((r) => r.calls > 0)
      : [];

  let body;
  if (rollup.kind === "pending") {
    body = <span className="mut">Counting the last 7 days…</span>;
  } else if (rollup.kind === "unavailable") {
    body = (
      <p className="fnt" style={{ font: "var(--type-body-sm)", margin: 0 }}>
        The 7 day rollup did not answer, so where calls land is unknown. An
        empty ring here would be a claim this console cannot make.
      </p>
    );
  } else if (slices.length === 0) {
    body = (
      <p className="fnt" style={{ font: "var(--type-body-sm)", margin: 0 }}>
        The rollup answered and counted no calls in the last 7 days. This is a
        real zero, so there is nothing to split.
      </p>
    );
  } else {
    body = <CallsDonut slices={slices} />;
  }

  return (
    <div
      style={{
        width: 460,
        flex: "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="ph">
        Where calls land
        <span className="meta">by agent, 7d</span>
      </div>
      <div
        className="pb"
        style={{ flex: 1, display: "flex", alignItems: "center", gap: 26 }}
      >
        {body}
      </div>
    </div>
  );
}

export function Agents() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [rollup, setRollup] = useState<RollupState>({ kind: "pending" });

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

    // Fetched separately on purpose. If the rollup is missing while the agent
    // list works, the Calls column falls back to a dash instead of taking the
    // whole page down.
    getCallRollup(7)
      .then((data) => live && setRollup({ kind: "ok", data }))
      .catch(() => live && setRollup({ kind: "unavailable" }));

    return () => {
      live = false;
    };
  }, []);

  const topBar = (
    <TopBar
      title="Agents"
      meta="authored in Claude Code, providers editable here"
      actions={
        <Button
          size="sm"
          disabled
          title="A browser cannot deep link into an editor. Open the repo in your terminal and run /setup in Claude Code."
        >
          Open repo in Claude Code ↗
        </Button>
      }
    />
  );

  if (load === "loading") {
    return (
      <>
        {topBar}
        <div className="empty">Loading agents…</div>
      </>
    );
  }

  if (load === "missing") {
    return (
      <>
        {topBar}
        <div className="pad">
          <div className="banner" role="alert">
            <Badge tone="warning">not wired</Badge>
            <span>
              This backend has no /api/v1/agents route, so the agent it runs
              cannot be described here. The agent itself is unaffected.
            </span>
          </div>
        </div>
      </>
    );
  }

  if (load === "error") {
    return (
      <>
        {topBar}
        <div className="pad">
          <div className="banner bad" role="alert">
            <Badge tone="violation">API unreachable</Badge>
            <span>
              The agent list is unknown, not empty. An agent already running is
              unaffected.
            </span>
          </div>
        </div>
      </>
    );
  }

  if (agents.length === 0) {
    return (
      <>
        {topBar}
        <div className="pad">
          <section className="pnl">
            <div className="empty">
              <h2>No agent yet</h2>
              <p>
                This deployment is not running one. Describe the agent you want
                in Claude Code and it writes the prompt, the worker config, and
                the env the three services need.
              </p>
              <span className="cmd">/setup</span>
            </div>
          </section>
        </div>
      </>
    );
  }

  // The reference runs this page full bleed: the table sits straight under the
  // topbar and the two panels below share one divider. Panel from ds.tsx boxes
  // its own border on all four sides, which would double every rule here, so
  // the two panels are built from the same .ph and .pb parts it uses.
  return (
    <>
      {topBar}
      <AgentTable agents={agents} rollup={rollup} />
      <div className="disclose">
        <Ann>
          A dash means unmeasured, never zero. Config versions, EVA scores and
          kept revenue are not recorded in this repo, so those columns stay
          dashed rather than showing you a zero.
        </Ann>
      </div>
      {/* Sized to content, not 'flex: 1'. Growing to fill the viewport leaves a
          tall empty band under two short panels on any screen taller than the
          reference's. */}
      <div
        style={{
          display: "flex",
          borderTop: "1px solid var(--border-default)",
        }}
      >
        <ScoresPanel />
        <CallsLandingPanel rollup={rollup} />
      </div>
    </>
  );
}
