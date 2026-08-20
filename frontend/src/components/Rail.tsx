import { NavLink } from "react-router";

/**
 * The mark, resolved against wherever this bundle is served from.
 *
 * It lives in public/, so Vite copies it verbatim and does not rewrite the
 * reference the way it rewrites an imported asset. A bare "/logo-boat.svg"
 * therefore 404s in any build with a base, which is what the /demo preview is.
 * BASE_URL is "/" for the normal build and carries its own trailing slash.
 */
const MARK = `${import.meta.env.BASE_URL}logo-boat.svg`;

type Item = { label: string; to: string; count?: number | null };

export function Rail({
  counts = {},
  deployment = "this deployment",
}: {
  counts?: Record<string, number | null>;
  deployment?: string;
}) {
  // Every entry here is a page this repo serves. A boilerplate has no module
  // behind a campaigns tab, so there is no campaigns tab, greyed out or
  // otherwise. The section headings went with those entries: three links do
  // not need filing under two titles, and a heading called Build would name
  // something that happens in an editor rather than in here.
  const items: Item[] = [
    { label: "Overview", to: "/" },
    { label: "Calls", to: "/calls", count: counts.calls ?? null },
    { label: "Agents", to: "/agents", count: counts.agents ?? null },
  ];

  return (
    <aside className="rail">
      <div className="brand">
        <img src={MARK} alt="" width={20} height={20} />
        <span>ShipVoice</span>
      </div>

      <div className="scroll">
        <nav aria-label="Console">
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => (isActive ? "on" : "")}
            >
              {item.label}
              {item.count != null && (
                <span className="ct num">{item.count.toLocaleString()}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="foot">
        <NavLink to="/deployment" className="who">
          <span className="av" aria-hidden="true">
            {deployment.slice(0, 1).toUpperCase()}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", font: "var(--type-body-sm)" }}>
              {deployment}
            </span>
            <span
              className="fnt"
              style={{ display: "block", font: "var(--type-caption)" }}
            >
              Deployment
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  );
}
