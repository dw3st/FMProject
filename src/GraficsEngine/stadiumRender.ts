/**
 * Pixi drawing of the stadium band (spec 2026-10-08-match-visual §2): the stand, the concrete
 * walkways and every fan in one `Graphics`, baked by the caller into a single texture.
 */
import type { Graphics } from "pixi.js";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import { crowdSeats, seatCellPx, standConcreteRows, standSideRects, type CrowdInput, type CrowdSeat, type SideRect, standTunnel } from "@/GraficsEngine/crowd";
import { STADIUM } from "@/GraficsEngine/pitchStyle";
import type { DecorRect } from "@/GraficsEngine/stadiumDecor";
import { standFootprint } from "@/GraficsEngine/stadiumExtras";
import { SURROUND, surroundLayout } from "@/GraficsEngine/surroundings";

/** Light tone of the decorations (stripes, the flag's band). */
const DECOR_LIGHT = 0xf2f2f2;

/** Radius of a fan dot, as a fraction of the seat cell. */
const SEAT_DOT = 0.38;

/** Draws the stand band (outer − inner), its walkways, the fans and the edges into `g`. */
export function drawStand(g: Graphics, stand: StandGeometry, crowd: Omit<CrowdInput, "stand">): void {
  drawStandBase(g, stand, crowd.works);
  drawFans(g, stand, crowdSeats({ ...crowd, stand }));
  drawStandEdges(g, stand);
}

/** The empty stand: band, walkways and the stands under works (#137). */
export function drawStandBase(g: Graphics, stand: StandGeometry, worksSides?: CrowdInput["works"]): void {
  const { outer, inner } = stand;
  const innerR = inner.x + inner.w, innerB = inner.y + inner.h;
  g.rect(outer.x, outer.y, outer.w, inner.y - outer.y).fill(STADIUM.STAND_COLOR);
  g.rect(outer.x, innerB, outer.w, outer.y + outer.h - innerB).fill(STADIUM.STAND_COLOR);
  g.rect(outer.x, inner.y, inner.x - outer.x, inner.h).fill(STADIUM.STAND_COLOR);
  g.rect(innerR, inner.y, outer.x + outer.w - innerR, inner.h).fill(STADIUM.STAND_COLOR);
  drawStandDetails(g, stand, worksSides);
}

/**
 * Walkways, the tunnel and the stands under works, over the band. With the art pack's stand texture (art phase 9)
 * the walkways go lighter and the works keep only the hazard tape (the construction texture shows the site).
 */
export function drawStandDetails(g: Graphics, stand: StandGeometry, worksSides?: CrowdInput["works"], textured = false): void {
  for (const c of standConcreteRows(stand)) g.rect(c.x, c.y, c.w, c.h).fill({ color: STADIUM.CONCRETE, alpha: textured ? 0.55 : 1 });
  // The players' tunnel: a dark floor between two light walls, a little light at the mouth.
  const t = standTunnel(stand);
  if (t) {
    const wall = Math.max(1.5, t.w * 0.12);
    g.rect(t.x, t.y, t.w, t.h).fill(STADIUM.TUNNEL_FLOOR);
    g.rect(t.x, t.y, wall, t.h).fill(STADIUM.TUNNEL_WALL).rect(t.x + t.w - wall, t.y, wall, t.h).fill(STADIUM.TUNNEL_WALL);
    g.rect(t.x + wall, t.y, t.w - wall * 2, Math.min(t.h, wall * 2)).fill({ color: 0xffffff, alpha: 0.12 });
  }
  const works = new Set<string>(worksSides ?? []);
  for (const r of standSideRects(stand)) if (works.has(r.side)) drawWorks(g, r, seatCellPx(stand), textured);
}

/** Tile rotation of a stand texture (pitch side at the bottom of the tile) for each side of the band. */
export const STAND_TILE_ROTATION: Record<"top" | "bottom" | "left" | "right", number> = {
  top: 0, bottom: Math.PI, left: -Math.PI / 2, right: Math.PI / 2,
};

/** One dot per filled seat. */
export function drawFans(g: Graphics, stand: StandGeometry, seats: readonly CrowdSeat[]): void {
  const r = seatCellPx(stand) * SEAT_DOT;
  for (const s of seats) g.circle(s.x, s.y, r).fill(s.color);
}

/** Roof edge around the canvas and the advertising boards along the run-off. */
export function drawStandEdges(g: Graphics, stand: StandGeometry): void {
  const { outer, inner } = stand;
  g.rect(outer.x + 1, outer.y + 1, outer.w - 2, outer.h - 2).stroke({ width: 2, color: STADIUM.ROOF_EDGE });
  g.rect(inner.x, inner.y, inner.w, inner.h).stroke({ width: 1.5, color: 0xd9dde3, alpha: 0.35 });
}

/** Bounding box (px, padded by a dot) of a set of fans; null when there are none. */
export function fansBounds(stand: StandGeometry, seats: readonly CrowdSeat[]): { x: number; y: number; w: number; h: number } | null {
  if (seats.length === 0) return null;
  const pad = seatCellPx(stand);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of seats) {
    if (s.x < x0) x0 = s.x;
    if (s.y < y0) y0 = s.y;
    if (s.x > x1) x1 = s.x;
    if (s.y > y1) y1 = s.y;
  }
  const x = Math.floor(x0 - pad), y = Math.floor(y0 - pad);
  return { x, y, w: Math.ceil(x1 + pad) - x, h: Math.ceil(y1 + pad) - y };
}

/** Pieces of a stand under works: scaffolding grid and hazard tape along the pitch edge (#137). */
export function worksPieces(r: SideRect, cell: number): {
  scaffold: { x: number; y: number; w: number; h: number }[];
  tape: { x: number; y: number; w: number; h: number; dark: boolean }[];
} {
  const horizontal = r.side === "top" || r.side === "bottom";
  const step = cell * 4;
  const line = Math.max(1, cell * 0.25);
  const scaffold: { x: number; y: number; w: number; h: number }[] = [];
  // Uprights across the stand, and two horizontal ledgers.
  const length = horizontal ? r.w : r.h;
  for (let d = step / 2; d < length; d += step) {
    const t = Math.min(line, length - d);
    scaffold.push(horizontal ? { x: r.x + d, y: r.y, w: t, h: r.h } : { x: r.x, y: r.y + d, w: r.w, h: t });
  }
  for (const f of [1 / 3, 2 / 3]) {
    scaffold.push(horizontal ? { x: r.x, y: r.y + r.h * f, w: r.w, h: line } : { x: r.x + r.w * f, y: r.y, w: line, h: r.h });
  }
  // Hazard tape on the pitch side of the stand.
  const depth = Math.max(2, cell * 0.8);
  const tapeAt = (() => {
    switch (r.side) {
      case "top": return { x: r.x, y: r.y + r.h - depth };
      case "bottom": return { x: r.x, y: r.y };
      case "left": return { x: r.x + r.w - depth, y: r.y };
      case "right": return { x: r.x, y: r.y };
    }
  })();
  const tape: { x: number; y: number; w: number; h: number; dark: boolean }[] = [];
  const seg = cell * 2;
  for (let d = 0, i = 0; d < length; d += seg, i++) {
    const len = Math.min(seg, length - d);
    tape.push(horizontal
      ? { x: tapeAt.x + d, y: tapeAt.y, w: len, h: depth, dark: i % 2 === 1 }
      : { x: tapeAt.x, y: tapeAt.y + d, w: depth, h: len, dark: i % 2 === 1 });
  }
  return { scaffold, tape };
}

function drawWorks(g: Graphics, r: SideRect, cell: number, textured = false): void {
  const { scaffold, tape } = worksPieces(r, cell);
  if (!textured) {
    g.rect(r.x, r.y, r.w, r.h).fill(STADIUM.WORKS_BASE);
    for (const p of scaffold) g.rect(p.x, p.y, p.w, p.h).fill(STADIUM.WORKS_SCAFFOLD);
  }
  for (const p of tape) g.rect(p.x, p.y, p.w, p.h).fill(p.dark ? STADIUM.WORKS_TAPE_DARK : STADIUM.WORKS_TAPE);
}

/** Alpha of the crowd sprite `t` real seconds into a home goal pulse: 1 → 0,85 → 1. */
export function goalPulseAlpha(t: number): number {
  const p = t / STADIUM.GOAL_PULSE_S;
  if (!(p > 0 && p < 1)) return 1;
  return 1 - 0.15 * Math.sin(Math.PI * p);
}

/** The manager's decorations (`stadiumDecor.ts`) in the club's colour and a light tone. */
export function drawDecor(g: Graphics, rects: readonly DecorRect[], clubColor: number): void {
  for (const r of rects) g.rect(r.x, r.y, r.w, r.h).fill({ color: r.tone === "club" ? clubColor : DECOR_LIGHT, alpha: r.alpha });
}

/** Mixes `hex` towards white by `t`. */
function lift(hex: number, t: number): number {
  const r = (hex >> 16) & 0xff, g = (hex >> 8) & 0xff, b = hex & 0xff;
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

/**
 * The ground around a shaped stadium (`surroundings.ts`): paving with slab joints, grass beds, the building's contact
 * shadow, then the trees (shadow, overlapping lobes, a lit side). Drawn once; the light layer darkens it at night.
 */
export function drawSurroundings(g: Graphics, canvas: { w: number; h: number }, stand: StandGeometry, scale: number, seed: string): void {
  const S = SURROUND;
  g.rect(0, 0, canvas.w, canvas.h).fill(S.PAVING);
  const step = S.SLAB_YDS * scale;
  for (let x = step; x < canvas.w; x += step) g.moveTo(x, 0).lineTo(x, canvas.h);
  for (let y = step; y < canvas.h; y += step) g.moveTo(0, y).lineTo(canvas.w, y);
  g.stroke({ width: 1, color: S.SLAB, alpha: S.SLAB_ALPHA });
  const { trees, beds } = surroundLayout(canvas, stand, scale, seed);
  for (const b of beds) g.roundRect(b.x, b.y, b.w, b.h, Math.min(b.w, b.h) * 0.3).fill(S.BED);
  // The building's contact shadow: the footprint pushed away from the sun, in three soft steps.
  const [sx, sy] = S.SHADOW_DIR;
  for (const k of [1, 0.66, 0.33]) {
    for (const p of standFootprint(stand)) {
      g.poly(p.map((v, i) => v + (i % 2 === 0 ? sx : sy) * scale * k)).fill({ color: 0x000000, alpha: S.SHADOW_ALPHA / 3 });
    }
  }
  for (const t of trees) {
    const off = t.r * 0.45;
    g.circle(t.x + sx * off / 1.5, t.y + sy * off / 1.5, t.r * 1.02).fill({ color: 0x000000, alpha: 0.28 });
  }
  for (const t of trees) {
    const tone = S.TREE_TONES[t.tone]!;
    g.circle(t.x, t.y, t.r * 0.7).fill(tone);
    for (const l of t.lobes) g.circle(t.x + l.dx, t.y + l.dy, l.r).fill(tone);
    // The lit side (towards the sun) and a darker core.
    for (const l of t.lobes) g.circle(t.x + l.dx - sx * l.r * 0.18, t.y + l.dy - sy * l.r * 0.18, l.r * 0.55).fill({ color: lift(tone, 0.22), alpha: 0.7 });
    g.circle(t.x + sx * t.r * 0.12, t.y + sy * t.r * 0.12, t.r * 0.28).fill({ color: 0x000000, alpha: 0.18 });
  }
}

/** The roof rim along the stadium's footprint (each stand's own roof on a blocks ground): a dark outer line and the rim. */
export function drawRoofRim(g: Graphics, stand: StandGeometry, scale: number): void {
  const w = Math.max(2, SURROUND.RIM_YDS * scale);
  for (const p of standFootprint(stand)) {
    g.poly(p).stroke({ width: w + 2, color: SURROUND.RIM_DARK, alignment: 1 });
    g.poly(p).stroke({ width: w, color: SURROUND.RIM, alignment: 1 });
  }
}
