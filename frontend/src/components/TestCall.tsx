import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  useAgent,
  useSession,
  useSessionMessages,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { AgentAudioVisualizerWave } from "@/components/agents-ui/agent-audio-visualizer-wave";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { useInputControls } from "@/hooks/agents-ui/use-agent-control-bar";
import { AGENT_NAME, tokenSource } from "@/lib/token-source";
import { listAgents } from "../api";
import type { AgentSummary } from "../types";
import { Ann, TopBar } from "./AppShell";
import { Badge, Button, Panel } from "./ds";

// The test call, as a screen rather than a panel.
//
// The reference design puts a version selector, a live latency readout and a
// cost figure beside the call. This repo has none of the three: it runs one
// configuration, it does not time a turn, and it does not price a minute. So
// the right column says what it does know and then says, once, that the other
// two are not measured. It never draws a dashed latency row, because a row with
// a unit on it implies a reading was attempted.

const NO_JOIN_MS = 10_000;

const MONO = { fontFamily: "var(--font-mono)", color: "var(--text-primary)" };

function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The live mm:ss in the topbar. It mounts only once the room is connected, so
 * the moment of connection is its own start, and it shares that origin with the
 * transcript stamps below.
 */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return <>{mmss(now - since)}</>;
}

/**
 * True once a call has been up for ten seconds with nothing on the other end.
 * Keyed on the run so a previous timeout never fires over a fresh call.
 */
function useNoJoinTimeout(runId: number | null, agentJoined: boolean): boolean {
  const [expiredRun, setExpiredRun] = useState<number | null>(null);

  useEffect(() => {
    if (runId == null || agentJoined) return;
    const timer = window.setTimeout(() => setExpiredRun(runId), NO_JOIN_MS);
    return () => window.clearTimeout(timer);
  }, [runId, agentJoined]);

  return runId != null && expiredRun === runId && !agentJoined;
}

function NoAgentWarning() {
  return (
    <div
      className="banner bad"
      role="alert"
      style={{ alignItems: "flex-start" }}
    >
      <Badge tone="violation">no agent</Badge>
      <span>
        Nothing joined this room in 10 seconds. LiveKit matches the agent name
        as an exact string, and a mismatch fails silently: valid token, open
        room, no error on either side.
        <br />
        This browser dispatched <span style={MONO}>{AGENT_NAME}</span>, from
        VITE_AGENT_NAME in frontend/.env.
        <br />
        Compare that with AGENT_NAME in agent/.env, the name the worker
        registers under. The two must match exactly, character for character.
      </span>
    </div>
  );
}

/**
 * Everything that needs the live session: the wave, the mic controls and the
 * transcript. It sits under AgentSessionProvider so the LiveKit hooks resolve.
 */
function CallSurface({
  connected,
  connecting,
  startedAt,
  error,
  onStart,
}: {
  connected: boolean;
  connecting: boolean;
  startedAt: number | null;
  error: string | null;
  onStart: () => void;
}) {
  const { state, microphoneTrack: agentTrack, isConnected: agentJoined } =
    useAgent();
  const { messages } = useSessionMessages();
  const { microphoneToggle } = useInputControls();
  const timedOut = useNoJoinTimeout(startedAt, agentJoined);

  const muted = !microphoneToggle.enabled;

  return (
    <div
      className="pb"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* The reference puts a staged-version picker here. This repo runs one
          configuration, so there is nothing to pick between. */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <span className="lb">Running against</span>
        <span className="fnt" style={{ font: "var(--type-caption)" }}>
          the configuration this worker is running right now. There is one, so
          there is nothing staged to try out ahead of it.
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          border: "1px solid var(--border-default)",
          background: "var(--surface-raised)",
          borderRadius: "var(--sv-radius-md)",
        }}
      >
        <div
          title={
            connected
              ? muted
                ? "Your microphone is muted"
                : "Your microphone is open"
              : "Your microphone is used only while the call is connected"
          }
          style={{
            width: 38,
            height: 38,
            flex: "none",
            borderRadius: "var(--radius-full)",
            background: muted ? "var(--surface-selected)" : "var(--accent-quiet)",
            color: muted ? "var(--text-faint)" : "var(--accent-quiet-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: "var(--type-label)",
          }}
        >
          MIC
        </div>

        {/* The wave reads the agent's own track, so it draws what you are
            hearing rather than what you are saying. Size stays 'sm': the
            component is square, and 'lg' is a 224px block that turns this
            strip into a slab. */}
        <AgentAudioVisualizerWave
          size="sm"
          state={state}
          audioTrack={agentTrack}
          color="#e5323f"
        />

        <div style={{ flex: 1 }} />

        <Button
          size="sm"
          disabled={!connected || microphoneToggle.pending}
          title={
            connected
              ? undefined
              : "Nothing to mute: the test call has not started."
          }
          onClick={() => void microphoneToggle.toggle()}
        >
          {connected && muted ? "Unmute" : "Mute"}
        </Button>
      </div>

      {timedOut && <NoAgentWarning />}

      {error && (
        <div className="banner bad" role="alert">
          <Badge tone="violation">error</Badge>
          <span>{error}</span>
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {!connected ? (
          <p className="fnt" style={{ font: "var(--type-body-sm)", margin: 0 }}>
            Talk to the agent from this browser. Your microphone is used only
            while the call is connected, and the call runs through the same
            LiveKit room a real caller would land in.
          </p>
        ) : messages.length === 0 ? (
          <p className="fnt" style={{ font: "var(--type-body-sm)", margin: 0 }}>
            Connected. Nothing has been said yet: speak, or wait for the agent
            to open.
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 14 }}>
              <span
                className="num"
                style={{
                  font: "var(--type-caption)",
                  color: "var(--text-faint)",
                  width: 38,
                  flex: "none",
                  paddingTop: 2,
                }}
              >
                {startedAt == null ? "-" : mmss(m.timestamp - startedAt)}
              </span>
              <div style={{ minWidth: 0 }}>
                <span className="lb">
                  {m.from?.isLocal === true ? "You" : "Agent"}
                </span>
                <div
                  style={{
                    font: "var(--type-body)",
                    color: "var(--text-primary)",
                    marginTop: 3,
                  }}
                >
                  {m.message}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* The reference's other footer actions save an eval scenario and apply a
          staged config. This repo has neither, and a disabled button for a
          feature that does not exist reads as broken rather than absent. The
          greyed Evaluations rail item is where that absence is stated. */}
      <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
        {!connected && (
          <Button variant="primary" onClick={onStart} disabled={connecting}>
            {connecting ? "Connecting…" : "Start test call"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A provider string the backend did not report. Never a zero, never a guess. */
function ProviderRow({ k, value }: { k: string; value: string | null }) {
  return (
    <tr>
      <td className="fnt">{k}</td>
      {value ? (
        <td className="pri">{value}</td>
      ) : (
        <td className="na" title="The backend did not report this provider.">
          -
        </td>
      )}
    </tr>
  );
}

export function TestCall() {
  const { slug } = useParams<{ slug: string }>();
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dispatch name comes from the frontend env, never from the agent row:
  // the row is what the backend declares, and dispatch is what this browser
  // actually asks LiveKit for. Keeping them separate is what makes a mismatch
  // visible instead of hidden behind a shared variable.
  const session = useSession(tokenSource, { agentName: AGENT_NAME });
  const connected = session.isConnected;

  // Stamped when the room actually connects, not when the button was pressed,
  // so the timer and the transcript both count from the same moment. It doubles
  // as the run id: a second test call gets a new one.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const runId = connected ? startedAt : null;

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  // Leaving the screen ends the call. Otherwise navigating away leaves an open
  // room with a live microphone in it.
  useEffect(() => {
    return () => {
      void sessionRef.current.end().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let live = true;
    listAgents()
      .then((r) => live && setAgents(r.agents))
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const start = (): void => {
    setError(null);
    void session
      .start()
      .then(() => setStartedAt(Date.now()))
      .catch((e: unknown) => {
        setError(
          e instanceof Error
            ? `Could not start the call: ${e.message}`
            : "Could not start the call.",
        );
      });
  };

  const end = (): void => {
    setStartedAt(null);
    void session.end().catch(() => undefined);
  };

  if (loadFailed) {
    return (
      <div className="pad">
        <div className="banner bad" role="alert">
          <Badge tone="violation">API unreachable</Badge>
          <span>
            Could not load this agent, so a test call cannot be dispatched from
            here. An agent already running is unaffected.
          </span>
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
              This deployment does not run one under that name, so there is
              nothing to place a test call to.
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

  return (
    <AgentSessionProvider session={session}>
      <TopBar
        back={{ to: "/agents", label: "Agents" }}
        title={agent.agent_name}
        badge={
          <Badge tone="accent">
            Test call
            {runId != null && (
              <>
                {" · "}
                <Elapsed since={runId} />
              </>
            )}
          </Badge>
        }
        actions={
          <Button
            variant="danger"
            size="sm"
            disabled={!connected}
            title={
              connected
                ? undefined
                : "Nothing to end: the test call has not started."
            }
            onClick={end}
          >
            End test
          </Button>
        }
      />

      <div
        style={{ display: "flex", flex: 1, minHeight: 0, flexWrap: "wrap" }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 360,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border-default)",
          }}
        >
          <div className="ph">
            Test call
            <span className="meta">browser, not billed, not metered</span>
          </div>
          <CallSurface
            connected={connected}
            connecting={session.connectionState === ConnectionState.Connecting}
            startedAt={runId}
            error={error}
            onStart={start}
          />
        </div>

        <aside
          style={{ width: 420, flex: "none", display: "flex", flexDirection: "column" }}
        >
          <div className="ph">
            This test
            <span className="meta">what you are hearing</span>
          </div>
          <table className="tb">
            <tbody>
              <tr>
                <td className="fnt">Agent</td>
                <td className="pri">{agent.agent_name}</td>
              </tr>
              <ProviderRow k="STT" value={agent.stt} />
              <ProviderRow k="LLM" value={agent.llm} />
              <ProviderRow k="TTS" value={agent.tts} />
              <tr>
                <td className="fnt">Channel</td>
                <td className="pri">Web</td>
              </tr>
            </tbody>
          </table>
          <div className="pb" style={{ flex: 1 }}>
            <p
              className="fnt"
              style={{ font: "var(--type-caption)", margin: 0 }}
            >
              Latency and cost are not measured here. This console records what
              was said on a call, not how long a turn took or what a minute
              cost, so there is no figure to show for either.
            </p>
            <div style={{ marginTop: 16 }}>
              <Ann>
                A test call runs on your own provider keys and your own LiveKit
                project. It is a real call to the same worker a caller reaches,
                and nothing here bills it to anyone.
              </Ann>
            </div>
          </div>
        </aside>
      </div>
    </AgentSessionProvider>
  );
}
