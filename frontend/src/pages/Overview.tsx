import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { API_BASE, ApiError, getCallOverview, listCalls } from "../api";
import { TopBar } from "../components/AppShell";
import { Badge, Button, DottedLineChart, Meter } from "../components/ds";
import { duration } from "../lib/format";
import type { CallOverviewResponse, CallRead } from "../types";

// The Overview, laid out cell for cell against the reference console.
//
// Three kinds of figure share this page and they are never mixed:
//
//   real    this deployment's own reading, from the backend. Minutes, calls
//           today, the recent calls table, the metering seam, failed calls.
//   sample  the reference console's own figure, kept verbatim so the shape of
//           the full product is legible, and marked with a red sample dot.
//           Cost, billing, campaigns, connect rate, flagged calls.
//   dash    genuinely unmeasured for a real row. The cost, kept and config
//           columns of the recent calls table are dashes, never samples: those
//           are real calls, and a sample cost against one would be a lie about
//           that call.
//
// Every control the reference has is rendered here. The ones the paid product
// backs are disabled buttons, so they are visible, greyed, and not clickable.

type Load = "loading" | "ok" | "unwired" | "refused";

/** The reference console's own figures. Nothing here is a reading. */
const SAMPLE = {
  providerCost: "$412.80",
  billed: "$1,090.00",
  kept: "$677.20",
  keptHint: "62% margin · Aug 1-6",
  billedHint: "1,842 min × $0.59, your rate",
  connectRate: "41.2%",
  avgKept: "$1.94",
  flagged: "11",
  campaign: {
    name: "Q3 renewals",
    progress: "612 / 1,400 dialled · 251 connected · 94 retries",
    money: "$88.10 kept · $0.35 per connect",
    of: "1 of 2",
  },
} as const;

/**
 * The campaign meter, as fractions of the 1,400 the sample campaign targets.
 * The three segments add up to the 612 dialled, so the filled bar means what it
 * says rather than double counting a retry as a fresh dial.
 */
const SAMPLE_METER = [
  { pct: (251 / 1400) * 100, color: "var(--sv-chart-1)", title: "251 connected" },
  {
    pct: ((612 - 251 - 94) / 1400) * 100,
    color: "var(--sv-chart-3)",
    title: "267 dialled, not connected",
  },
  { pct: (94 / 1400) * 100, color: "var(--sv-chart-4)", title: "94 retries" },
];

// Six days of sample provider cost. They sum to the $412.80 the money strip
// shows, and the top of the axis lands on 148, so this reads as the reference's
// own chart rather than a second, contradictory invention.
const SAMPLE_SPEND = [30, 44, 52, 62, 76.8, 148];
const SAMPLE_SPEND_DAYS = ["Aug 1", "Aug 2", "Aug 3", "Aug 4", "Aug 5", "Aug 6"];

const WHY = {
  range:
    "Not built here: this console has no date range, so every figure below is simply everything the backend has.",
  csv: "Not built here: this backend has no CSV export endpoint.",
  stripe:
    "Not built here: nothing in this repo bills a caller, so there is no Stripe account behind this button.",
  pause: "Not built here: this repo has no campaigns, so there is nothing to pause.",
  open: "Not built here: this repo has no campaigns, so there is nothing to open.",
  sample: "This is sample data, not a reading from this deployment.",
  warnMode:
    "Not built here: nothing in this repo gates a call on consent, a suppression list or a calling window, so this is the shape of the control and not a setting.",
  dir: "This starter answers calls and has no outbound dialer, so every call it records is inbound.",
  cost: "Not metered: nothing in this repo prices a minute.",
  kept: "Not metered: kept needs both a cost and a billed figure.",
  config: "Not recorded: this repo does not version agent config.",
  room: "No caller id on a web call, showing the room that was recorded.",
};

/**
 * Marks a figure as the reference's, not this deployment's.
 *
 * A dot, not a worded chip. Nine of these are on screen at once, and nine
 * repetitions of the same word read as clutter rather than as a caveat, which
 * is the point at which people stop seeing it. The dot is quiet enough to sit
 * beside a figure and still says the same thing on hover.
 */
function SampleDot() {
  return (
    <span
      className="dot-sample"
      role="img"
      aria-label={WHY.sample}
      title={WHY.sample}
    />
  );
}

function statusBadge(c: CallRead) {
  if (c.status === "completed") return <Badge tone="success">Completed</Badge>;
  if (c.status === "failed") return <Badge tone="violation">Failed</Badge>;
  return <Badge tone="neutral">In progress</Badge>;
}

/** How long ago the agent last reported, in the reference's shorthand. */
function ago(seconds: number | null): string {
  if (seconds == null) return "-";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/**
 * The seam's age, counted forward from the timestamp rather than read off the
 * number the backend computed.
 *
 * That number is true for the instant the response was built. Rendering it once
 * leaves a page open on a desk asserting "12s ago" an hour after the agent went
 * quiet, which is the one claim this row exists to make and the one it would be
 * wrong about. 'at' is absolute, so it can be re-read on a tick.
 */
function useSeamAge(at: string | null, fallbackSeconds: number | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (at == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [at]);

  if (at == null) return ago(fallbackSeconds);
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return ago(fallbackSeconds);
  return ago((now - parsed) / 1000);
}

/**
 * Metered minutes, keeping a small measurement visible.
 *
 * Rounding to whole minutes turns a real 0.4 into "0", which reads as "nothing
 * recorded" on the one cell that proves the seam works. Under ten minutes the
 * figure keeps a decimal; above it the reference's thousands separator matters
 * more than the tenth does.
 */
function formatMinutes(minutes: number): string {
  if (minutes > 0 && minutes < 10) return minutes.toFixed(1);
  return Math.round(minutes).toLocaleString();
}

/** A cell in the money strip. Big figure, label above, hint below. */
function Leg({
  label,
  value,
  hint,
  kept,
}: {
  label: string;
  value: string;
  hint: string;
  kept?: boolean;
}) {
  return (
    <div className={kept ? "leg kept" : "leg"}>
      {/* The chip rides the label, not the figure. At 1280 the three legs are
          about 200px each and a 30px figure plus a chip does not fit, so the
          chip would collide with the next leg's number. */}
      <span
        className="row"
        style={{ gap: 8, flexWrap: "nowrap", marginBottom: 8 }}
      >
        <span className="lb" style={{ marginBottom: 0 }}>
          {label}
        </span>
        <SampleDot />
      </span>
      <b>{value}</b>
      <span
        className="fnt"
        style={{ display: "block", font: "var(--type-caption)", marginTop: 6 }}
      >
        {hint}
      </span>
    </div>
  );
}

/** Provider cost, billed, kept, and the Stripe portal that opens nothing. */
function MoneyStrip() {
  return (
    <div
      className="loop"
      style={{ borderBottom: "1px solid var(--border-default)" }}
    >
      <Leg
        label="PROVIDER COST"
        value={SAMPLE.providerCost}
        hint="metered by VoiceGateway"
      />
      <div className="arrow" aria-hidden="true">
        →
      </div>
      <Leg label="BILLED" value={SAMPLE.billed} hint={SAMPLE.billedHint} />
      <div className="arrow" aria-hidden="true">
        →
      </div>
      <Leg label="KEPT" value={SAMPLE.kept} hint={SAMPLE.keptHint} kept />
      <div
        style={{
          flex: "1 1 300px",
          padding: "18px var(--pad-panel)",
          borderLeft: "1px solid var(--border-default)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          justifyContent: "center",
        }}
      >
        <p style={{ font: "var(--type-body-sm)", margin: 0 }}>
          Billed is the rate you configured applied to metered minutes. It is
          not read back from Stripe.
        </p>
        <div>
          <Button disabled title={WHY.stripe}>
            Open Stripe portal ↗
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One cell of the five wide stat row. */
function StatCell({
  value,
  label,
  hint,
  sample,
  amber,
  unknown,
  title,
}: {
  value: string;
  label: string;
  hint: string;
  sample?: boolean;
  amber?: boolean;
  unknown?: boolean;
  title?: string;
}) {
  return (
    <div className="stat" title={title}>
      <b
        className={unknown ? "num na fnt" : "num"}
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          color: amber ? "var(--warning)" : undefined,
        }}
      >
        {value}
        {sample && <SampleDot />}
      </b>
      <i>{label}</i>
      <u>{hint}</u>
    </div>
  );
}

function StatRow({ data }: { data: CallOverviewResponse | null }) {
  return (
    <div
      className="statrow"
      style={{ borderBottom: "1px solid var(--border-default)" }}
    >
      <StatCell
        value={data ? formatMinutes(data.metered_minutes) : "-"}
        label="Billable minutes"
        hint={data ? "metered, all agents" : "rollup unavailable"}
        unknown={!data}
      />
      <StatCell
        value={data ? data.calls_today.toLocaleString() : "-"}
        label="Calls today"
        hint={data ? "inbound only, no outbound dialer" : "rollup unavailable"}
        unknown={!data}
        title={WHY.dir}
      />
      <StatCell
        value={SAMPLE.connectRate}
        label="Connect rate"
        hint="outbound only"
        sample
      />
      <StatCell
        value={SAMPLE.avgKept}
        label="Avg kept per call"
        hint="completed calls"
        sample
      />
      <StatCell
        value={SAMPLE.flagged}
        label="Flagged and placed"
        hint="last 24 hours"
        sample
        amber
      />
    </div>
  );
}

/** The recent calls table. Nine columns, exactly the reference's nine. */
function RecentCallsTable({ calls }: { calls: CallRead[] }) {
  return (
    <div className="scrollx">
      <table className="tb">
        <thead>
          <tr>
            <th>Time</th>
            <th>Agent</th>
            <th>Dir</th>
            <th>To</th>
            <th>Duration</th>
            <th>Cost</th>
            <th>Kept</th>
            <th>Config</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/calls/${c.id}`}>
                  {new Date(c.started_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Link>
              </td>
              <td className={c.agent_name ? "pri" : "na"}>
                {c.agent_name ?? "-"}
              </td>
              <td title={WHY.dir}>in</td>
              <td title={c.caller ? undefined : WHY.room}>
                {c.caller ?? c.room_name}
              </td>
              <td className={c.duration_seconds == null ? "na" : undefined}>
                {duration(c.duration_seconds)}
              </td>
              <td className="na" title={WHY.cost}>
                -
              </td>
              <td className="na" title={WHY.kept}>
                -
              </td>
              <td className="na" title={WHY.config}>
                -
              </td>
              <td>{statusBadge(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Running now": a campaign this repo cannot run, shown whole and inert. */
function RunningNow() {
  return (
    <section className="pnl">
      <header className="ph">
        Running now
        <SampleDot />
        <span className="meta">{SAMPLE.campaign.of}</span>
      </header>
      <div className="pb">
        <div className="row" style={{ marginBottom: 12 }}>
          <Badge tone="violation">Running</Badge>
          <span style={{ font: "var(--type-card-title)" }}>
            {SAMPLE.campaign.name}
          </span>
        </div>
        <Meter segments={SAMPLE_METER} />
        <p
          className="num mut"
          style={{ font: "var(--type-body-sm)", margin: "12px 0 0" }}
        >
          {SAMPLE.campaign.progress}
        </p>
        <p
          className="num"
          style={{ font: "var(--type-body-sm)", margin: "4px 0 0" }}
        >
          {SAMPLE.campaign.money}
        </p>
        <div className="row" style={{ marginTop: 14 }}>
          <Button size="sm" disabled title={WHY.pause}>
            Pause
          </Button>
          <Button size="sm" variant="ghost" disabled title={WHY.open}>
            Open →
          </Button>
        </div>
      </div>
    </section>
  );
}

/** One Health row: state chip, what it is about, and how old the reading is. */
function HealthRow({
  chip,
  label,
  age,
  sample,
}: {
  chip: ReactNode;
  label: string;
  age: string;
  sample?: boolean;
}) {
  return (
    <div
      className="row"
      style={{ gap: 10, flexWrap: "nowrap", padding: "9px 0" }}
    >
      <span style={{ flex: "none" }}>{chip}</span>
      <span
        className="mut"
        style={{ font: "var(--type-body-sm)", minWidth: 0 }}
      >
        {label}
      </span>
      {sample && <SampleDot />}
      <span
        className="num fnt"
        style={{
          marginLeft: "auto",
          flex: "none",
          font: "var(--type-caption)",
        }}
      >
        {age}
      </span>
    </div>
  );
}

function Health({ data }: { data: CallOverviewResponse | null }) {
  const reported = data != null && data.last_report.at != null;
  const failed = data?.failed;
  const rate =
    failed && failed.of > 0
      ? `${((failed.count / failed.of) * 100).toFixed(1)}%`
      : null;
  const seamAge = useSeamAge(
    data?.last_report.at ?? null,
    data?.last_report.seconds_ago ?? null,
  );

  return (
    <section className="pnl">
      <header className="ph">
        Health
        <span className="meta">agent → backend</span>
      </header>
      <div className="pb">
        <HealthRow
          chip={
            reported ? (
              <Badge tone="success">Reporting</Badge>
            ) : (
              <Badge tone="warning">No reports</Badge>
            )
          }
          label="Metering seam"
          age={data ? seamAge : "-"}
        />
        <HealthRow
          chip={
            failed ? (
              // Red is for a real outage. Zero failures is the good state, and
              // painting it the same solid red makes a healthy deployment look
              // like a broken one.
              <Badge tone={failed.count > 0 ? "violation" : "success"}>
                {failed.count} failed
              </Badge>
            ) : (
              <Badge tone="neutral">- failed</Badge>
            )
          }
          label={
            !failed
              ? "of an unknown total"
              : failed.of === 0
                // A window with no calls in it is a measured zero. Calling it
                // unknown reports the one thing we do know as missing.
                ? "of no calls in this window"
                : `of ${failed.of.toLocaleString()} · ${rate}`
          }
          age={failed ? `${failed.window_hours}h` : "-"}
        />
        <HealthRow
          chip={<Badge tone="warning">{SAMPLE.flagged} flagged</Badge>}
          label="placed anyway"
          age="24h"
          sample
        />
      </div>
    </section>
  );
}

/** "Spend per day". Illustrative only: nothing here prices a minute. */
function SpendPerDay() {
  return (
    <section className="pnl">
      <header className="ph">
        Spend per day
        <SampleDot />
        <span className="meta">provider cost, $</span>
      </header>
      <div className="pb">
        <div className="chartbox">
          <DottedLineChart
            points={SAMPLE_SPEND}
            height={132}
            label="Sample shape. Nothing in this repo prices a minute."
            showAxis
            xLabels={SAMPLE_SPEND_DAYS}
          />
        </div>
      </div>
    </section>
  );
}

export function Overview() {
  const [overview, setOverview] = useState<CallOverviewResponse | null>(null);
  const [calls, setCalls] = useState<CallRead[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<Load>("loading");

  useEffect(() => {
    let live = true;

    // listCalls decides the state of the page. A 404 or a dead socket is the
    // difference between "this checkout has no call log" and "you have no
    // calls", and conflating them sends the reader to fix the wrong thing.
    listCalls({ limit: 6 })
      .then((r) => {
        if (!live) return;
        setCalls(r.calls);
        setTotal(r.total);
        setState("ok");
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.isForbidden) setState("refused");
        else setState("unwired");
      });

    // The rollup is fetched separately on purpose. If it fails while the list
    // works, the real figures render dashes instead of taking the whole page
    // down, and a dash is the honest answer for a number nobody measured.
    getCallOverview()
      .then((o) => {
        if (live) setOverview(o);
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, []);

  // The panel body is the only part of the page that changes with the load
  // state. The frame around it is always drawn, because the shape of the
  // console is the point of this screen.
  let body;
  if (state === "loading") {
    body = <div className="empty">Loading your call activity</div>;
  } else if (state === "refused") {
    // The backend answered and said no. That is an authorisation answer, not an
    // outage, and saying "unreachable" here would send the reader to check
    // Docker.
    body = (
      <div className="empty">
        <h2>The backend refused this account</h2>
        <p>
          It is reachable and it answered. This sign-in is not allowed to read
          calls, so the fix is the account, not the stack.
        </p>
        <span className="cmd">GET {API_BASE}/api/v1/calls/ responded 403</span>
      </div>
    );
  } else if (state === "unwired") {
    // Zero state one: there is no call log on this checkout to be empty.
    body = (
      <div className="empty">
        <h2>The call log is not wired up in this checkout yet</h2>
        <p>
          The console asked the backend for calls and got no list back. This is
          unknown, not a measured zero. Nothing is broken in the voice path:
          your agent still answers, speaks, and hangs up without this page.
        </p>
        <span className="cmd">GET {API_BASE}/api/v1/calls/</span>
      </div>
    );
  } else if (total === 0) {
    // Zero state two: the log exists, answered, and is genuinely empty.
    body = (
      <div className="empty">
        <h2>No calls yet</h2>
        <p>
          The backend answered with an empty log, so this is a real zero. Calls
          land here the moment the agent reports one, with the caller, the
          duration, and the full transcript.
        </p>
        <span className="cmd">
          Open Agents, pick your agent, and start a test call
        </span>
      </div>
    );
  } else {
    body = <RecentCallsTable calls={calls} />;
  }

  const stateBadge =
    state === "refused" ? (
      <Badge tone="warning">Refused</Badge>
    ) : state === "unwired" ? (
      <Badge tone="warning">No call log</Badge>
    ) : null;

  return (
    <>
      <TopBar
        title="Overview"
        badge={
          <span className="row" style={{ gap: 8 }}>
            <span title={WHY.warnMode}>
              <Badge tone="neutral">Warn mode</Badge>
            </span>
            {stateBadge}
          </span>
        }
        actions={
          <>
            {/* Drawn as the reference draws it: a bordered field beside a
                button, not a second button. Inert either way. */}
            <span className="inert-field" title={WHY.range}>
              Last 30 days
            </span>
            <Button size="sm" disabled title={WHY.csv}>
              Export .csv
            </Button>
          </>
        }
      />

      <MoneyStrip />
      <StatRow data={overview} />

      <div className="pad">
        <div className="split">
          <section className="pnl">
            <header className="ph">
              Recent calls
              <span className="meta">
                {total.toLocaleString()} recorded ·{" "}
                <Link to="/calls">View all →</Link>
              </span>
            </header>
            {body}
          </section>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--pad-frame)",
            }}
          >
            <RunningNow />
            <Health data={overview} />
            <SpendPerDay />
          </div>
        </div>
      </div>
    </>
  );
}
