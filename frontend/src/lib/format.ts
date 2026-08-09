// Display formatters.
//
// These live outside components/ds.tsx because eslint's react-refresh rule
// requires a module to export only components. ShipVoice Pro keeps them in its
// ds module; Pro has no eslint, free lints everything.

export function money(value: number | null | undefined): string {
  if (value == null) return "-";
  return `$${value.toFixed(2)}`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
