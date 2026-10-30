/**
 * Kit clash (tester report): when the two shirts look alike, the away side changes to its second kit,
 * which must differ from the home shirt too; when neither club colour works, a contrasting kit.
 */

/** Redmean distance at and above which two shirts read as different on the pitch (0..~765). */
export const KIT_CLASH_DISTANCE = 250;

/** Change kits used when no club colour of the away side differs enough (no pitch greens). */
export const CHANGE_KITS = ["#ffffff", "#111111", "#facc15", "#1d4ed8", "#dc2626", "#7c3aed", "#f97316", "#0ea5e9"] as const;

function rgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "Redmean" colour distance: cheap, close to how far apart two colours look. Unreadable hex = 0. */
export function kitDistance(a: string, b: string): number {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return 0;
  const rm = (x[0] + y[0]) / 2;
  const dr = x[0] - y[0], dg = x[1] - y[1], db = x[2] - y[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function kitsClash(a: string, b: string): boolean {
  return kitDistance(a, b) < KIT_CLASH_DISTANCE;
}

export interface MatchKits {
  home: string;
  away: string;
  /** "primary" = away keeps its shirt, "second" = one of its other club colours, "change" = a contrasting kit. */
  awayKit: "primary" | "second" | "change";
}

/**
 * Home keeps its first colour. Away keeps its first colour unless it clashes with the home shirt, then
 * takes the first of its other colours that doesn't, else the change kit farthest from the home shirt.
 */
export function resolveMatchKits(homeColors: readonly string[], awayColors: readonly string[], fallback = { home: "#2d6cdf", away: "#df3b2d" }): MatchKits {
  const valid = (cs: readonly string[]) => cs.filter((c) => typeof c === "string" && rgb(c) !== null);
  const home = valid(homeColors)[0] ?? fallback.home;
  const away = valid(awayColors);
  const primary = away[0] ?? fallback.away;
  if (!kitsClash(home, primary)) return { home, away: primary, awayKit: "primary" };
  const second = away.slice(1).find((c) => !kitsClash(home, c));
  if (second) return { home, away: second, awayKit: "second" };
  let best: string = CHANGE_KITS[0];
  for (const c of CHANGE_KITS) if (kitDistance(home, c) > kitDistance(home, best)) best = c;
  return { home, away: best, awayKit: "change" };
}
