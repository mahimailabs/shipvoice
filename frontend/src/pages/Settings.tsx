import { useEffect, useState, type ReactNode } from "react";
import { API_BASE, ApiError, getSummary, listAgents } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, Panel } from "../components/ds";
import type { AgentSummary } from "../types";

// One page, stacked, mostly a mirror. Every row names the env var or the file
// that owns it, and the console writes nothing here. There are no inputs on
// this page on purpose: a form that saved a value the worker reads from its
// own process environment would be a lie the moment the worker restarted.
//
// The rule that shapes every row: say what you can observe, and say plainly
// when you cannot. No green "configured" badge for a value the browser never
// sees, no zero standing in for an unknown.

/**
 * One mirrored value. A value the console cannot read renders a dash on a
 * '.na' cell, never a zero and never a plausible-looking default.
 */
function Row({ k, v, owner }: { k: string; v: ReactNode; owner: string }) {
  const missing = v == null || v === "";
  return (
    <tr>
      <td className="fnt" style={{ width: 190 }}>
        {k}
      </td>
      <td className={missing ? "na" : "pri"}>{missing ? "-" : v}</td>
      <td className="fnt num" style={{ textAlign: "right" }}>
        {owner}
      </td>
    </tr>
  );
}

/**
 * The honest answers to "is the backend there": reachable, plus the four ways
 * the probe can fail. Collapsing these into a boolean sends people off to
 * restart Docker when the real fix is to make their account a superuser.
 */
type Reach = "checking" | "ok" | "unreachable" | "forbidden" | "missing" | "refused";

const REACH_TEXT: Record<Reach, string> = {
  checking: "Checking...",
  ok: "Reachable, and it answered the call summary",
  unreachable: "No answer, or it returned a server error",
  forbidden: "Reachable, but this account is not a superuser",
  missing: "Reachable, but the call slice is not wired on this checkout",
  refused: "Reachable, but it refused the request",
};

function classify(err: unknown): Reach {
  if (!(err instanceof ApiError)) return "refused";
  if (err.isUnreachable) return "unreachable";
  if (err.isForbidden) return "forbidden";
  if (err.isMissing) return "missing";
  return "refused";
}

const NOTE_STYLE = { font: "var(--type-body-sm)", margin: 0, color: "var(--text-secondary)" };

export function Settings() {
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [reach, setReach] = useState<Reach>("checking");

  useEffect(() => {
    let live = true;

    // Identity comes from the agents endpoint, which reads the deployment's
    // own config. Reachability is probed separately so a 403 on one does not
    // get reported as the backend being down.
    listAgents()
      .then((r) => live && setAgent(r.agents[0] ?? null))
      .catch(() => undefined);

    getSummary()
      .then(() => live && setReach("ok"))
      .catch((e: unknown) => live && setReach(classify(e)));

    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <TopBar
        title="Settings"
        badge={<Badge tone="neutral">Deployment-wide</Badge>}
        actions={
          <Button
            size="sm"
            disabled
            title="Not built: the console has no clipboard export of the values on this page."
          >
            Copy .env
          </Button>
        }
      />

      <div className="pad">
        <Panel title="Agent" meta="one worker, one agent" flush>
          <div className="scrollx">
            <table className="tb">
              <tbody>
                <Row k="Agent name" v={agent?.agent_name} owner="AGENT_NAME" />
                <Row k="Business name" v={agent?.business_name} owner="BUSINESS_NAME" />
                <Row
                  k="Dispatch name"
                  v={import.meta.env.VITE_AGENT_NAME}
                  owner="VITE_AGENT_NAME"
                />
                <Row
                  k="Prompt"
                  v="One string, formatted with the agent name at construction"
                  owner="agent/src/prompts/instructions.py"
                />
              </tbody>
            </table>
          </div>
          <div className="pb" style={{ borderTop: "1px solid var(--border-default)" }}>
            <p style={NOTE_STYLE}>
              The dispatch name is the one baked into this build; the agent name is the one the
              backend reports. They must be identical strings. If they differ, LiveKit never
              dispatches the worker and the call connects to silence with no error anywhere.
            </p>
          </div>
        </Panel>

        <Panel title="Providers" meta="declared in the worker, not observed" flush>
          <div className="scrollx">
            <table className="tb">
              <tbody>
                <Row k="STT" v="deepgram nova-3" owner="agent/src/agent.py:63" />
                <Row k="LLM" v="openai gpt-4.1-mini" owner="agent/src/agent.py:64" />
                <Row k="TTS" v="cartesia, plugin default" owner="agent/src/agent.py:65" />
                <Row
                  k="Keys"
                  v="Read straight from the environment by the plugins. Never sent to this console."
                  owner="OPENAI_API_KEY, DEEPGRAM_API_KEY, CARTESIA_API_KEY"
                />
              </tbody>
            </table>
          </div>
          <div className="pb" style={{ borderTop: "1px solid var(--border-default)" }}>
            <p style={NOTE_STYLE}>
              These are what the worker file declares, not a live reading. The session is built with
              them as constants and the backend cannot see the agent process, so nothing here proves
              which models a running worker actually loaded. The Cartesia call passes no model, so
              the plugin default applies: naming one here would be a guess.
            </p>
          </div>
        </Panel>

        <Panel title="Access" meta="who gets in, and how far" flush>
          <div className="scrollx">
            <table className="tb">
              <tbody>
                <Row
                  k="This console"
                  v="No sign-in. Whoever can open it can read it."
                  owner="frontend/src/App.tsx"
                />
                <Row
                  k="Registration"
                  v="Closed by default. This console cannot read the deployed value."
                  owner="ALLOW_OPEN_REGISTRATION"
                />
                <Row
                  k="Account API"
                  v="Bearer token, and listing accounts needs a superuser"
                  owner="backend/src/api/deps.py"
                />
              </tbody>
            </table>
          </div>
          <div className="pb" style={{ borderTop: "1px solid var(--border-default)" }}>
            <p style={NOTE_STYLE}>
              No sign-in is the right trade on your own machine and the wrong one on a public
              address. Everything this console reads, an anonymous visitor reads too, including call
              transcripts once the call log is wired. The backend still ships a JWT user slice with a
              superuser flag, so gating it is adding a dependency to the routes, not building auth
              from nothing.
            </p>
          </div>
        </Panel>

        <Panel title="Deployment" meta={API_BASE} flush>
          <div className="scrollx">
            <table className="tb">
              <tbody>
                <Row k="Backend" v={REACH_TEXT[reach]} owner="VITE_API_BASE_URL" />
                <Row
                  k="Console origin"
                  v={window.location.origin}
                  owner="CORS_ORIGINS_STR"
                />
              </tbody>
            </table>
          </div>
          <div className="pb" style={{ borderTop: "1px solid var(--border-default)" }}>
            <p style={NOTE_STYLE}>
              Reachability is one request to the call summary, run when this page loaded. It is not
              a health monitor and it does not re-poll. If the origin above is missing from the
              backend's allowed list, the browser blocks the request before the backend ever sees
              it, and that reads here as no answer.
            </p>
          </div>
        </Panel>

        <Panel title={<span style={{ color: "var(--warning)" }}>Compliance</span>} meta="read this one">
          <p style={NOTE_STYLE}>
            This starter has no compliance gate. Nothing in it checks consent, a suppression list,
            or the local calling window, and it will dial whoever you point it at. There is no
            setting on this page that changes that, because there is no code behind one. You are the
            caller of record and the liability is yours.
          </p>
        </Panel>

        <Ann>
          Every row names the env var or file that owns it. The console reads; the terminal writes.
          Changing a value here means editing the file it points at.
        </Ann>
      </div>
    </>
  );
}
