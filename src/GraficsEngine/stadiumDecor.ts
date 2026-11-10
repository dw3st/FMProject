/**
 * The manager's stadium decorations (`.claude/rules/game/achievements.md` §6): a banner and a mosaic in the home end.
 * Since 8.9.10 the mosaic is pixel art (stripes, check, the club crest, a star), one cell per seat block, in two
 * colours the manager picks. Pure geometry (px rectangles); `stadiumRender` draws them into the baked crowd texture,
 * so they cost nothing per frame.
 */
import { standSideRects, type SideRect } from "@/GraficsEngine/crowd";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import { SHIELD_ART, STAR_ART } from "@/Domain/achievements/decorStyle";
import type { StadiumDecor } from "@/types/achievementTypes";

/** "main"/"second" = the two decoration colours, "lift" = a lighter main, `rgb` = a crest pixel. */
export interface DecorRect { x: number; y: number; w: number; h: number; tone: "main" | "second" | "lift"; alpha: number; rgb?: number }

/** The club crest as pixels (a square canvas read with `getImageData`). */
export interface CrestPixels { size: number; data: Uint8ClampedArray }

/** Cells across the end stand; rows follow so the cells stay square. */
const MOSAIC_COLS = 16;
const MOSAIC_ALPHA = 0.85;
/** The crest motif is CREST_CELLS × CREST_CELLS cells. */
const CREST_CELLS = 14;

type Cell = "main" | "second" | "lift" | number;

/** The art grid of one motif: a bitmap, or the crest read from its pixels (transparent = main colour). */
function motif(pattern: "crest" | "star", crest: CrestPixels | null): Cell[][] {
  if (pattern === "crest" && crest) {
    const out: Cell[][] = [];
    for (let r = 0; r < CREST_CELLS; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < CREST_CELLS; c++) {
        const x = Math.min(crest.size - 1, Math.floor(((c + 0.5) / CREST_CELLS) * crest.size));
        const y = Math.min(crest.size - 1, Math.floor(((r + 0.5) / CREST_CELLS) * crest.size));
        const i = (y * crest.size + x) * 4;
        row.push(crest.data[i + 3]! < 128 ? "main" : (crest.data[i]! << 16) | (crest.data[i + 1]! << 8) | crest.data[i + 2]!);
      }
      out.push(row);
    }
    return out;
  }
  const art = pattern === "star" ? STAR_ART : SHIELD_ART;
  return art.map((line) => [...line].map((ch) => (ch === "#" ? "second" : ch === "o" ? "lift" : "main")));
}

/** The mosaic cells of the end stand `r`. */
export function mosaicCells(r: SideRect, decor: Pick<StadiumDecor, "pattern">, crest: CrestPixels | null = null): DecorRect[] {
  const cell = r.w / MOSAIC_COLS;
  const rows = Math.max(1, Math.round(r.h / cell));
  const ch = r.h / rows;
  const pattern = decor.pattern ?? "stripes";
  const grid: Cell[][] = Array.from({ length: rows }, () => Array<Cell>(MOSAIC_COLS).fill("main"));
  if (pattern === "stripes" || pattern === "check") {
    const band = Math.max(1, Math.round(rows / 8));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < MOSAIC_COLS; x++) {
        const odd = pattern === "stripes" ? Math.floor(y / band) % 2 : (Math.floor(y / 2) + Math.floor(x / 2)) % 2;
        grid[y]![x] = odd ? "second" : "main";
      }
    }
  } else {
    // The motif repeats along the stand, two cells apart, centred both ways.
    const art = motif(pattern, crest);
    const ah = art.length, aw = art[0]!.length;
    const ox = Math.floor((MOSAIC_COLS - aw) / 2);
    const copies = rows >= ah ? Math.floor((rows + 2) / (ah + 2)) : 0;
    const oy = Math.floor((rows - (copies * (ah + 2) - 2)) / 2);
    for (let k = 0; k < copies; k++) {
      for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) grid[oy + k * (ah + 2) + y]![ox + x] = art[y]![x]!;
    }
  }
  const out: DecorRect[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < MOSAIC_COLS; x++) {
      const v = grid[y]![x]!;
      const base = { x: r.x + x * cell, y: r.y + y * ch, w: cell, h: ch, alpha: MOSAIC_ALPHA };
      out.push(typeof v === "number" ? { ...base, tone: "main", rgb: v } : { ...base, tone: v });
    }
  }
  return out;
}

/**
 * Rectangles of the decorations in the home end (`homeSide`, the drawn side of the home club's end stand),
 * in drawing order: mosaic (the whole end), banner (a strip along the pitch edge). The giant flag is not
 * drawn since 4.41.18. Empty with no decoration or no stand on that side.
 */
export function decorRects(stand: StandGeometry, homeSide: "left" | "right", decor: StadiumDecor, crest: CrestPixels | null = null): DecorRect[] {
  const r: SideRect | undefined = standSideRects(stand).find((s) => s.side === homeSide);
  if (!r || r.w <= 0 || r.h <= 0) return [];
  const out: DecorRect[] = decor.mosaic ? mosaicCells(r, decor, crest) : [];
  // The giant flag is no longer drawn in the match (4.41.18, the user: it looked bad); the hand flags stay.
  if (decor.banner) {
    // Along the pitch edge: the right edge of the left end, the left edge of the right end.
    const w = Math.max(2, r.w * 0.18);
    const x = homeSide === "left" ? r.x + r.w - w : r.x;
    out.push({ x, y: r.y + r.h * 0.05, w, h: r.h * 0.9, tone: "second", alpha: 1 });
    out.push({ x: x + w * 0.25, y: r.y + r.h * 0.05, w: w * 0.5, h: r.h * 0.9, tone: "main", alpha: 1 });
  }
  return out;
}

/** "#rrggbb" → 0xrrggbb. */
export const hexNumber = (hex: string): number => parseInt(hex.slice(1), 16);

/** The fill of one rect, from the two decoration colours. */
export function decorFill(r: DecorRect, colors: readonly [number, number]): number {
  if (r.rgb !== undefined) return r.rgb;
  if (r.tone === "second") return colors[1];
  if (r.tone === "main") return colors[0];
  const c = colors[0];
  const lift = (v: number) => Math.round(v + (255 - v) * 0.3);
  return (lift((c >> 16) & 0xff) << 16) | (lift((c >> 8) & 0xff) << 8) | lift(c & 0xff);
}
