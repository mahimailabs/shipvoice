import type { ReactNode } from "react";

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
