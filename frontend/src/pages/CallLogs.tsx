import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { API_BASE, ApiError, listCalls } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, LockedBlock } from "../components/ds";
import { duration } from "../lib/format";
import type { CallRead, CallStatus } from "../types";

// Every call the agent reported, filterable. The two columns on the right are
// the ones this repo cannot fill: they are drawn in place and locked, so the
// absence sits exactly where the number would be rather than being left out.

const CHANNELS: { key: string; label: string }[] = [
  { key: "all", label: "Any channel" },
  { key: "web", label: "Web" },
  { key: "sip", label: "Phone" },
];

const STATUSES: { key: string; label: string; tone: "neutral" | "success" | "violation" }[] = [
  { key: "all", label: "All", tone: "neutral" },
  { key: "active", label: "Active", tone: "neutral" },
  { key: "completed", label: "Completed", tone: "success" },
  { key: "failed", label: "Failed", tone: "violation" },
];

function statusBadge(status: CallStatus) {
  if (status === "completed") return <Badge tone="success">Completed</Badge>;
  if (status === "failed") return <Badge tone="violation">Failed</Badge>;
  return <Badge tone="neutral">Active</Badge>;
}

export function CallLogs() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState<CallRead[]>([]);
  const [total, setTotal] = useState(0);
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "unwired">("loading");

  useEffect(() => {
    let live = true;
    // No setState here. React 19's lint rule rejects a synchronous setState in
    // an effect body, and resetting to "loading" on a filter change would blank
    // rows that are about to be replaced anyway.
    listCalls({ limit: 50, channel, status })
      .then((r) => {
        if (!live) return;
        setCalls(r.calls);
        setTotal(r.total);
        setState("ok");
      })
      .catch((e: unknown) => {
        if (!live) return;
        // A lapsed token is not an outage: App drops back to the login form.
        if (e instanceof ApiError && e.isExpiredSession) return;
        setState("unwired");
      });
    return () => {
      live = false;
    };
  }, [channel, status]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? calls.filter((c) =>
        [c.caller, c.room_name, c.agent_name, c.business_name]
          .filter((v): v is string => v != null)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : calls;

  return (
    <>
      <TopBar
        title="Calls"
        badge={
          state === "unwired" ? <Badge tone="warning">No call log</Badge> : <Badge tone="neutral">this deployment</Badge>
        }
        actions={
          <Button
            size="sm"
            disabled
            title="Not built here: this backend has no CSV export endpoint."
          >
            Export .csv
          </Button>
        }
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px var(--pad-frame)",
          borderBottom: "1px solid var(--border-default)",
          flexWrap: "wrap",
        }}
      >
        <input
          className="inp"
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Search caller, room, agent"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search calls"
        />
        {CHANNELS.map((ch) => (
          <Button
            key={ch.key}
            size="sm"
            variant={channel === ch.key ? "primary" : "secondary"}
            onClick={() => setChannel(ch.key)}
          >
            {ch.label}
          </Button>
        ))}
        <span style={{ width: 8 }} />
        {STATUSES.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setStatus(chip.key)}
            aria-pressed={status === chip.key}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              opacity: status === chip.key ? 1 : 0.45,
            }}
          >
            <Badge tone={chip.tone}>{chip.label}</Badge>
          </button>
        ))}
      </div>

      {state === "unwired" ? (
        <div className="pad">
          <section className="pnl">
            <div className="empty">
              <h2>The call log is not wired up in this checkout yet</h2>
              <p>
                This list is unknown, not empty. The voice path is unaffected: the agent answers and speaks whether
                or not this console can see it.
              </p>
              <span className="cmd">GET {API_BASE}/api/v1/calls/</span>
            </div>
          </section>
        </div>
      ) : state === "loading" ? (
        <div className="empty">Loading calls</div>
      ) : total === 0 ? (
        <div className="pad">
          <section className="pnl">
            <div className="empty">
              <h2>No calls yet</h2>
              <p>
                The backend answered with an empty log, so this is a measured zero. Every call the agent reports
                lands here with its caller, duration, and transcript.
              </p>
              <span className="cmd">Open Agents, pick your agent, and start a test call</span>
            </div>
          </section>
        </div>
      ) : shown.length === 0 ? (
        // The log is not empty, the search is. Say which one, and say how many
        // rows the current filters did load.
        <div className="empty">
          No call matches that search. {calls.length.toLocaleString()} of {total.toLocaleString()} are loaded under
          the current filters.
        </div>
      ) : (
        <>
          <div className="scrollx">
            <table className="tb">
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Channel</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Turns</th>
                  <th>Status</th>
                  <th>Cost</th>
                  <th>Kept</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c, i) => (
                  <tr key={c.id} className="clickable" onClick={() => navigate(`/calls/${c.id}`)}>
                    {/* A web call has no caller id. The room name is what was
                        actually recorded, so it stands in rather than a dash. */}
                    <td className="pri">
                      <Link
                        to={`/calls/${c.id}`}
                        title={c.caller ? undefined : "No caller id on a web call, showing the room"}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.caller ?? c.room_name}
                      </Link>
                    </td>
                    <td>{c.channel === "sip" ? "Phone" : "Web"}</td>
                    <td>
                      {new Date(c.started_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className={c.duration_seconds == null ? "na" : undefined}>
                      {duration(c.duration_seconds)}
                    </td>
                    <td>{c.turn_count}</td>
                    <td>{statusBadge(c.status)}</td>
                    {/* The Cost and Kept columns, drawn once across every row.
                        One lock over the whole region beats repeating the same
                        upsell on all fifty lines, and it still lands in the
                        exact cells the numbers would occupy. */}
                    {i === 0 && (
                      <td
                        colSpan={2}
                        rowSpan={shown.length}
                        // This cell belongs to the first row, so without this a
                        // click on the Pro link would also open call one.
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          whiteSpace: "normal",
                          minWidth: 320,
                          verticalAlign: "middle",
                          background: "var(--surface-base)",
                        }}
                      >
                        <LockedBlock
                          inline
                          what="Per-call cost metered by provider, and what you kept after billing it on. ShipVoice Pro."
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: "12px var(--pad-frame)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderBottom: "1px solid var(--border-default)",
              flexWrap: "wrap",
            }}
          >
            <span className="num mut" style={{ font: "var(--type-caption)" }}>
              {shown.length.toLocaleString()} of {total.toLocaleString()}
            </span>
            <span style={{ marginLeft: "auto" }}>
              <Ann>A dash means unmeasured, never zero. A call still in flight has no duration yet.</Ann>
            </span>
          </div>
        </>
      )}
    </>
  );
}
