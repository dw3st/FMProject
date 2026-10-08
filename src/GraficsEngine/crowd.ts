/**
 * Stadium crowd (pure): seat grid of the stand band and which seats are filled, by whom
 * (spec 2026-10-08-match-visual-design.md §2). Pixel space; `PixiPitch` bakes it into one texture.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import { contrastRatio } from "@/GraficsEngine/playerFaces";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

export type StandSide = "top" | "bottom" | "left" | "right";

export interface SeatCell {
  /** Centre of the seat, px. */
  x: number; y: number;
  side: StandSide;
  row: number; col: number;
  /** 0 = the row next to the pitch, → 1 = the back row. */
  rowFrac: number;
}

/** A concrete walkway row (drawn, never seated): centre line and extent, px. */
export interface ConcreteRow { side: StandSide; x: number; y: number; w: number; h: number }

export interface CrowdInput {
  stand: StandGeometry;
  /** 0..1, attendance / capacity. */
  fill: number;
  homeColor: number; awayColor: number;
  /** Drawn side of the home club ("left" in the live match, #98). */
  homeSide: "left" | "right";
  neutral: boolean;
  /** Fixture id (or "test"): the same game fills the same seats. */
  seed: string;
}

export interface CrowdSeat extends SeatCell { team: "home" | "away"; color: number }

const MIXED_LIGHT = 0xd9dde3;
const MIXED_DARK = 0x8a929c;
/** One fan in MIXED_EVERY wears a neutral colour. */
const MIXED_EVERY = 6;
const BRIGHTNESS_SPREAD = 0.12;
const MIN_STAND_CONTRAST = 1.6;
const LIGHTEN = 0.35;

interface SideRect { side: StandSide; x: number; y: number; w: number; h: number }

function sideRects(s: StandGeometry): SideRect[] {
  const { outer, inner } = s;
  const innerR = inner.x + inner.w, innerB = inner.y + inner.h;
  return [
    { side: "top", x: outer.x, y: outer.y, w: outer.w, h: inner.y - outer.y },
    { side: "bottom", x: outer.x, y: innerB, w: outer.w, h: outer.y + outer.h - innerB },
    { side: "left", x: outer.x, y: inner.y, w: inner.x - outer.x, h: inner.h },
    { side: "right", x: innerR, y: inner.y, w: outer.x + outer.w - innerR, h: inner.h },
  ];
}

/** Cell index `k` (0 = next to the pitch) is a concrete walkway every CONCRETE_EVERY seat rows. */
const isConcrete = (k: number) => k % (STADIUM.CONCRETE_EVERY + 1) === STADIUM.CONCRETE_EVERY;

function layout(stand: StandGeometry, cell: number): { seats: SeatCell[]; concrete: ConcreteRow[] } {
  const seats: SeatCell[] = [];
  const concrete: ConcreteRow[] = [];
  for (const r of sideRects(stand)) {
    const horizontal = r.side === "top" || r.side === "bottom";
    const depth = horizontal ? r.h : r.w;
    const length = horizontal ? r.w : r.h;
    const depthCells = Math.floor(depth / cell);
    const cols = Math.floor(length / cell);
    if (depthCells <= 0 || cols <= 0) continue;
    const seatRows = Array.from({ length: depthCells }, (_, k) => k).filter((k) => !isConcrete(k)).length;
    const lenStart = (length - cols * cell) / 2;
    // Distance (px) of cell k's centre from the pitch edge of this side.
    const away = (k: number) => (k + 0.5) * cell;
    const toXY = (k: number, c: number) => {
      const along = (horizontal ? r.x : r.y) + lenStart + (c + 0.5) * cell;
      switch (r.side) {
        case "top": return { x: along, y: r.y + r.h - away(k) };
        case "bottom": return { x: along, y: r.y + away(k) };
        case "left": return { x: r.x + r.w - away(k), y: along };
        case "right": return { x: r.x + away(k), y: along };
      }
    };
    let row = 0;
    for (let k = 0; k < depthCells; k++) {
      if (isConcrete(k)) {
        const p = toXY(k, 0);
        concrete.push(horizontal
          ? { side: r.side, x: r.x, y: p.y - cell / 2, w: r.w, h: cell }
          : { side: r.side, x: p.x - cell / 2, y: r.y, w: cell, h: r.h });
        continue;
      }
      const rowFrac = seatRows > 1 ? row / (seatRows - 1) : 0;
      for (let c = 0; c < cols; c++) {
        const p = toXY(k, c);
        seats.push({ x: p.x, y: p.y, side: r.side, row, col: c, rowFrac });
      }
      row++;
    }
  }
  return { seats, concrete };
}

/** Seat cell size: SEAT_PX, grown 1 px at a time until the stand holds at most MAX_SEATS. */
export function seatCellPx(stand: StandGeometry): number {
  let cell: number = STADIUM.SEAT_PX;
  while (layout(stand, cell).seats.length > STADIUM.MAX_SEATS) cell += 1;
  return cell;
}

/** Every seat of the stand (filled or not). */
export function standSeatGrid(stand: StandGeometry): SeatCell[] {
  return layout(stand, seatCellPx(stand)).seats;
}

/** Concrete walkway rows of the stand (drawn under the fans). */
export function standConcreteRows(stand: StandGeometry): ConcreteRow[] {
  return layout(stand, seatCellPx(stand)).concrete;
}

const unitHash = (key: string) => mulberry32(seedFrom(key))();

function channels(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}
function fromChannels(r: number, g: number, b: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}
/** Mix towards white by `t` (0..1). */
function lighten(hex: number, t: number): number {
  const [r, g, b] = channels(hex);
  return fromChannels(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
}
function scaleBrightness(hex: number, f: number): number {
  const [r, g, b] = channels(hex);
  return fromChannels(r * f, g * f, b * f);
}

/** A club colour that would vanish on the dark stand is lightened. */
export function crowdBaseColor(hex: number): number {
  return contrastRatio(hex, STADIUM.STAND_COLOR) < MIN_STAND_CONTRAST ? lighten(hex, LIGHTEN) : hex;
}

/**
 * The filled seats. Lower rows fill first (weight 1,25 − 0,5 × rowFrac on a per-seat hash); the
 * number filled is exactly round(fill × seats). The away block is contiguous, in the end stand
 * opposite the home side, starting at its top corner (AWAY_SHARE of the fans); a neutral venue
 * splits the stand at the drawn halfway line.
 */
export function crowdSeats(input: CrowdInput): CrowdSeat[] {
  const fill = Math.max(0, Math.min(1, Number.isFinite(input.fill) ? input.fill : 0));
  const grid = standSeatGrid(input.stand);
  const target = Math.round(fill * grid.length);
  if (target === 0) return [];
  const key = (s: SeatCell) => `${input.seed}:${s.side}:${s.row}:${s.col}`;
  const ranked = grid
    .map((s) => ({ s, v: unitHash(key(s)) / (1.25 - 0.5 * s.rowFrac) }))
    .sort((a, b) => a.v - b.v);
  const filled = ranked.slice(0, target).map((r) => r.s);

  const away = new Set<SeatCell>();
  if (input.neutral) {
    const mid = input.stand.outer.x + input.stand.outer.w / 2;
    for (const s of filled) if (s.x >= mid) away.add(s);
  } else {
    const end: StandSide = input.homeSide === "left" ? "right" : "left";
    const want = Math.round(STADIUM.AWAY_SHARE * filled.length);
    const block = filled.filter((s) => s.side === end).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const s of block.slice(0, want)) away.add(s);
  }

  const homeBase = crowdBaseColor(input.homeColor);
  const awayBase = crowdBaseColor(input.awayColor);
  return filled.map((s) => {
    const team = away.has(s) ? "away" as const : "home" as const;
    const h = unitHash(`${key(s)}:c`);
    let color: number;
    if (Math.floor(h * MIXED_EVERY * 1000) % MIXED_EVERY === 0) {
      color = h < 0.5 ? MIXED_LIGHT : MIXED_DARK;
    } else {
      const f = 1 + (unitHash(`${key(s)}:b`) * 2 - 1) * BRIGHTNESS_SPREAD;
      color = scaleBrightness(team === "away" ? awayBase : homeBase, f);
    }
    return { ...s, team, color };
  });
}
