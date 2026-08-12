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

type Item = {
  label: string;
  to?: string;
  count?: number | null;
  inactive?: boolean;
};
type Group = { title: string; items: Item[] };

export function Rail({
  counts = {},
  deployment = "this deployment",
}: {
  counts?: Record<string, number | null>;
  deployment?: string;
}) {
  const groups: Group[] = [
    {
      title: "Watch",
      items: [
        { label: "Overview", to: "/" },
        { label: "Calls", to: "/calls", count: counts.calls ?? null },
      ],
    },
    {
      // Designed in the reference console, with no backend in this starter.
      // Shown so the shape of the product is visible, inert because there is
      // nothing behind them.
      title: "Run",
      items: [
        { label: "Campaigns", inactive: true },
        { label: "Channels", inactive: true },
        { label: "Customers", inactive: true },
      ],
    },
    {
      title: "Build",
      items: [
        { label: "Agents", to: "/agents", count: counts.agents ?? null },
        { label: "Evaluations", inactive: true },
      ],
    },
  ];

  return (
    <aside className="rail">
      <div className="brand">
        <img src={MARK} alt="" width={20} height={20} />
        <span>ShipVoice</span>
      </div>

      <div className="scroll">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="sec">{group.title}</div>
            <nav aria-label={group.title}>
              {group.items.map((item) =>
                item.inactive ? (
                  <span
                    key={item.label}
                    className="pro-item"
                    aria-disabled="true"
                    data-testid="nav-inactive"
                  >
                    {item.label}
                  </span>
                ) : (
                  <NavLink
                    key={item.label}
                    to={item.to as string}
                    end={item.to === "/"}
                    className={({ isActive }) => (isActive ? "on" : "")}
                  >
                    {item.label}
                    {item.count != null && (
                      <span className="ct num">
                        {item.count.toLocaleString()}
                      </span>
                    )}
                  </NavLink>
                ),
              )}
            </nav>
          </div>
        ))}
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
