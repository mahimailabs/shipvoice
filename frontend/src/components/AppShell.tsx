import { useEffect, useState, type ReactNode } from "react";
import { Link, Outlet } from "react-router";
import { getLiveKit, listAgents } from "../api";
import { Rail } from "./Rail";

// The console frame. The rail carries per-section counts, each page owns its own
// topbar, and the footer is a live pulse rather than a static byline.
//
// Everything is wrapped in .sv-console so the ported stylesheet's element rules
// cannot reach the vendored LiveKit and shadcn components used by the test call.
export function AppShell() {
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    listAgents()
      .then((r) => {
        if (!live) return;
        setAgentCount(r.agents.length);
        setReachable(true);
      })
      .catch(() => live && setReachable(false));
    getLiveKit()
      .then((v) => live && setProject(v.url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="sv-console fr">
      <Rail counts={{ agents: agentCount }} />
      <div className="cv">
        <div className="bd">
          <Outlet />
        </div>
        <footer className="ftr">
          <span className="lb" style={{ flex: "none" }}>
            LiveKit
          </span>
          <span className="fnt num" style={{ font: "var(--type-caption)", minWidth: 0 }}>
            {project ?? "not set"}
          </span>
          <div style={{ flex: 1 }} />
          <Link to="/deployment" className="btn sm" style={{ flex: "none" }}>
            Deployment
          </Link>
          <span className="num fnt" style={{ font: "var(--type-caption)", flex: "none" }}>
            {reachable == null
              ? "checking the backend"
              : reachable
                ? "backend reachable"
                : "backend not reachable"}
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
        <Link
          to={back.to}
          className="fnt"
          style={{ font: "var(--type-body-sm)" }}
        >
          ← {back.label}
        </Link>
      )}
      <h1>{title}</h1>
      {badge}
      {meta && (
        <span
          className="num"
          style={{ font: "var(--type-caption)", color: "var(--text-muted)" }}
        >
          {meta}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {actions}
      <a
        className="btn p sm upgrade"
        href={UPGRADE_URL}
        target="_blank"
        rel="noreferrer noopener"
      >
        Upgrade
      </a>
    </header>
  );
}

/** The accent-coloured annotation the console uses to explain itself. */
export function Ann({ children }: { children: ReactNode }) {
  return <div className="ann">↳ {children}</div>;
}
