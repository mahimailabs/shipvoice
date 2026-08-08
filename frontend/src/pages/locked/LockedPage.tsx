// The shared frame for the four locked routes.
//
// These are ShipVoice Pro surfaces that Pro has DESIGNED and NOT BACKED: in the
// Pro repo each of these four pages opens with a comment saying its figures are
// the design's sample data and the surface has no backend. So they are roadmap
// previews, not a paywall, and this page must never imply that paying turns one
// of them on, because paying does not. A buyer who catches one overclaim stops
// believing the locks that are real.
//
// The locks that ARE real live on the working pages, via LockedBlock, over
// things Pro has actually shipped: per-call cost metered by provider, the
// cost / billed / kept receipt, per-minute metered billing, generating and
// validating an agent from one sentence, compliance gates that fail closed.
//
// No sample rows, no invented stat strip, no screenshot: there is nothing
// truthful to show yet, and an empty table would read as a broken feature
// rather than an unbuilt one.
import { TopBar } from "../../components/AppShell";
import { Badge, PRO_URL } from "../../components/ds";

export function LockedPage({ title, sentence }: { title: string; sentence: string }) {
  return (
    <>
      <TopBar
        title={title}
        badge={<Badge tone="accent">ShipVoice Pro</Badge>}
        meta="roadmap preview"
      />
      <div style={{ padding: "var(--pad-frame)", maxWidth: 620 }}>
        <p
          style={{
            margin: 0,
            font: "var(--type-body)",
            lineHeight: "var(--lh-relaxed)",
            color: "var(--text-secondary)",
          }}
        >
          {sentence}
        </p>
        <p style={{ margin: "var(--space-8) 0 0", font: "var(--type-body-sm)" }}>
          <a href={PRO_URL} target="_blank" rel="noreferrer noopener">
            What ShipVoice Pro ships today: shipvoice.dev
          </a>
        </p>
      </div>
    </>
  );
}
