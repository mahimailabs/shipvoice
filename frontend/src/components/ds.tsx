import type { CSSProperties, ReactNode } from "react";

export type Tone =
  "neutral" | "success" | "warning" | "danger" | "violation" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "",
  success: "ok",
  warning: "wn",
  danger: "bad",
  violation: "vio",
  accent: "acc",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const cls = TONE_CLASS[tone];
  return <span className={cls ? `bg ${cls}` : "bg"}>{children}</span>;
}

export function Button({
  variant = "secondary",
  size = "md",
  onClick,
  disabled,
  title,
  children,
}: {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const v =
    variant === "primary"
      ? "p"
      : variant === "ghost"
        ? "g"
        : variant === "danger"
          ? "d"
          : "";
  const classes = ["btn", v, size === "sm" ? "sm" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  meta,
  actions,
  flush,
  children,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="pnl">
      {(title || meta || actions) && (
        <header className="ph">
          {title}
          {meta && <span className="meta">{meta}</span>}
          {actions && (
            <span className={meta ? "row" : "meta row"}>{actions}</span>
          )}
        </header>
      )}
      {flush ? children : <div className="pb">{children}</div>}
    </section>
  );
}

export function Stat({
  value,
  label,
  hint,
  tone,
}: {
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: "success";
}) {
  return (
    <div className="stat">
      <b className={tone === "success" ? "ok" : undefined}>{value}</b>
      <i>{label}</i>
      {hint && <u>{hint}</u>}
    </div>
  );
}

/** Segmented progress meter. Segments render left to right in order. */
export function Meter({
  segments,
}: {
  segments: { pct: number; color: string; title?: string }[];
}) {
  return (
    <div className="mtr">
      {segments.map((s, i) => (
        <s
          key={i}
          style={{
            width: `${Math.max(0, Math.min(100, s.pct))}%`,
            background: s.color,
          }}
          title={s.title}
        />
      ))}
    </div>
  );
}

/**
 * Dotted line chart. Pure SVG, no dependency.
 * Renders a polyline plus a dot per point, with horizontal grid ticks.
 */
export function DottedLineChart({
  points,
  height = 132,
  yTicks = 3,
  label,
  showAxis,
  xLabels,
}: {
  points: number[];
  height?: number;
  yTicks?: number;
  label?: string;
  showAxis?: boolean;
  xLabels?: string[];
}) {
  const w = 100;
  const pad = 6;
  if (points.length === 0) {
    return <div className="empty">No data yet.</div>;
  }
  const max = Math.max(...points, 0.0001);
  const min = 0;
  const span = max - min || 1;
  const x = (i: number): number =>
    points.length === 1
      ? w / 2
      : (i / (points.length - 1)) * (w - pad * 2) + pad;
  const y = (v: number): number =>
    height - pad - ((v - min) / span) * (height - pad * 2);
  const path = points.map((p, i) => `${x(i)},${y(p)}`).join(" ");
  const ticks = Array.from(
    { length: yTicks },
    (_, i) => (i / (yTicks - 1)) * (height - pad * 2) + pad,
  );
  // Axis values run top to bottom, so the first tick is the maximum.
  const tickValues = Array.from(
    { length: yTicks },
    (_, i) => max - (i / (yTicks - 1)) * span,
  );

  const svg = (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      role="img"
      aria-label={label ?? "trend"}
    >
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={0}
          y1={t}
          x2={w}
          y2={t}
          stroke="var(--chart-grid)"
          strokeWidth={0.4}
          strokeDasharray="1 2"
        />
      ))}
      <polyline
        points={path}
        fill="none"
        stroke="var(--sv-chart-1)"
        strokeWidth={1}
        strokeDasharray="3 2"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((p, i) => (
        <rect
          key={i}
          x={x(i) - 0.8}
          y={y(p) - 0.8}
          width={1.6}
          height={1.6}
          fill="var(--chart-dot)"
        />
      ))}
    </svg>
  );

  if (!showAxis) return svg;

  const axisStyle: CSSProperties = {
    width: 34,
    flex: "none",
    height,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    font: "var(--type-caption)",
    textAlign: "right",
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <div className="num fnt" style={axisStyle}>
          {/* One decision for the whole axis, from its top value. Deciding per
              tick prints a percent axis as 91 / 46 / 0.00. */}
          {tickValues.map((v, i) => (
            <span key={i}>{max >= 10 ? Math.round(v) : v.toFixed(2)}</span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{svg}</div>
      </div>
      {xLabels && xLabels.length > 0 && (
        <div
          className="num fnt"
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginLeft: 42,
            marginTop: 6,
            font: "var(--type-caption)",
          }}
        >
          {xLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Live events bar: one tick per recent event, most recent on the right. */
export function LiveEventsBar({
  ticks,
  label = "Live events",
  compact,
}: {
  ticks: number[];
  label?: string;
  compact?: boolean;
}) {
  const max = Math.max(...ticks, 1);
  const bars = (
    <div
      style={{
        display: "flex",
        gap: 2,
        alignItems: "flex-end",
        height: compact ? 18 : 34,
        flex: 1,
      }}
    >
      {ticks.map((t, i) => (
        <span
          key={i}
          title={`${t}`}
          style={{
            // Fixed width, not flex: one tick used to stretch into a solid
            // slab across the whole footer, which reads as an alarm rather
            // than as a single call.
            flex: "0 0 3px",
            height: `${Math.max(6, (t / max) * 100)}%`,
            background: t === 0 ? "var(--chart-track)" : "var(--sv-chart-2)",
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
        <span className="lb" style={{ flex: "none" }}>
          {label}
        </span>
        {bars}
      </div>
    );
  }

  return (
    <div>
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 6 }}
      >
        <span className="lb">{label}</span>
        <span className="fnt num" style={{ font: "var(--type-caption)" }}>
          {ticks.reduce((a, b) => a + b, 0)} in window
        </span>
      </div>
      {bars}
    </div>
  );
}

export function LegendGrid({
  items,
  columns = 1,
}: {
  items: { label: string; value: string; color?: string }[];
  columns?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
        gap: 8,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className="row"
          style={{ justifyContent: "space-between", gap: 8 }}
        >
          <span className="row" style={{ gap: 6, minWidth: 0 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: it.color ?? "var(--sv-chart-1)",
                flex: "none",
              }}
            />
            <span className="mut" style={{ font: "var(--type-caption)" }}>
              {it.label}
            </span>
          </span>
          <span className="num" style={{ font: "var(--type-caption)" }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Key/value row used across detail pages. */
export function KV({
  k,
  children,
  mono,
}: {
  k: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={mono ? "v mono" : "v"}>{children}</span>
    </div>
  );
}

/**
 * A surface that is designed but not yet backed by the runtime.
 * Never render a plausible-looking empty state for one of these: say so.
 */
export function PlannedNotice({ what }: { what: string }) {
  return (
    <div className="banner planned" role="note">
      <Badge tone="accent">planned</Badge>
      <span>{what}</span>
    </div>
  );
}
