/** The classic machine: 3 reels, 1 line (the middle row), 20 stops per reel. */
export type ClassicSymbol = "seven" | "bar" | "bell" | "lemon" | "cherry" | "blank";

/** Reel strip, the same on the three reels: 7×1, BAR×2, bell×3, lemon×5, cherry×4, blank×5. */
export const CLASSIC_STRIP: readonly ClassicSymbol[] = [
  "seven", "blank", "lemon", "cherry", "bell", "blank", "lemon", "bar", "cherry", "blank",
  "lemon", "bell", "cherry", "blank", "lemon", "bar", "bell", "cherry", "blank", "lemon",
];

/** Three of a kind pays the stake × this. */
export const CLASSIC_PAYS: Partial<Record<ClassicSymbol, number>> = { seven: 500, bar: 200, bell: 60, lemon: 14, cherry: 20 };
/** Cherry on reels 1 and 2 (the third not a cherry). */
export const CLASSIC_TWO_CHERRIES = 3;

/** Multiplier of the stake for the symbols on the line. */
export function classicPay(line: readonly ClassicSymbol[]): number {
  const [a, b, c] = line;
  if (a === b && b === c) return CLASSIC_PAYS[a!] ?? 0;
  if (a === "cherry" && b === "cherry") return CLASSIC_TWO_CHERRIES;
  return 0;
}

/** Symbol shown at `row` (−1 above, 0 the line, +1 below) of a reel stopped at `stop`. */
export function classicAt(stop: number, row: number): ClassicSymbol {
  const n = CLASSIC_STRIP.length;
  return CLASSIC_STRIP[(((stop + row) % n) + n) % n]!;
}

export interface ClassicSpin {
  stops: [number, number, number];
  multiplier: number;
}

export function spinClassic(rng: () => number): ClassicSpin {
  const n = CLASSIC_STRIP.length;
  const stops = [0, 1, 2].map(() => Math.floor(rng() * n)) as [number, number, number];
  return { stops, multiplier: classicPay(stops.map((s) => classicAt(s, 0))) };
}

/** Exact return to player: every one of the 20³ stop combinations. */
export function classicRtp(): number {
  const n = CLASSIC_STRIP.length;
  let sum = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) sum += classicPay([CLASSIC_STRIP[a]!, CLASSIC_STRIP[b]!, CLASSIC_STRIP[c]!]);
  return sum / n ** 3;
}
