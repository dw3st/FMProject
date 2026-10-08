/**
 * Pixi drawing of the stadium band (spec 2026-10-08-match-visual §2): the stand, the concrete
 * walkways and every fan in one `Graphics`, baked by the caller into a single texture.
 */
import type { Graphics } from "pixi.js";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import { crowdSeats, seatCellPx, standConcreteRows, type CrowdInput } from "@/GraficsEngine/crowd";
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

  const r = seatCellPx(stand) * SEAT_DOT;
  for (const s of crowdSeats({ ...crowd, stand })) g.circle(s.x, s.y, r).fill(s.color);

  // Roof edge around the canvas and the advertising boards along the run-off.
  g.rect(outer.x + 1, outer.y + 1, outer.w - 2, outer.h - 2).stroke({ width: 2, color: STADIUM.ROOF_EDGE });
  g.rect(inner.x, inner.y, inner.w, inner.h).stroke({ width: 1.5, color: 0xd9dde3, alpha: 0.35 });
}

/** Alpha of the crowd sprite `t` real seconds into a home goal pulse: 1 → 0,85 → 1. */
export function goalPulseAlpha(t: number): number {
  const p = t / STADIUM.GOAL_PULSE_S;
  if (!(p > 0 && p < 1)) return 1;
  return 1 - 0.15 * Math.sin(Math.PI * p);
}
