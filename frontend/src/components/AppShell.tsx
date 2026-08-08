import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet } from "react-router";
import { listAgents, listCalls } from "../api";
import { Rail } from "./Rail";
import { LiveEventsBar } from "./ds";

// The console frame. The rail carries per-section counts, each page owns its own
// topbar, and the footer is a live pulse rather than a static byline.
//
// Everything is wrapped in .sv-console so the ported stylesheet's element rules
// cannot reach the vendored LiveKit and shadcn components used by the test call.
export function AppShell() {
  const [callCount, setCallCount] = useState<number | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [ticks, setTicks] = useState<number[]>([]);

  useEffect(() => {
    let live = true;
    listCalls({ limit: 24 })
      .then((r) => {
        if (!live) return;
        setCallCount(r.total);
        setTicks(r.calls.map((c) => c.turn_count).reverse());
      })
      .catch(() => undefined);
    // The rail renders an agents count. Fetch it, rather than leaving the
    // prop permanently undefined and the chip permanently invisible.
    listAgents()
      .then((r) => live && setAgentCount(r.agents.length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="sv-console fr">
      <Rail counts={{ calls: callCount, agents: agentCount }} />
      <div className="cv">
        <div className="bd">
          <Outlet />
        </div>
        <footer className="ftr">
          <div style={{ flex: 1, minWidth: 0 }}>
            {ticks.length > 0 ? (
              <LiveEventsBar ticks={ticks} label="Live events" compact />
            ) : (
              // No ticks yet: either the backend has not answered or there are
              // no recent calls to count turns from. Eight zero bars would draw
              // a flat line that reads as measured silence, so say "no data".
              <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                <span className="lb" style={{ flex: "none" }}>
                  Live events
                </span>
                <span className="fnt" style={{ font: "var(--type-body-sm)" }}>
                  no data
                </span>
              </div>
            )}
          </div>
          <Link to="/calls" className="btn sm" style={{ flex: "none" }}>
            View all →
          </Link>
          <span className="num fnt" style={{ font: "var(--type-caption)", flex: "none" }}>
            {callCount == null ? "no calls recorded yet" : `${callCount.toLocaleString()} calls recorded`}
          </span>
        </footer>
      </div>
    </div>
  );
}

/** The one upsell in the console: book a call, not a checkout page. */
export const UPGRADE_URL = "https://cal.com/mahimairaja/shipvoice";

/**
 * Page header. Optional back link, title, status badge, a meta line, then
 * right-aligned actions, and always the Upgrade button last.
 *
 * It lives here rather than on each page so there is exactly one of it, in one
 * place, on every screen.
 */
export function TopBar({
  back,
  title,
  badge,
  meta,
  actions,
}: {
  back?: { to: string; label: string };
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="top">
      {back && (
        <Link to={back.to} className="fnt" style={{ font: "var(--type-body-sm)" }}>
          ← {back.label}
        </Link>
      )}
      <h1>{title}</h1>
      {badge}
      {meta && (
        <span className="num" style={{ font: "var(--type-caption)", color: "var(--text-muted)" }}>
          {meta}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {actions}
      <a className="btn p sm upgrade" href={UPGRADE_URL} target="_blank" rel="noreferrer noopener">
        Upgrade
      </a>
    </header>
  );
}

/** The accent-coloured annotation the console uses to explain itself. */
export function Ann({ children }: { children: ReactNode }) {
  return <div className="ann">↳ {children}</div>;
}
