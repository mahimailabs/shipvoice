import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiError, deleteCall, getCall } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, KV } from "../components/ds";
import { duration } from "../lib/format";
import type { CallDetailResponse } from "../types";

// One call, in full: what was said, when, and by whom.

function elapsed(startedAt: string, at: string): string {
  const ms = new Date(at).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms)) return "-";
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Missing() {
  return <span className="na fnt">-</span>;
}

export function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CallDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    getCall(id)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.isMissing) {
          setError(
            "The backend answered 404. Either this call is not in the log, or the call log is not wired up in this checkout yet.",
          );
        } else {
          setError(
            "Could not reach the backend for this call. Your agent is unaffected.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [id]);

  const onDelete = (): void => {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    deleteCall(id)
      .then(() => navigate("/calls"))
      .catch((e: unknown) => {
        setDeleting(false);
        setDeleteError(
          e instanceof ApiError && e.isMissing
            ? "This call is already gone from the log."
            : "Could not delete this call. Nothing was removed.",
        );
      });
  };

  if (error) {
    return (
      <>
        <TopBar back={{ to: "/calls", label: "Calls" }} title="Call" />
        <div className="pad">
          <div className="banner bad" role="alert">
            <Badge tone="violation">error</Badge>
            <span>{error}</span>
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopBar back={{ to: "/calls", label: "Calls" }} title="Call" />
        <div className="empty">Loading this call</div>
      </>
    );
  }

  const { call, transcript } = data;
  const agentTurns = transcript.filter((t) => t.role === "agent").length;
  const callerTurns = transcript.filter((t) => t.role === "user").length;

  return (
    <>
      <TopBar
        back={{ to: "/calls", label: "Calls" }}
        title={<span className="num">{call.caller ?? call.room_name}</span>}
        badge={
          call.status === "completed" ? (
            <Badge tone="success">Completed</Badge>
          ) : call.status === "failed" ? (
            <Badge tone="violation">Failed</Badge>
          ) : (
            <Badge tone="neutral">Active</Badge>
          )
        }
        meta={`${new Date(call.started_at).toLocaleString()} · ${duration(call.duration_seconds)} · ${
          call.agent_name ?? "unknown agent"
        } · ${call.channel === "sip" ? "phone" : "web"}`}
        actions={
          confirming ? (
            <>
              <span className="mut" style={{ font: "var(--type-body-sm)" }}>
                Delete this call and its transcript?
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting" : "Yes, delete"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirming(true)}
            >
              Delete call
            </Button>
          )
        }
      />

      {deleteError && (
        <div className="pad">
          <div className="banner bad" role="alert">
            <Badge tone="violation">error</Badge>
            <span>{deleteError}</span>
          </div>
        </div>
      )}

      {/* Measured, from the record this backend actually keeps. */}
      <div
        className="statrow"
        style={{ borderBottom: "1px solid var(--border-default)" }}
      >
        <div className="stat">
          <b className={call.duration_seconds == null ? "num na fnt" : "num"}>
            {duration(call.duration_seconds)}
          </b>
          <i>Duration</i>
          <u>{call.ended_at ? "start to hangup" : "still in flight"}</u>
        </div>
        <div className="stat">
          <b className="num">{call.turn_count.toLocaleString()}</b>
          <i>Turns</i>
          <u>as recorded on the call</u>
        </div>
        <div className="stat">
          <b className="num">{agentTurns.toLocaleString()}</b>
          <i>Agent turns</i>
          <u>counted in the transcript</u>
        </div>
        <div className="stat">
          <b className="num">{callerTurns.toLocaleString()}</b>
          <i>Caller turns</i>
          <u>counted in the transcript</u>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0, flexWrap: "wrap" }}>
        <div
          style={{
            flex: 1,
            minWidth: 320,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border-default)",
            borderTop: "1px solid var(--border-default)",
          }}
        >
          <div className="ph">
            Transcript
            <span className="meta">
              {transcript.length.toLocaleString()} turns · times are from the
              start of the call
            </span>
          </div>
          {transcript.length === 0 ? (
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
        </div>

        <div
          style={{
            width: 380,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            borderTop: "1px solid var(--border-default)",
          }}
        >
          <div className="ph">
            Call<span className="meta">as the agent reported it</span>
          </div>
          <div
            className="pb"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <KV k="Room" mono>
              {call.room_name}
            </KV>
            <KV k="Caller" mono>
              {call.caller ?? <Missing />}
            </KV>
            <KV k="Channel">{call.channel === "sip" ? "Phone" : "Web"}</KV>
            <KV k="Agent">{call.agent_name ?? <Missing />}</KV>
            <KV k="Business">{call.business_name ?? <Missing />}</KV>
            <KV k="Started">{new Date(call.started_at).toLocaleString()}</KV>
            <KV k="Ended">
              {call.ended_at ? (
                new Date(call.ended_at).toLocaleString()
              ) : (
                <Missing />
              )}
            </KV>
            <KV k="Call id" mono>
              {call.id}
            </KV>
          </div>

          <div className="ph">
            Not on this record<span className="meta">by design</span>
          </div>
          <div className="pb" style={{ flex: 1 }}>
            <p
              className="mut"
              style={{ font: "var(--type-body-sm)", margin: "0 0 10px" }}
            >
              This repo records what happened on the call. Nothing here meters
              what a minute cost, so there is no per-provider cost on this
              record and no number to bill from.
            </p>
            <Ann>
              A dash above means the agent never reported that field. It is an
              absence, not an empty string.
            </Ann>
          </div>
        </div>
      </div>
    </>
  );
}
