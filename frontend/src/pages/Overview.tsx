import { useEffect, useState } from "react";
import { Link } from "react-router";
import { API_BASE, ApiError, getSummary, listCalls } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, DottedLineChart } from "../components/ds";
import { duration } from "../lib/format";
import type { CallRead, CallSummaryResponse } from "../types";

// The one page that has to earn the console. It shows this deployment's own real
// call activity: what happened on each call, and nothing it cannot measure.

type Load = "loading" | "ok" | "unwired" | "refused";

function statusBadge(c: CallRead) {
  if (c.status === "completed") return <Badge tone="success">Completed</Badge>;
  if (c.status === "failed") return <Badge tone="violation">Failed</Badge>;
  return <Badge tone="neutral">In progress</Badge>;
}

export function Overview() {
  const [summary, setSummary] = useState<CallSummaryResponse | null>(null);
  const [calls, setCalls] = useState<CallRead[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<Load>("loading");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;

    // listCalls decides the state of the page. A 404 or a dead socket is the
    // difference between "this checkout has no call log" and "you have no calls",
    // and conflating them sends the reader to fix the wrong thing.
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
    // works, the totals below render dashes instead of taking the whole page
    // down, and a dash is the honest answer for a number nobody measured.
    getSummary()
      .then((s) => {
        if (live) setSummary(s);
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [nonce]);

  const refresh = () => setNonce((n) => n + 1);

  if (state === "loading") {
    return (
      <>
        <TopBar title="Overview" />
        <div className="empty">Loading your call activity</div>
      </>
    );
  }

  // The backend answered and said no. That is an authorisation answer, not an
  // outage, and saying "unreachable" here would send the reader to check Docker.
  if (state === "refused") {
    return (
      <>
        <TopBar
          title="Overview"
          badge={<Badge tone="warning">Refused</Badge>}
          actions={
            <Button size="sm" onClick={refresh}>
              Retry
            </Button>
          }
        />
        <div className="pad">
          <section className="pnl">
            <div className="empty">
              <h2>The backend refused this account</h2>
              <p>
                It is reachable and it answered. This sign-in is not allowed to
                read calls, so the fix is the account, not the stack.
              </p>
              <span className="cmd">
                GET {API_BASE}/api/v1/calls/ responded 403
              </span>
            </div>
          </section>
        </div>
      </>
    );
  }

  // Zero state one: there is no call log on this checkout to be empty.
  if (state === "unwired") {
    return (
      <>
        <TopBar
          title="Overview"
          badge={<Badge tone="warning">No call log</Badge>}
          actions={
            <Button size="sm" onClick={refresh}>
              Retry
            </Button>
          }
        />
        <div className="pad">
          <section className="pnl">
            <div className="empty">
              <h2>The call log is not wired up in this checkout yet</h2>
              <p>
                The console asked the backend for calls and got no list back.
                Nothing is broken in the voice path: your agent still answers,
                speaks, and hangs up without this page.
              </p>
              <span className="cmd">GET {API_BASE}/api/v1/calls/</span>
            </div>
          </section>
          <Ann>
            This is not the same screen as an empty log. An empty log is a
            measured zero. This one is unknown, so it does not show you a zero.
          </Ann>
        </div>
      </>
    );
  }

  // Zero state two: the log exists, answered, and is genuinely empty.
  if (total === 0) {
    return (
      <>
        <TopBar
          title="Overview"
          badge={<Badge tone="neutral">No calls yet</Badge>}
          actions={
            <Button size="sm" onClick={refresh}>
              Refresh
            </Button>
          }
        />
        <div className="pad">
          <section className="pnl">
            <div className="empty">
              <h2>No calls yet</h2>
              <p>
                The backend answered with an empty log, so this is a real zero.
                Calls land here the moment the agent reports one, with the
                caller, the duration, and the full transcript.
              </p>
              <span className="cmd">
                Open Agents, pick your agent, and start a test call
              </span>
            </div>
          </section>
        </div>
      </>
    );
  }

  const avgTurns =
    summary && summary.total_calls > 0
      ? (summary.total_turns / summary.total_calls).toFixed(1)
      : null;

  // A call still in flight has no duration yet. Drop it rather than plotting a
  // zero, which would read as an instant call. xLabels stays aligned because
  // both are derived from this same filtered list.
  const measured = calls.filter(
    (c): c is CallRead & { duration_seconds: number } =>
      c.duration_seconds != null,
  );

  return (
    <>
      <TopBar
        title="Overview"
        badge={<Badge tone="neutral">this deployment</Badge>}
        actions={
          <Button size="sm" onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {/* Measured, from your own backend. Every one of these is countable. */}
      <div
        className="statrow"
        style={{ borderBottom: "1px solid var(--border-default)" }}
      >
        <div className="stat">
          <b className="num">{total.toLocaleString()}</b>
          <i>Calls</i>
          <u>recorded in the log</u>
        </div>
        <div className="stat">
          <b className={summary ? "num" : "num na fnt"}>
            {summary ? Math.round(summary.total_minutes).toLocaleString() : "-"}
          </b>
          <i>Minutes</i>
          <u>{summary ? "across every call" : "rollup unavailable"}</u>
        </div>
        <div className="stat">
          <b className={summary ? "num" : "num na fnt"}>
            {summary ? summary.total_turns.toLocaleString() : "-"}
          </b>
          <i>Turns</i>
          <u>{summary ? "spoken, both sides" : "rollup unavailable"}</u>
        </div>
        <div className="stat">
          <b className={avgTurns ? "num" : "num na fnt"}>{avgTurns ?? "-"}</b>
          <i>Turns per call</i>
          <u>{avgTurns ? "average" : "needs the rollup"}</u>
        </div>
      </div>

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
            <div className="scrollx">
              <table className="tb">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Caller</th>
                    <th>Channel</th>
                    <th>Agent</th>
                    <th>Duration</th>
                    <th>Turns</th>
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
                      <td className={c.caller ? "pri" : "na"}>
                        {c.caller ?? "-"}
                      </td>
                      <td>{c.channel === "sip" ? "Phone" : "Web"}</td>
                      <td className={c.agent_name ? undefined : "na"}>
                        {c.agent_name ?? "-"}
                      </td>
                      <td
                        className={
                          c.duration_seconds == null ? "na" : undefined
                        }
                      >
                        {duration(c.duration_seconds)}
                      </td>
                      <td>{c.turn_count}</td>
                      <td>{statusBadge(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pb">
              <Ann>
                A dash means unmeasured, never zero. A call still in flight has
                no duration to show yet.
              </Ann>
            </div>
          </section>

          <section className="pnl">
            <header className="ph">
              Call length
              <span className="meta">minutes, oldest left</span>
            </header>
            <div className="pb">
              {measured.length > 0 ? (
                <DottedLineChart
                  points={measured
                    .map((c) => c.duration_seconds / 60)
                    .reverse()}
                  height={132}
                  label="Duration of each recent call, in minutes"
                  showAxis
                  xLabels={measured
                    .map((c) =>
                      new Date(c.started_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    )
                    .reverse()}
                />
              ) : (
                <p
                  className="fnt"
                  style={{ font: "var(--type-body-sm)", margin: 0 }}
                >
                  No recent call has finished, so there is no length to plot. An
                  unfinished call is not a zero minute call.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
