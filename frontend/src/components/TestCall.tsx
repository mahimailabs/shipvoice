// Talk to this deployment's agent from the console.
//
// This is deliberately NOT a port of the ShipVoice Pro test call. Pro drives
// LiveKitRoom + BarVisualizer; this repo already vendors LiveKit's Agents UI
// and the pre-console App.tsx connected through it, verified against a live
// LiveKit project. So the connection path here is exactly that one:
// 'tokenSource' plus useSession(tokenSource, { agentName }), wrapped in
// AgentSessionProvider. Nothing new is invented.
//
// The one addition Pro does not have is the no-join timeout below.
import { useEffect, useState } from "react";
import {
  useAgent,
  useSession,
  useSessionContext,
  useSessionMessages,
} from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { AgentAudioVisualizerBar } from "@/components/agents-ui/agent-audio-visualizer-bar";
import { AgentChatTranscript } from "@/components/agents-ui/agent-chat-transcript";
import { AgentControlBar } from "@/components/agents-ui/agent-control-bar";
import { AgentSessionProvider } from "@/components/agents-ui/agent-session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AGENT_NAME, tokenSource } from "@/lib/token-source";
import { Badge, Button } from "./ds";

/**
 * How long the room may stay empty before the console says so.
 *
 * LiveKit dispatch matches the agent name as an exact string. When it does not
 * match, nothing errors: the token is valid, the room opens, the browser sits
 * in "connecting" forever and the logs are clean on both sides. Ten seconds is
 * long enough for a cold worker to accept the job and short enough that the
 * silence gets explained instead of debugged.
 */
const NO_JOIN_MS = 10_000;

const MONO = { fontFamily: "var(--font-mono)", color: "var(--text-primary)" };

/**
 * True once the room has been open for NO_JOIN_MS with no agent in it.
 *
 * The flag is only ever set, never cleared: an agent that joins late clears the
 * warning through the returned expression instead, and the next call clears it
 * by remounting, since this component only exists while a call is connected.
 */
function useNoJoinTimeout(agentJoined: boolean): boolean {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (agentJoined) return;
    const timer = window.setTimeout(() => setExpired(true), NO_JOIN_MS);
    return () => window.clearTimeout(timer);
  }, [agentJoined]);

  return expired && !agentJoined;
}

/** The name mismatch, named. Both values are printed, not described. */
function NoAgentWarning() {
  return (
    <div className="banner bad" role="alert" style={{ alignItems: "flex-start" }}>
      <Badge tone="violation">no agent</Badge>
      <span>
        Nothing joined this room in 10 seconds. LiveKit matches the agent name as an exact string,
        and a mismatch fails silently: valid token, open room, no error on either side.
        <br />
        This browser dispatched <span style={MONO}>{AGENT_NAME}</span>, from VITE_AGENT_NAME in
        frontend/.env.
        <br />
        Compare that with AGENT_NAME in agent/.env, the name the worker registers under. The two
        must match exactly, character for character.
      </span>
    </div>
  );
}

function LiveCall({ onEnd }: { onEnd: () => void }) {
  const { state, microphoneTrack, isConnected: agentJoined } = useAgent();
  const { messages } = useSessionMessages();
  const { isConnected } = useSessionContext();
  const timedOut = useNoJoinTimeout(agentJoined);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col items-center gap-2">
        <AgentAudioVisualizerBar
          state={state}
          audioTrack={microphoneTrack}
          barCount={5}
          size="sm"
        />
        <span className="mut num" style={{ font: "var(--type-caption)" }}>
          {state}
        </span>
      </div>

      {timedOut && <NoAgentWarning />}

      <AgentChatTranscript
        messages={messages}
        agentState={state}
        className="h-56 overflow-y-auto rounded-lg border p-3"
      />

      {/* Bundles the mic toggle, the text chat input, and the leave button. */}
      <AgentControlBar
        isConnected={isConnected}
        onDisconnect={onEnd}
        controls={{
          microphone: true,
          chat: true,
          leave: true,
          camera: false,
          screenShare: false,
        }}
      />
    </div>
  );
}

function StartCall({
  connecting,
  error,
  onStart,
}: {
  connecting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div className="pb">
      <p className="mut" style={{ font: "var(--type-body-sm)", margin: "0 0 12px" }}>
        Talk to the agent from this browser. Your microphone is used only while the call is
        connected, and the call runs through the same LiveKit room a real caller would land in.
      </p>
      <Button variant="primary" onClick={onStart} disabled={connecting}>
        {connecting ? "Connecting…" : "Start test call"}
      </Button>
      {error && (
        <div className="banner bad" role="alert" style={{ marginTop: 12 }}>
          <Badge tone="violation">error</Badge>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export function TestCall() {
  // The dispatch name comes from the frontend env, never from the agent row:
  // the row is what the backend declares, and dispatch is what this browser
  // actually asks LiveKit for. Keeping them separate is what makes a mismatch
  // visible instead of hidden behind a shared variable.
  const session = useSession(tokenSource, { agentName: AGENT_NAME });
  const [error, setError] = useState<string | null>(null);

  const start = (): void => {
    setError(null);
    void session.start().catch((e: unknown) => {
      setError(
        e instanceof Error
          ? `Could not start the call: ${e.message}`
          : "Could not start the call.",
      );
    });
  };

  return (
    <TooltipProvider>
      <AgentSessionProvider session={session}>
        {session.isConnected ? (
          <LiveCall onEnd={() => void session.end()} />
        ) : (
          <StartCall
            connecting={session.connectionState === ConnectionState.Connecting}
            error={error}
            onStart={start}
          />
        )}
      </AgentSessionProvider>
    </TooltipProvider>
  );
}
