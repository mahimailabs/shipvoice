import { useEffect, useState } from "react";
import { ApiError, getLiveKit } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Panel } from "../components/ds";
import type { LiveKitRead } from "../types";

// The deployment, as configured.
//
// A mirror, not a form. The LiveKit project comes from the environment the
// services booted with, so this page reads it back and says where to change it.
// The buyer is the operator: they own the .env file and the process, and a
// restart is how an edit to one reaches the other.

export function Deployment() {
  const [lk, setLk] = useState<LiveKitRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getLiveKit()
      .then((v) => live && setLk(v))
      .catch((e: unknown) => {
        if (!live) return;
        setLoadError(
          e instanceof ApiError && e.isMissing
            ? "This backend has no /api/v1/livekit route."
            : "Could not reach the backend.",
        );
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <TopBar
        title="Deployment"
        badge={
          lk == null ? undefined : (
            <Badge tone={lk.secret_set ? "success" : "warning"}>
              {lk.secret_set ? "LiveKit configured" : "LiveKit incomplete"}
            </Badge>
          )
        }
        meta={lk ? "from the environment" : undefined}
      />

      <div className="pad">
        <Panel title="LiveKit" meta="the project this deployment calls">
          {loadError && <p className="na">{loadError}</p>}

          {!loadError && (
            <div className="kvs">
              <div className="kv">
                <span className="k">Project URL</span>
                <span className="v mono">
                  {lk?.url ?? <span className="na">-</span>}
                </span>
              </div>
              <div className="kv">
                <span className="k">API key</span>
                <span className="v mono">
                  {lk?.api_key_hint ?? <span className="na">-</span>}
                </span>
              </div>
              <div className="kv">
                <span className="k">API secret</span>
                <span className="v">
                  {lk?.secret_set ? "Set" : <span className="na">Not set</span>}
                </span>
              </div>
              <p
                className="mut"
                style={{ font: "var(--type-caption)", margin: "8px 0 0" }}
              >
                Read from the environment. To point this deployment at another
                project, edit LIVEKIT_URL, LIVEKIT_API_KEY and
                LIVEKIT_API_SECRET in .env and restart the services.
              </p>
            </div>
          )}
        </Panel>

        <Panel
          title={<span style={{ color: "var(--warning)" }}>Compliance</span>}
          meta="read this one"
        >
          <p
            style={{
              margin: 0,
              font: "var(--type-body-sm)",
              lineHeight: "var(--lh-relaxed)",
            }}
          >
            This starter has no compliance gate. Nothing in it checks consent, a
            suppression list, or the local calling window, and it will dial
            whoever you point it at. There is no setting on this page that
            changes that, because there is no code behind one. You are the
            caller of record and the liability is yours.
          </p>
        </Panel>

        <Ann>
          Nothing on this page can be changed from here, and there is nowhere
          for a change to be stored: the environment is the record and the
          console only reads it. The secret never leaves the backend either,
          only whether one is set, so nothing usable as a credential reaches the
          browser.
        </Ann>
      </div>
    </>
  );
}
