import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router";
import { API_BASE, getCall, listCalls } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button } from "../components/ds";
import { duration } from "../lib/format";
import type { CallDetailResponse, CallRead, CallStatus } from "../types";

// The call log, laid out as the full product lays it out.
//
// Every column of the reference is here in the reference's order. The ones this
// repo actually records are filled from the backend. The ones it does not record
// (cost, billing, campaigns, config versions, direction) render a dash rather
// than a zero or a plausible number, so the shape of the paid product stays
// legible without a single invented figure.

const PAGE = 50;

// The complete set of statuses the backend can return, so no chip can ever show
// a zero for something that was never measured.
const STATUS_CHIPS = [
  { key: "all", label: "All", tone: "neutral" },
  { key: "completed", label: "Completed", tone: "success" },
  { key: "failed", label: "Failed", tone: "violation" },
  { key: "active", label: "Active", tone: "neutral" },
] as const;

function statusBadge(status: CallStatus) {
  if (status === "completed") return <Badge tone="success">Completed</Badge>;
  if (status === "failed") return <Badge tone="violation">Failed</Badge>;
  return <Badge tone="neutral">Active</Badge>;
}

/** A cell this deployment has no reading for. Never a zero, never a guess. */
function Na({ why }: { why: string }) {
  return (
    <td className="na" title={why}>
      -
    </td>
  );
}

function elapsed(startedAt: string, at: string): string {
  const ms = new Date(at).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms)) return "-";
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ReceiptLine({ k, total }: { k: string; total?: boolean }) {
  return (
    <div className={total ? "rc tot" : "rc"}>
      <span className="k">{k}</span>
      <span className="num fnt">-</span>
    </div>
  );
}

export function CallLogs() {
  const [calls, setCalls] = useState<CallRead[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "unwired">("loading");

  useEffect(() => {
    let live = true;
    listCalls({ limit: PAGE, offset, channel, status })
      .then((r) => {
        if (!live) return;
        setCalls(r.calls);
        setTotal(r.total);
        setState("ok");
      })
      .catch(() => {
        if (!live) return;
        setState("unwired");
      });
    return () => {
      live = false;
    };
  }, [channel, status, offset]);

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

  const toggleRow = (id: number): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A new page or a new filter is a new view: the open drawer and the ticked
  // rows both belonged to the old one.
  const resetView = (): void => {
    setOpenId(null);
    setSelected(new Set());
  };

  const pickFilter = (set: (v: string) => void, value: string): void => {
    set(value);
    setOffset(0);
    resetView();
  };

  const goTo = (next: number): void => {
    setOffset(next);
    resetView();
  };

  return (
    <>
      <TopBar
        title="Calls"
        badge={
          state === "unwired" ? <Badge tone="warning">No call log</Badge> : null
        }
        actions={
          <>
            {selected.size > 0 && (
              <span className="mut" style={{ font: "var(--type-caption)" }}>
                {selected.size} selected
              </span>
            )}
            <Button
              size="sm"
              disabled
              title="Not built here: this repo has no evaluation runner to save a suite into."
            >
              Save as eval suite
            </Button>
            <Button
              size="sm"
              disabled
              title="Not built here: this backend has no CSV export endpoint."
            >
              Export .csv
            </Button>
          </>
        }
      />

      {state !== "unwired" && (
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
            style={{ flex: 1, minWidth: 240 }}
            placeholder="Search number, agent, room"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search calls"
          />
          <Button
            size="sm"
            disabled
            title="Not built here: the call log has no per-agent filter, so there is nothing to pick."
          >
            All agents ▾
          </Button>
          <select
            className="btn sm"
            aria-label="Channel"
            value={channel}
            onChange={(e) => pickFilter(setChannel, e.target.value)}
          >
            <option value="all">Any channel</option>
            <option value="web">Web</option>
            <option value="sip">Phone</option>
          </select>
          <Button
            size="sm"
            disabled
            title="Not built here: this repo has no campaigns, so no call carries one."
          >
            Any campaign ▾
          </Button>
          <Button
            size="sm"
            disabled
            title="Not built here: this repo does not version agent config, so no call carries a version."
          >
            Config version ▾
          </Button>
          <span style={{ width: 8 }} />
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => pickFilter(setStatus, chip.key)}
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
      )}

      {state === "unwired" ? (
        <div className="pad">
          <section className="pnl">
            <div className="empty">
              <h2>The call log is not wired up in this checkout yet</h2>
              <p>
                This list is unknown, not empty. The voice path is unaffected:
                the agent answers and speaks whether or not this console can see
                it.
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
                The backend answered with an empty log, so this is a measured
                zero. Every call the agent reports lands here with its caller,
                duration, and transcript.
              </p>
              <span className="cmd">
                Open Agents, pick your agent, and start a test call
              </span>
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="scrollx">
            <table className="tb">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Time</th>
                  <th>Agent</th>
                  <th>Config</th>
                  <th>Channel</th>
                  <th>Dir</th>
                  <th>To</th>
                  <th>Campaign</th>
                  <th>Duration</th>
                  <th>Cost</th>
                  <th>Billed</th>
                  <th>Kept</th>
                  <th>Status</th>
                  <th style={{ width: 28 }} />
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  // The log is not empty, the search is. Say which one, and say
                  // how many rows the current filters did load.
                  <tr>
                    <td
                      colSpan={14}
                      className="empty"
                      style={{ height: "auto", whiteSpace: "normal" }}
                    >
                      No call matches that search.{" "}
                      {calls.length.toLocaleString()} of{" "}
                      {total.toLocaleString()} are loaded under the current
                      filters.
                    </td>
                  </tr>
                ) : (
                  shown.map((c) => (
                    <Fragment key={c.id}>
                      <tr
                        className={
                          openId === c.id ? "clickable hl" : "clickable"
                        }
                        onClick={() =>
                          setOpenId((id) => (id === c.id ? null : c.id))
                        }
                      >
                        <td className="fnt">
                          <button
                            type="button"
                            aria-pressed={selected.has(c.id)}
                            aria-label={`Select the call from ${c.caller ?? c.room_name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRow(c.id);
                            }}
                            style={{
                              background: "none",
                              border: 0,
                              padding: 0,
                              cursor: "pointer",
                              color: "inherit",
                              font: "inherit",
                            }}
                          >
                            {selected.has(c.id) ? "◼" : "◻"}
                          </button>
                        </td>
                        <td>
                          {new Date(c.started_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className={c.agent_name ? "pri" : "na"}>
                          {c.agent_name ?? "-"}
                        </td>
                        <Na why="Not recorded: this repo does not version agent config." />
                        <td>{c.channel === "sip" ? "Phone" : "Web"}</td>
                        <Na why="Not recorded: this repo does not record call direction." />
                        {/* A web call has no caller id. The room name is what
                            was actually recorded, so it stands in rather than a
                            dash. */}
                        <td
                          title={
                            c.caller
                              ? undefined
                              : "No caller id on a web call, showing the room that was recorded"
                          }
                        >
                          {c.caller ?? c.room_name}
                        </td>
                        <Na why="Not recorded: this repo has no campaigns, so no call belongs to one." />
                        <td
                          className={
                            c.duration_seconds == null ? "na" : undefined
                          }
                          title={
                            c.duration_seconds == null
                              ? "This call is still in flight, so it has no duration yet."
                              : undefined
                          }
                        >
                          {duration(c.duration_seconds)}
                        </td>
                        <Na why="Not metered: nothing in this repo prices a minute." />
                        <Na why="Not metered: nothing in this repo bills a minute." />
                        <Na why="Not metered: kept needs both a cost and a billed figure." />
                        <td>{statusBadge(c.status)}</td>
                        <td className="fnt">{openId === c.id ? "⌄" : "›"}</td>
                      </tr>
                      {openId === c.id && (
                        <tr>
                          <td
                            colSpan={14}
                            style={{
                              padding: 0,
                              height: "auto",
                              whiteSpace: "normal",
                              background: "var(--surface-raised)",
                            }}
                          >
                            {/* Keyed so a different call always remounts:
                                the fetch below then runs on mount only. */}
                            <Drawer key={c.id} call={c} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
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
            <Button
              size="sm"
              disabled={offset === 0}
              onClick={() => goTo(Math.max(0, offset - PAGE))}
            >
              ← Prev
            </Button>
            <Button
              size="sm"
              disabled={offset + PAGE >= total}
              onClick={() => goTo(offset + PAGE)}
            >
              Next →
            </Button>
            <span className="num mut" style={{ font: "var(--type-caption)" }}>
              {(offset + 1).toLocaleString()}-
              {(offset + calls.length).toLocaleString()} of{" "}
              {total.toLocaleString()}
            </span>
            <span style={{ marginLeft: "auto" }}>
              <Ann>
                A dash means unmeasured, never zero. This repo records what was
                said on a call, not what a minute cost, so cost, billing,
                campaigns and config versions stay blank rather than guess.
              </Ann>
            </span>
          </div>
        </>
      )}
    </>
  );
}

/**
 * The expanded row. Transcript on the left from the record this backend keeps,
 * receipt on the right with every figure dashed, because nothing in this repo
 * meters a minute.
 */
function Drawer({ call }: { call: CallRead }) {
  const [data, setData] = useState<CallDetailResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    getCall(call.id)
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [call.id]);

  const transcript = data?.transcript ?? [];

  return (
    <div
      style={{ display: "flex", flexWrap: "wrap" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          flex: 1,
          minWidth: 320,
          borderRight: "1px solid var(--border-default)",
        }}
      >
        <div className="ph">
          Transcript
          <span className="meta">
            {data
              ? `${transcript.length.toLocaleString()} turns · interruptions are not measured here`
              : "loading"}
          </span>
        </div>

        {failed ? (
          <div className="empty">
            Could not load this call's transcript. The row above is still what
            the log reported.
          </div>
        ) : !data ? (
          <div className="empty">Loading this call</div>
        ) : transcript.length === 0 ? (
          <div className="empty">
            No turns were recorded for this call. That is the record, not a
            loading state.
          </div>
        ) : (
          <div className="turns">
            {transcript.map((t) => (
              <div className="turn" key={t.id}>
                <span className="who">
                  {t.role === "agent" ? "Agent" : "Caller"}
                </span>
                <span className="txt">{t.text}</span>
                <span
                  className="tm"
                  title={new Date(t.spoken_at).toLocaleString()}
                >
                  {elapsed(call.started_at, t.spoken_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="pb" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn sm" to={`/calls/${call.id}`}>
            Open full call →
          </Link>
          <Button
            size="sm"
            variant="ghost"
            disabled
            title="Not built here: this repo has no evaluation runner to save a scenario into."
          >
            Save as eval scenario
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled
            title="Not built here: this console has no transcript export."
          >
            Copy as .md
          </Button>
        </div>
      </div>

      <div style={{ width: 340, flex: "none" }}>
        <div className="ph">
          Receipt<span className="meta">not metered here</span>
        </div>
        <div className="pb">
          <ReceiptLine k="STT" />
          <ReceiptLine k="LLM" />
          <ReceiptLine k="TTS" />
          <ReceiptLine k="Telephony" />
          <ReceiptLine k="Cost" total />
          <ReceiptLine k="Billed" />
          <ReceiptLine k="Kept" />
          <p
            className="fnt"
            style={{ font: "var(--type-caption)", margin: "12px 0 0" }}
          >
            Nothing in this repo prices a minute, so every figure here is a
            dash. The duration and the transcript beside it are measured.
          </p>
        </div>
      </div>
    </div>
  );
}
