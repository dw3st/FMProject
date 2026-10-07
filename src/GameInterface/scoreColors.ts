/**
 * Centralized 0–10 rating colors (overall avg, stat values, badges).
 * Use everywhere a numeric player score is shown so scout, squad, dashboard, and player page match.
 *
 * Tiers: below 4 gray · 5–5.99 muted · 6 light blue · 7 blue · 8 light green · 9+ primary (no red).
 */

function clamp10(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(10, Math.max(0, value));
}

/**
 * Pill/badge: background + text + border (e.g. avg in tables).
 */
export function ratingBadgeClasses10(value: number): string {
  const v = clamp10(value);
  if (v >= 9) return "bg-primary/20 text-primary border-primary/50";
  if (v >= 8) return "bg-emerald-400/15 text-emerald-300 border-emerald-400/45";
  if (v >= 7) return "bg-blue-500/20 text-blue-400 border-blue-500/50";
  if (v >= 6) return "bg-sky-500/15 text-sky-300 border-sky-500/45";
  if (v >= 5) return "bg-muted text-muted-foreground border-border";
  return "bg-muted/40 text-muted-foreground/90 border-border/80";
}

/**
 * Text-only colour for bare numbers (formation lineup, match preview ratings, table cells).
 */
export function ratingTextClass10(value: number): string {
  const v = clamp10(value);
  if (v >= 9) return "text-primary";
  if (v >= 8) return "text-emerald-300";
  if (v >= 7) return "text-blue-400";
  if (v >= 6) return "text-sky-300";
  if (v >= 5) return "text-muted-foreground";
  return "text-muted-foreground/80";
}

/**
 * Horizontal stat bar fill inside attribute rows (PlayerCard).
 */
export function ratingBarFillClass10(value: number): string {
  const v = clamp10(value);
  if (v >= 9) return "bg-primary";
  if (v >= 8) return "bg-emerald-400";
  if (v >= 7) return "bg-blue-500";
  if (v >= 6) return "bg-sky-400";
  if (v >= 5) return "bg-muted-foreground/50";
  return "bg-muted-foreground/35";
}

/**
 * SVG stroke for the circular avg ring (PlayerCard).
 */
export function ratingRingStrokeHex10(value: number): string {
  const v = clamp10(value);
  if (v >= 9) return "var(--primary)";
  if (v >= 8) return "#6ee7b7";
  if (v >= 7) return "#60a5fa";
  if (v >= 6) return "#7dd3fc";
  if (v >= 5) return "#a1a1aa";
  return "#9ca3af";
}


export type AttributeBand = "red" | "orange" | "yellow" | "green" | "blue";

/** Band of an attribute's display value (0..100). The overall keeps the rating colours above. */
export function attributeBand(display: number): AttributeBand {
  if (display >= 85) return "blue";
  if (display >= 70) return "green";
  if (display >= 55) return "yellow";
  if (display >= 40) return "orange";
  return "red";
}

const BAND_TEXT: Record<AttributeBand, string> = {
  red: "text-red-400",
  orange: "text-orange-400",
  yellow: "text-yellow-300",
  green: "text-emerald-400",
  blue: "text-sky-400",
};
const BAND_BAR: Record<AttributeBand, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-yellow-400",
  green: "bg-emerald-500",
  blue: "bg-sky-500",
};

/** Text colour of an attribute's display value (0..100). */
export function attributeTextClass(display: number): string {
  return BAND_TEXT[attributeBand(display)];
}

/** Bar fill colour of an attribute's display value (0..100). */
export function attributeBarClass(display: number): string {
  return BAND_BAR[attributeBand(display)];
}
