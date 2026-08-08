import { NavLink } from "react-router";

// Three groups, matching the ShipVoice Pro console: Watch what happened, Run
// what is dialling, Build what dials next. Settings is not a nav item; it lives
// in the footer under the deployment identity.
//
// Four items are locked. They are ShipVoice Pro surfaces that Pro has designed
// and not yet backed, so they are previews, not a paywall: the route still
// opens and says plainly what is and is not there. The features actually worth
// paying for are locked in place on the live pages instead, via LockedBlock.
type Item = { label: string; to: string; count?: number | null; locked?: boolean };
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
        { label: "Campaigns", to: "/campaigns", locked: true },
        { label: "Channels", to: "/channels", locked: true },
        { label: "Customers", to: "/customers", locked: true },
      ],
    },
    {
      title: "Build",
      items: [
        { label: "Agents", to: "/agents", count: counts.agents ?? null },
        { label: "Evaluations", to: "/evaluations", locked: true },
      ],
    },
  ];

  return (
    <aside className="rail">
      <div className="brand">
        <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 13h14l-2.2 4H5.2L3 13Z" fill="var(--sv-accent)" />
          <path d="M10 2 6.5 11h7L10 2Z" fill="var(--text-primary)" />
        </svg>
        <span>ShipVoice</span>
      </div>

      <div className="scroll">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="sec">{group.title}</div>
            <nav aria-label={group.title}>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    [isActive ? "on" : "", item.locked ? "lkd" : ""].filter(Boolean).join(" ")
                  }
                >
                  {item.label}
                  {item.locked && (
                    <span className="nav-lock" data-testid="nav-lock" title="ShipVoice Pro">
                      Pro
                    </span>
                  )}
                  {!item.locked && item.count != null && (
                    <span className="ct num">{item.count.toLocaleString()}</span>
                  )}
                </NavLink>
              ))}
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
