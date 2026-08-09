// Display formatters.
//
// These live outside components/ds.tsx because eslint's react-refresh rule
// requires a module to export only components. ShipVoice Pro keeps them in its
// ds module; Pro has no eslint, free lints everything.

export function money(value: number | null | undefined): string {
  if (value == null) return "-";
  return `$${value.toFixed(2)}`;
}

/**
 * utf-8 byte length.
 *
 * The prompt cap is a byte cap, not a character cap, so a curly quote or an
 * emoji costs more than the character count suggests. The fallback runs where
 * TextEncoder is missing, and counts the same way the encoder does.
 */
export function utf8Bytes(text: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(text).length;
  }
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
