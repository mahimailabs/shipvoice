import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { ApiError, getAgentPrompt, putAgentPrompt } from "../api";
import { Badge, Button } from "./ds";
import { utf8Bytes } from "../lib/format";
import type { AgentPromptRead } from "../types";

// The system prompt, editable in place.
//
// The prompt is a file on disk and stays one: this dialog reads that file and
// writes it back, and there is no draft, no revision, and nothing to publish.
// The worker builds the agent once per call and reads the file as it does, so a
// save is live on the next call without restarting anything. That sentence is
// the most useful thing this screen can say, so it says it after every save.

const TITLE_ID = "prompt-dialog-title";

// Everything in the dialog that can hold focus. Used only to wrap Tab at the
// ends, so the list does not need to be filtered for visibility.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

function reason(err: unknown, fallback: string): string {
  // The backend's own sentence, when there is one: a refused write names the
  // flag, and a failed write names the path and the mount.
  return err instanceof ApiError && err.message ? err.message : fallback;
}

export function PromptDialog({
  slug,
  path,
  onClose,
  returnFocusTo,
}: {
  slug: string;
  /** The path the row already showed, so the title is right before the fetch. */
  path: string;
  onClose: () => void;
  /** The control that opened this. Focus goes back to it on close. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const [prompt, setPrompt] = useState<AgentPromptRead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // What is in the textarea right now, readable synchronously. save() compares
  // against it to tell "nothing changed while the PUT ran" from "they kept
  // typing", which a state variable captured in a closure cannot answer.
  const latestText = useRef("");
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let live = true;
    getAgentPrompt(slug)
      .then((p) => {
        if (!live) return;
        setPrompt(p);
        setText(p.content);
        latestText.current = p.content;
      })
      .catch((e: unknown) => {
        if (!live) return;
        setLoadError(
          reason(e, "Could not load the prompt. The backend did not answer."),
        );
      });
    return () => {
      live = false;
    };
  }, [slug, reloads]);

  // The textarea is the dialog, so it takes focus immediately rather than
  // waiting for the fetch. Body scroll is locked for as long as this is open,
  // and focus goes back to whatever opened it.
  useEffect(() => {
    // Read before the textarea takes focus, and hold it: the trigger is mounted
    // for as long as this dialog is, so it is the same node either way.
    const trigger =
      returnFocusTo?.current ?? (document.activeElement as HTMLElement | null);
    // '.bd' is the scroller, not the body: AppShell's frame is
    // 'height: 100vh; overflow: hidden' (console.css), so locking the body locks
    // an element that never scrolled and the page keeps moving under the dialog.
    const scroller = document.querySelector<HTMLElement>(".bd");
    const previousOverflow = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";
    areaRef.current?.focus();
    return () => {
      if (scroller) scroller.style.overflow = previousOverflow;
      trigger?.focus?.();
    };
  }, [returnFocusTo]);

  const dirty = prompt != null && text !== prompt.content;
  const bytes = utf8Bytes(text);
  const maxBytes = prompt?.max_bytes ?? 0;
  const overCap = prompt != null && bytes > maxBytes;
  const editable = prompt?.editable === true;
  const canSave = editable && dirty && !saving && !overCap;

  const requestClose = useCallback((): void => {
    if (dirty) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }, [dirty, onClose]);

  const save = useCallback(async (): Promise<void> => {
    if (!canSave) return;
    // The exact bytes this save is for. The textarea stays live while the PUT
    // is in flight, and people keep typing while a spinner runs.
    const submitted = text;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const next = await putAgentPrompt(slug, submitted);
      setPrompt(next);
      // Take the response back as the new baseline only when nothing was typed
      // while the PUT was in flight: the backend normalises line endings and the
      // trailing newline, so the dirty flag has to track disk rather than what
      // was typed. Adopting it unconditionally would wipe those later keystrokes
      // off the screen with no undo entry (React sets node.value directly, which
      // clears the field's native undo stack) and then report success for text
      // the user no longer has.
      if (latestText.current === submitted) {
        setText(next.content);
        latestText.current = next.content;
        setSaved(true);
      }
      setConfirmingClose(false);
    } catch (e: unknown) {
      setSaveError(reason(e, "Save failed. The backend did not answer."));
    } finally {
      setSaving(false);
    }
  }, [canSave, slug, text]);

  // Escape and the save shortcut are bound to the window, not to the dialog, so
  // they still work after a click on the overlay has taken focus off it.
  // Tab is trapped here, on the window, for the same reason Escape is: focus
  // does not always sit inside the dialog. Dismissing the close-confirm unmounts
  // the button holding focus, and pressing on the scrim blurs the textarea onto
  // body. A handler bound to the dialog's own onKeyDown never sees the keydown
  // in either state, and Tab then walks into the rail behind the scrim, where
  // one Enter routes away and takes the unsaved prompt with it.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void save();
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (active == null || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose, save]);

  // The dialog's own close paths ask before dropping edits. A reload, a tab
  // close, or the browser Back button never reach them, so they get the only
  // warning the browser allows.
  useEffect(() => {
    if (!dirty) return;
    function warn(e: BeforeUnloadEvent): void {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function onOverlayMouseDown(e: ReactMouseEvent<HTMLDivElement>): void {
    // Only a press that starts on the overlay itself. A selection dragged out
    // of the textarea also releases out here, and that is not a click-outside.
    if (e.target === e.currentTarget) requestClose();
  }

  const displayPath = prompt?.path ?? path;

  return (
    <div className="dlg-scrim" onMouseDown={onOverlayMouseDown}>
      <div
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={dialogRef}
      >
        <header className="ph">
          <span id={TITLE_ID} style={{ fontFamily: "var(--font-mono)" }}>
            {displayPath}
          </span>
          <span className="meta">
            {loadError
              ? "not loaded"
              : prompt == null
                ? "loading"
                : !prompt.exists
                  ? "not on disk yet"
                  : editable
                    ? "the file the agent reads"
                    : "read only"}
          </span>
          <span className="row">
            <Button size="sm" variant="ghost" onClick={requestClose}>
              Close
            </Button>
          </span>
        </header>

        <div className="dlg-bd">
          {loadError && (
            <div className="banner bad" role="alert">
              <Badge tone="violation">not loaded</Badge>
              <span>{loadError}</span>
              <Button
                size="sm"
                onClick={() => {
                  setLoadError(null);
                  setReloads((n) => n + 1);
                }}
              >
                Retry
              </Button>
            </div>
          )}

          {prompt != null && !prompt.exists && (
            <div className="banner" role="note">
              <Badge tone="warning">not on disk</Badge>
              <span>
                {displayPath} does not exist yet, so the agent is running the
                default prompt packaged with it. Saving here writes the file for
                the first time.
              </span>
            </div>
          )}

          <textarea
            ref={areaRef}
            className="dlg-ta"
            aria-label="System prompt"
            aria-describedby={
              prompt != null && !editable ? "prompt-dialog-readonly" : undefined
            }
            spellCheck={false}
            readOnly={!editable}
            placeholder={
              loadError != null
                ? "The prompt could not be loaded."
                : prompt == null
                  ? "Loading the prompt"
                  : "Write the agent's system prompt here."
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              latestText.current = e.target.value;
              setSaved(false);
              setSaveError(null);
            }}
          />
        </div>

        <div className="dlg-ft">
          <div className="row" style={{ gap: 12 }}>
            <span className="num fnt" style={{ font: "var(--type-caption)" }}>
              {loadError != null
                ? "not loaded"
                : prompt == null
                  ? "reading the file"
                  : `${bytes.toLocaleString()} of ${maxBytes.toLocaleString()} bytes`}
            </span>
            {dirty && (
              <span className="mut" style={{ font: "var(--type-caption)" }}>
                unsaved
              </span>
            )}
            {editable && (
              <span className="fnt" style={{ font: "var(--type-caption)" }}>
                Cmd+Enter, or Ctrl+Enter, saves
              </span>
            )}
          </div>

          {overCap && (
            <div className="banner bad" role="alert">
              <Badge tone="violation">too long</Badge>
              <span>
                This is {bytes.toLocaleString()} bytes and the cap is{" "}
                {maxBytes.toLocaleString()}. Cut it back before saving: the
                backend refuses anything over the cap.
              </span>
            </div>
          )}

          {prompt?.warnings.map((w) => (
            <div className="banner" role="note" key={w}>
              <Badge tone="warning">note</Badge>
              <span>{w}</span>
            </div>
          ))}

          {saveError && (
            <div className="banner bad" role="alert">
              <Badge tone="violation">save failed</Badge>
              <span>{saveError}</span>
            </div>
          )}

          {saved && !dirty && (
            <div className="banner good" role="status">
              <Badge tone="success">saved</Badge>
              <span>
                Written to {displayPath}. The next call picks it up. The worker
                reads this file each time it builds the agent for a call, so it
                does not need a restart.
              </span>
            </div>
          )}

          {!editable && prompt != null && (
            <div className="banner" role="note" id="prompt-dialog-readonly">
              <Badge tone="warning">read only</Badge>
              <span>
                {prompt.read_only_reason ??
                  "This deployment does not allow the console to write the prompt file."}
              </span>
            </div>
          )}

          {confirmingClose ? (
            <div className="banner" role="alert">
              <Badge tone="warning">unsaved changes</Badge>
              <div>
                <p style={{ margin: 0, font: "var(--type-body-sm)" }}>
                  These edits are not on disk. Closing now throws them away and
                  the agent keeps the prompt it already has.
                </p>
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <Button size="sm" variant="danger" onClick={onClose}>
                    Discard and close
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingClose(false)}
                  >
                    Keep editing
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              {editable && (
                <button
                  type="button"
                  className="btn p sm"
                  disabled={!canSave}
                  onClick={() => void save()}
                >
                  {saving ? "Saving" : "Save"}
                </button>
              )}
              <Button size="sm" variant="ghost" onClick={requestClose}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
