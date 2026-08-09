import { NavLink } from "react-router";

type Item = {
  label: string;
  to?: string;
  count?: number | null;
  pro?: boolean;
};
type Group = { title: string; items: Item[] };

export function Rail({
  counts = {},
  deployment = "this deployment",
}: {
  counts?: Record<string, number | null>;
  deployment?: string;
}) {
  // Two sections: what this starter does, and what ShipVoice Pro adds.
  //
  // Calls sits under Pro because the call log genuinely is Pro. This repo
  // records nothing about a call once it ends, so a Calls page here could only
  // ever be an empty table pretending to be a feature.
  const groups: Group[] = [
    {
      title: "Build",
      items: [{ label: "Agents", to: "/", count: counts.agents ?? null }],
    },
    {
      title: "ShipVoice Pro",
      items: [
        { label: "Calls", pro: true },
        { label: "Campaigns", pro: true },
        { label: "Channels", pro: true },
        { label: "Customers", pro: true },
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
                  <span
                    key={item.label}
                    className="pro-item"
                    aria-disabled="true"
                  >
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
