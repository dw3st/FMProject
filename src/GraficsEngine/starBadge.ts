import type { Graphics } from "pixi.js";
import type { StarKind } from "@/Domain/world/stars";

/**
 * The star badge on a special player's marker (tester report, option A of the mock, 8.8.10): a dark coin with a
 * two-tone rim and a faceted star, at the marker's top-left (the card sits top-right). Gold = world top 25, blue = in
 * form, green = prodigy (`computeStars`). Vector, so it stays sharp at any size.
 */
export const STAR_BADGE = {
  /** Centre, in marker radii from the marker's centre. */
  X: -0.74,
  Y: -0.8,
  /** Coin radius, in marker radii. */
  R: 0.4,
  COIN: 0x080a10,
  COLORS: {
    gold: { hi: 0xffd65c, lo: 0xd6961c },
    blue: { hi: 0x76baff, lo: 0x3474e2 },
    green: { hi: 0x70e28c, lo: 0x269c56 },
  } satisfies Record<StarKind, { hi: number; lo: number }>,
} as const;

/** The ten points of a five-pointed star (outer and inner radius alternating), first point straight up. */
export function starPoints(cx: number, cy: number, r: number, inner = 0.47): { x: number; y: number }[] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * inner;
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
  });
}

/** Halfway between two colours (the facet of each point that faces away from the light). */
export function mixColor(a: number, b: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  return [16, 8, 0].reduce((acc, s) => acc | (Math.round((ch(a, s) + ch(b, s)) / 2) << s), 0);
}

/** Draws the badge for `kind` into `g` (cleared first), sized for a marker of radius `markerR`; null = nothing. */
export function drawStarBadge(g: Graphics, markerR: number, kind: StarKind | null): void {
  g.clear();
  if (!kind) return;
  const { hi, lo } = STAR_BADGE.COLORS[kind];
  const r = markerR * STAR_BADGE.R;
  g.circle(0, 0, r).fill({ color: STAR_BADGE.COIN, alpha: 0.94 });
  const rim = Math.max(1, r * 0.16);
  g.circle(0, 0, r - rim / 2).stroke({ width: rim, color: lo });
  // The lit part of the rim, on top.
  const a0 = Math.PI * 1.1, a1 = Math.PI * 1.9;
  g.moveTo(Math.cos(a0) * (r - rim / 2), Math.sin(a0) * (r - rim / 2))
    .arc(0, 0, r - rim / 2, a0, a1).stroke({ width: rim, color: hi });
  const sr = r * 0.66;
  g.poly(starPoints(0, sr * 0.08, sr * 1.04)).fill({ color: 0x000000, alpha: 0.55 });
  const pts = starPoints(0, 0, sr);
  g.poly(pts).fill(lo);
  // Bevel: each point lit on one side, half-lit on the other.
  const mid = mixColor(hi, lo);
  for (let i = 0; i < 10; i += 2) {
    const tip = pts[i]!, before = pts[(i + 9) % 10]!, after = pts[(i + 1) % 10]!;
    g.poly([{ x: 0, y: 0 }, before, tip]).fill(hi);
    g.poly([{ x: 0, y: 0 }, tip, after]).fill(mid);
  }
  g.poly(pts).stroke({ width: Math.max(0.6, r * 0.05), color: 0x140f08, alpha: 0.8 });
}
