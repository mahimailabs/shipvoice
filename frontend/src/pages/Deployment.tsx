import { useEffect, useState } from "react";
import { ApiError, getLiveKit, saveLiveKit } from "../api";
import { Ann, TopBar } from "../components/AppShell";
import { Badge, Button, Panel } from "../components/ds";
import type { LiveKitRead } from "../types";

// Two things: the LiveKit project this deployment talks to, and the compliance
// position. Nothing about the agent lives here, that belongs to the agent.
//
// The credentials are stored in the database, seeded once from the environment,
// so a change made here survives a restart. The worker reads them from the
// backend too and restarts itself when they change, which is the only way an
// edit here can reach the process that actually places calls.
//
// The secret is write-only: this backend has no authentication, so an endpoint
// that handed it back would hand your LiveKit project to anyone who can reach
// the port.

type Save = "idle" | "saving" | "saved" | "error";

export function Deployment() {
  const [lk, setLk] = useState<LiveKitRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [save, setSave] = useState<Save>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

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

  function startEditing(): void {
    setConfirming(false);
    setUrl(lk?.url ?? "");
    setApiKey("");
    setApiSecret("");
    setSave("idle");
    setSaveError(null);
    setEditing(true);
  }

  async function submit(): Promise<void> {
    setSave("saving");
    setSaveError(null);
    try {
      const next = await saveLiveKit({
        url: url.trim(),
        api_key: apiKey.trim(),
        // Blank means keep whatever is stored.
        api_secret: apiSecret.trim() || undefined,
      });
      setLk(next);
      setSave("saved");
      setEditing(false);
      setConfirming(false);
    } catch (e: unknown) {
      setSave("error");
      setSaveError(
        e instanceof ApiError && e.isForbidden
          ? "Editing is only allowed when the backend runs with ENV=dev. Set these in the environment and restart."
          : "Save failed. Check the URL starts with wss:// and the key is not blank.",
      );
    }
  }

  const canSave = url.trim().length > 0 && apiKey.trim().length > 0 && save !== "saving";

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
        meta={lk?.source === "database" ? "stored" : lk ? "from the environment" : undefined}
      />

      <div className="pad">
        <Panel
          title="LiveKit"
          meta={editing ? "the secret is never shown" : "the project this deployment calls"}
          actions={
            editing || confirming ? undefined : (
              <Button size="sm" onClick={() => setConfirming(true)}>
                Edit
              </Button>
            )
          }
        >
          {loadError && <p className="na">{loadError}</p>}

          {!loadError && confirming && (
            <div className="banner planned" role="alertdialog">
              <Badge tone="warning">heads up</Badge>
              <div>
                <p style={{ margin: 0, font: "var(--type-body-sm)" }}>
                  Saving a new project restarts the voice worker so it connects to it. Any call in
                  progress finishes first, but the worker is unavailable for a few seconds while it
                  comes back, and calls that arrive in that window are missed.
                </p>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn p sm" onClick={startEditing}>
                    Edit anyway
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!loadError && !editing && !confirming && (
            <div className="kvs">
              <div className="kv">
                <span className="k">Project URL</span>
                <span className="v mono">{lk?.url ?? <span className="na">-</span>}</span>
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
              <p className="mut" style={{ font: "var(--type-caption)", margin: "8px 0 0" }}>
                {lk?.source === "database"
                  ? "Stored here. The environment seeded it once and is no longer read."
                  : "Read from the environment. It will be stored the first time you save."}
              </p>
            </div>
          )}

          {!loadError && editing && (
            <form
              className="kvs"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label className="fld">
                <span className="lb">Project URL</span>
                <input
                  className="in"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="wss://your-project.livekit.cloud"
                  autoComplete="off"
                />
              </label>
              <label className="fld">
                <span className="lb">API key</span>
                <input
                  className="in"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={lk?.api_key_hint ?? "APIxxxxxxxx"}
                  autoComplete="off"
                />
              </label>
              <label className="fld">
                <span className="lb">API secret</span>
                <input
                  className="in"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder={lk?.secret_set ? "leave blank to keep the stored one" : "required"}
                  autoComplete="off"
                />
              </label>

              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <button type="submit" className="btn p sm" disabled={!canSave}>
                  {save === "saving" ? "Saving" : "Save"}
                </button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>

              {saveError && (
                <p role="alert" className="na" style={{ margin: 0 }}>
                  {saveError}
                </p>
              )}
            </form>
          )}
        </Panel>

        <Panel
          title={<span style={{ color: "var(--warning)" }}>Compliance</span>}
          meta="read this one"
        >
          <p style={{ margin: 0, font: "var(--type-body-sm)", lineHeight: "var(--lh-relaxed)" }}>
            This starter has no compliance gate. Nothing in it checks consent, a suppression list,
            or the local calling window, and it will dial whoever you point it at. There is no
            setting on this page that changes that, because there is no code behind one. You are the
            caller of record and the liability is yours.
          </p>
        </Panel>

        {save === "saved" && (
          <p className="mut" style={{ font: "var(--type-body-sm)", margin: "0 0 12px" }}>
            Saved. The worker checks for this and restarts itself within about fifteen seconds. If
            you run it by hand rather than under Docker or Fly, start it again yourself.
          </p>
        )}

        <Ann>
          The worker takes its LiveKit project from here, not from its own environment, so a change
          reaches the process placing calls instead of silently disagreeing with it. The secret is
          write-only: this backend has no sign-in, so nothing usable as a credential is ever sent
          back to the browser.
        </Ann>
      </div>
    </>
  );
}
