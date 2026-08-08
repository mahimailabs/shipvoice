import { NavLink } from "react-router";

// Three groups, matching the ShipVoice Pro console: Watch what happened, Run
// what is dialling, Build what dials next. Settings is not a nav item; it lives
// in the footer under the deployment identity.
//
// Four items are ShipVoice Pro surfaces. They are shown so the shape of the
// full product is visible, and they are inert: grey, no link, no route. There
// is nothing behind them in this repo, so making them clickable would only
// lead somewhere that exists to sell you something.
type Item = { label: string; to?: string; count?: number | null; pro?: boolean };
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
      title: "Run",
      items: [
        { label: "Campaigns", pro: true },
        { label: "Channels", pro: true },
        { label: "Customers", pro: true },
      ],
    },
    {
      title: "Build",
      items: [
        { label: "Agents", to: "/agents", count: counts.agents ?? null },
        { label: "Evaluations", pro: true },
      ],
    },
  ];

  return (
    <aside className="rail">
      <div className="brand">
        <img src="/logo-boat.svg" alt="" width={20} height={20} />
        <span>ShipVoice</span>
      </div>

      <div className="scroll">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="sec">{group.title}</div>
            <nav aria-label={group.title}>
              {group.items.map((item) =>
                item.pro ? (
                  <span key={item.label} className="pro-item" aria-disabled="true">
                    {item.label}
                    <span className="nav-pro" data-testid="nav-pro">
                      Pro
                    </span>
                  </span>
                ) : (
                  <NavLink
                    key={item.label}
                    to={item.to as string}
                    end={item.to === "/"}
                    className={({ isActive }) => (isActive ? "on" : "")}
                  >
                    {item.label}
                    {item.count != null && <span className="ct num">{item.count.toLocaleString()}</span>}
                  </NavLink>
                ),
              )}
            </nav>
          </div>
        ))}
      </div>

      <div className="foot">
        <NavLink to="/settings" className="who">
          <span className="av" aria-hidden="true">
            {deployment.slice(0, 1).toUpperCase()}
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", font: "var(--type-body-sm)" }}>{deployment}</span>
            <span className="fnt" style={{ display: "block", font: "var(--type-caption)" }}>
              Settings
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  );
}
