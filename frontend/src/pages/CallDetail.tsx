import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiError, deleteCall, getCall, listAgents } from "../api";
import { TopBar } from "../components/AppShell";
import { Badge, Button, KV, Stat } from "../components/ds";
import type {
  AgentSummary,
  CallDetailResponse,
  CallRead,
  TurnRead,
} from "../types";

// One call, in full.
//
// The layout is the full product's call detail: a seven cell money strip, the
// transcript, and a compliance / stack / quality column. This repo records what
// was said and nothing else, so every cell it cannot measure renders a dash on
// the "na" class. A dash means unmeasured, never zero.

/** Elapsed time from the start of the call, mm:ss, as the reference shows it. */
function elapsed(startedAt: string, at: string): string {
  const ms = new Date(at).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(ms)) return "--:--";
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** A wall-clock length, m:ss. */
function clock(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Dash() {
  return <span className="na fnt">-</span>;
}

function role(turn: TurnRead): string {
  return turn.role === "agent" ? "Agent" : "Caller";
}

/** The transcript as markdown, which is the one action on this page that is real. */
function toMarkdown(call: CallRead, transcript: TurnRead[]): string {
  const lines = [
    `# Call ${call.caller ?? call.room_name}`,
    "",
    `- Started: ${new Date(call.started_at).toISOString()}`,
    `- Duration: ${clock(call.duration_seconds)}`,
    `- Agent: ${call.agent_name ?? "not reported"}`,
    `- Channel: ${call.channel === "sip" ? "phone (SIP)" : "web"}`,
    `- Status: ${call.status}`,
    `- Turns: ${transcript.length}`,
    "",
    "## Transcript",
    "",
  ];
  if (transcript.length === 0) {
    lines.push("No turns were recorded for this call.");
  }
  for (const t of transcript) {
    lines.push(
      `**${role(t).toUpperCase()}** ${elapsed(call.started_at, t.spoken_at)}`,
    );
    lines.push("");
    lines.push(t.text);
    lines.push("");
  }
  return lines.join("\n");
}

export function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CallDetailResponse | null>(null);
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

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

  // The declared provider stack. It is the only source for the STT, LLM and TTS
  // hints, so when it does not load those hints say nothing rather than guess.
  useEffect(() => {
    let live = true;
    listAgents()
      .then((r) => {
        if (live) setAgents(r.agents);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (copied === "idle") return;
    const t = window.setTimeout(() => setCopied("idle"), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

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
  const started = new Date(call.started_at);

  // Only an exact name match, or the single agent this deployment declares.
  // Anything looser would attribute one agent's providers to another's call.
  const stack =
    agents == null
      ? null
      : (agents.find((a) => a.agent_name === call.agent_name) ??
        (agents.length === 1 ? agents[0] : null));

  const meta = [
    started.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    started.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    clock(call.duration_seconds),
    call.agent_name ?? "unknown agent",
  ].join(" · ");

  const onCopy = (): void => {
    const clip = navigator.clipboard;
    if (!clip) {
      setCopied("failed");
      return;
    }
    clip
      .writeText(toMarkdown(call, transcript))
      .then(() => setCopied("done"))
      .catch(() => setCopied("failed"));
  };

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
            <Badge tone="neutral">In progress</Badge>
          )
        }
        meta={meta}
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
            <>
              <Button
                size="sm"
                disabled
                title="Not built here: this starter has no eval runner, so there is nowhere for a scenario to go."
              >
                Save as eval scenario
              </Button>
              <Button size="sm" onClick={onCopy}>
                {copied === "done"
                  ? "Copied"
                  : copied === "failed"
                    ? "Clipboard blocked"
                    : "Copy as .md"}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => setConfirming(true)}
              >
                Delete call
              </Button>
            </>
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

      {/* The money strip of the full product. Every value here is a dash because
          nothing in this repo meters a minute. The hints are real where a real
          answer exists. */}
      <div className="statrow">
        <Stat
          value={<Dash />}
          label="STT"
          hint={stack?.stt ?? "provider not declared"}
        />
        <Stat
          value={<Dash />}
          label="LLM"
          hint={stack?.llm ?? "provider not declared"}
        />
        <Stat
          value={<Dash />}
          label="TTS"
          hint={stack?.tts ?? "provider not declared"}
        />
        <Stat value={<Dash />} label="Telephony" hint="this starter is web only" />
        <Stat value={<Dash />} label="Cost" hint="sum of the four" />
        <Stat
          value={<Dash />}
          label="Billed"
          hint="your rate across metered minutes"
        />
        <Stat value={<Dash />} label="Kept" hint="billed minus cost" />
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
              {transcript.length.toLocaleString()} turns
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
                  <span
                    className="tm"
                    style={{ marginLeft: 0, width: 44 }}
                    title={new Date(t.spoken_at).toLocaleString()}
                  >
                    {elapsed(call.started_at, t.spoken_at)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <span
                      className="who"
                      style={{
                        display: "block",
                        width: "auto",
                        marginBottom: 5,
                      }}
                    >
                      {role(t)}
                    </span>
                    <div className="txt">{t.text}</div>
                  </div>
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
            Compliance<span className="meta">not enforced</span>
          </div>
          <div className="pb">
            <div style={{ font: "var(--type-body-sm)" }}>
              <div className="fnt">- Calling window, not checked</div>
              <div className="fnt">- Suppression list, not checked</div>
              <div className="fnt">- Consent record, not checked</div>
            </div>
            <p
              style={{
                font: "var(--type-body-sm)",
                color: "var(--warning)",
                margin: "12px 0 0",
              }}
            >
              This starter has no compliance gate. Nothing here checks consent, a
              suppression list, or the local calling window, and it will dial
              whoever you point it at. You are the caller of record and the
              liability is yours.
            </p>
          </div>

          <div
            className="ph"
            style={{ borderTop: "1px solid var(--border-default)" }}
          >
            Stack<span className="meta">as reported by the agent</span>
          </div>
          <div className="pb">
            <KV k="Agent">
              {call.agent_name ?? <Dash />}
              {call.business_name ? ` · ${call.business_name}` : null}
            </KV>
            <KV k="Channel">
              {call.channel === "sip" ? "Phone · SIP" : "Web · WebRTC"}
            </KV>
            <KV k="STT / LLM">
              {stack?.stt ?? <Dash />}
              {" · "}
              {stack?.llm ?? <Dash />}
            </KV>
            <KV k="TTS">{stack?.tts ?? <Dash />}</KV>
          </div>

          <div
            className="ph"
            style={{ borderTop: "1px solid var(--border-default)" }}
          >
            Quality<span className="meta">not measured</span>
          </div>
          <div className="pb" style={{ flex: 1 }}>
            <KV k="STT p50 / p99">
              <Dash />
            </KV>
            <KV k="LLM time to first token">
              <Dash />
            </KV>
            <KV k="TTS time to first byte">
              <Dash />
            </KV>
            <p
              className="mut"
              style={{ font: "var(--type-body-sm)", margin: "12px 0 10px" }}
            >
              Latency is not measured here. The agent reports what was said and
              when, not how long each leg of the pipeline took.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
