/**
 * Pixi drawing of the stadium band (spec 2026-10-08-match-visual §2): the stand, the concrete
 * walkways and every fan in one `Graphics`, baked by the caller into a single texture.
 */
import type { Graphics } from "pixi.js";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import { crowdSeats, seatCellPx, standConcreteRows, standSideRects, type CrowdInput, type SideRect } from "@/GraficsEngine/crowd";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

/** Radius of a fan dot, as a fraction of the seat cell. */
const SEAT_DOT = 0.38;

/** Draws the stand band (outer − inner), its walkways, the fans and the edges into `g`. */
export function drawStand(g: Graphics, stand: StandGeometry, crowd: Omit<CrowdInput, "stand">): void {
  const { outer, inner } = stand;
  const innerR = inner.x + inner.w, innerB = inner.y + inner.h;
  g.rect(outer.x, outer.y, outer.w, inner.y - outer.y).fill(STADIUM.STAND_COLOR);
  g.rect(outer.x, innerB, outer.w, outer.y + outer.h - innerB).fill(STADIUM.STAND_COLOR);
  g.rect(outer.x, inner.y, inner.x - outer.x, inner.h).fill(STADIUM.STAND_COLOR);
  g.rect(innerR, inner.y, outer.x + outer.w - innerR, inner.h).fill(STADIUM.STAND_COLOR);
  for (const c of standConcreteRows(stand)) g.rect(c.x, c.y, c.w, c.h).fill(STADIUM.CONCRETE);
  const works = new Set(crowd.works ?? []);
  for (const r of standSideRects(stand)) if (works.has(r.side)) drawWorks(g, r, seatCellPx(stand));

  const r = seatCellPx(stand) * SEAT_DOT;
  for (const s of crowdSeats({ ...crowd, stand })) g.circle(s.x, s.y, r).fill(s.color);

  // Roof edge around the canvas and the advertising boards along the run-off.
  g.rect(outer.x + 1, outer.y + 1, outer.w - 2, outer.h - 2).stroke({ width: 2, color: STADIUM.ROOF_EDGE });
  g.rect(inner.x, inner.y, inner.w, inner.h).stroke({ width: 1.5, color: 0xd9dde3, alpha: 0.35 });
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

function drawWorks(g: Graphics, r: SideRect, cell: number): void {
  g.rect(r.x, r.y, r.w, r.h).fill(STADIUM.WORKS_BASE);
  const { scaffold, tape } = worksPieces(r, cell);
  for (const p of scaffold) g.rect(p.x, p.y, p.w, p.h).fill(STADIUM.WORKS_SCAFFOLD);
  for (const p of tape) g.rect(p.x, p.y, p.w, p.h).fill(p.dark ? STADIUM.WORKS_TAPE_DARK : STADIUM.WORKS_TAPE);
}

/** Alpha of the crowd sprite `t` real seconds into a home goal pulse: 1 → 0,85 → 1. */
export function goalPulseAlpha(t: number): number {
  const p = t / STADIUM.GOAL_PULSE_S;
  if (!(p > 0 && p < 1)) return 1;
  return 1 - 0.15 * Math.sin(Math.PI * p);
}
