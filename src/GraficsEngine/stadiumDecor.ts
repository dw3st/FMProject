/**
 * The manager's stadium decorations (`.claude/rules/game/achievements.md` §6): a banner, a giant flag and a
 * mosaic in the home end, in the club's colour. Pure geometry (px rectangles); `stadiumRender` draws them
 * into the baked crowd texture, so they cost nothing per frame.
 */
import { standSideRects, type SideRect } from "@/GraficsEngine/crowd";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import type { StadiumDecor } from "@/types/achievementTypes";

export interface DecorRect { x: number; y: number; w: number; h: number; tone: "club" | "light"; alpha: number }

/** Stripes of the mosaic along the goal line. */
const MOSAIC_STRIPES = 8;

/**
 * Rectangles of the decorations in the home end (`homeSide`, the drawn side of the home club's end stand),
 * in drawing order: mosaic (the whole end in stripes), flag (a big block in the middle with a light band),
 * banner (a strip along the pitch edge). Empty with no decoration or no stand on that side.
 */
export function decorRects(stand: StandGeometry, homeSide: "left" | "right", decor: StadiumDecor): DecorRect[] {
  const r: SideRect | undefined = standSideRects(stand).find((s) => s.side === homeSide);
  if (!r || r.w <= 0 || r.h <= 0) return [];
  const out: DecorRect[] = [];
  if (decor.mosaic) {
    const step = r.h / MOSAIC_STRIPES;
    for (let i = 0; i < MOSAIC_STRIPES; i++) {
      out.push({ x: r.x, y: r.y + i * step, w: r.w, h: step, tone: i % 2 === 0 ? "club" : "light", alpha: 0.85 });
    }
  }
  if (decor.flag) {
    const w = r.w * 0.7;
    const h = r.h * 0.45;
    const x = r.x + (r.w - w) / 2;
    const y = r.y + (r.h - h) / 2;
    out.push({ x, y, w, h, tone: "club", alpha: 1 });
    out.push({ x, y: y + h / 3, w, h: h / 3, tone: "light", alpha: 1 });
  }
  if (decor.banner) {
    // Along the pitch edge: the right edge of the left end, the left edge of the right end.
    const w = Math.max(2, r.w * 0.18);
    const x = homeSide === "left" ? r.x + r.w - w : r.x;
    out.push({ x, y: r.y + r.h * 0.05, w, h: r.h * 0.9, tone: "light", alpha: 1 });
    out.push({ x: x + w * 0.25, y: r.y + r.h * 0.05, w: w * 0.5, h: r.h * 0.9, tone: "club", alpha: 1 });
  }
  return out;
}
