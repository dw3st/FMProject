/**
 * Stadium extras of the live match (tester reports, 4.42): LED board behaviour (fit or scroll inside the board,
 * transitions), the bottom boards kept clear of the benches, the technical areas, the corner flags, the curved stand
 * corners and the people around the pitch (TV cameras at the corners, a reporter behind the boards, stewards, vendors in
 * the stands). Pure, canvas pixels or pitch yards as noted; `PixiPitch` draws them. Drawing only.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { PitchMetrics, StandGeometry } from "@/GraficsEngine/pitchMetrics";

export const EXTRAS = {
  /** LED: text glyph height × the screen height; below MIN_SCALE of fit the text scrolls instead of shrinking. */
  LED: { MIN_SCALE: 0.78, SCROLL_PX_S: 0.9, TRANSITION_S: 0.45, KINDS: ["slide", "wipe", "squeeze"] as const },
  /** Bottom boards: at least GAP_YDS from a bench; never shorter than MIN_YDS (else dropped). */
  BOTTOM_BOARD: { GAP_YDS: 1.2, MIN_YDS: 5 },
  /** Technical area: margin around the bench and the manager's walk (yds), first line this far below the touchline. */
  TECH: { MARGIN_YDS: 0.9, FROM_TOUCH_YDS: 0.55, DASH: 4, GAP: 3, ALPHA: 0.75 },
  /** Corner flags: pennant length in figure units (0.4 × marker radius), sway. */
  FLAG: { LEN: 3.4, POLE: 0.7, SWAY: 0.22, HZ: 0.7 },
  /** People: stewards every STEWARD_YDS along the stands' foot; VENDORS walk the walkways at VENDOR_YDS_S. */
  STEWARD_YDS: 17, VENDORS: [5, 9] as const, VENDOR_YDS_S: 0.9,
  STEWARD_VEST: 0xff8a1c, STEWARD_STRIPE: 0xe8f0e0,
} as const;

export type LedTransition = typeof EXTRAS.LED.KINDS[number];

/** The transition of a flip cycle (the same for every board, so a flip runs along the ground as one). */
export function ledTransition(seed: string, cycle: number): LedTransition {
  const r = mulberry32(seedFrom(`led:${seed}:${cycle}`))();
  return EXTRAS.LED.KINDS[Math.floor(r * EXTRAS.LED.KINDS.length)]!;
}

/**
 * How a text of natural width `textW` shows on a screen `maxW` wide: shrunk to fit when it needs at most MIN_SCALE,
 * else it scrolls across at full size (a long goal message never spills out of the board).
 */
export function ledFit(textW: number, maxW: number): { scale: number; scroll: boolean } {
  if (textW <= maxW) return { scale: 1, scroll: false };
  const s = maxW / textW;
  return s >= EXTRAS.LED.MIN_SCALE ? { scale: s, scroll: false } : { scale: 1, scroll: true };
}

/** Centre x of a scrolling text at `t` seconds: enters from the right edge, leaves by the left, loops. */
export function ledMarqueeX(t: number, screenW: number, textW: number, screenH: number): number {
  const speed = screenH * EXTRAS.LED.SCROLL_PX_S * 6;
  const span = screenW + textW;
  const d = ((t * speed) % span + span) % span;
  return screenW + textW / 2 - d;
}

/** A board in pitch yards (centre x, length). */
export interface BoardSpan { x: number; len: number }

/**
 * Bottom boards kept clear of the benches (tester report): each board is shrunk away from any bench it would touch
 * (bench spans in pitch yards), keeping the end that is farther from the bench; too short boards are dropped (null).
 */
export function clearOfBenches(board: BoardSpan, benches: readonly [number, number][]): BoardSpan | null {
  const G = EXTRAS.BOTTOM_BOARD;
  let a = board.x - board.len / 2, b = board.x + board.len / 2;
  for (const [s0, s1] of benches) {
    const lo = s0 - G.GAP_YDS, hi = s1 + G.GAP_YDS;
    if (b <= lo || a >= hi) continue;
    // Keep the bigger side of the board outside the bench.
    if (lo - a >= b - hi) b = Math.min(b, lo); else a = Math.max(a, hi);
  }
  if (b - a < G.MIN_YDS) return null;
  return { x: (a + b) / 2, len: b - a };
}

export interface PxRect { x: number; y: number; w: number; h: number }

/**
 * The technical area (px): a rectangle around the bench and the manager's walk, from just below the touchline down to
 * the back of the bench (the line along the bench's back is left open).
 */
export function techArea(bench: PxRect, coachX: number, walkHalf: number, touchY: number, scale: number): PxRect {
  const T = EXTRAS.TECH;
  const x0 = Math.min(bench.x, coachX - walkHalf) - T.MARGIN_YDS * scale;
  const x1 = Math.max(bench.x + bench.w, coachX + walkHalf) + T.MARGIN_YDS * scale;
  const y0 = touchY + T.FROM_TOUCH_YDS * scale;
  return { x: x0, y: y0, w: x1 - x0, h: bench.y + bench.h - y0 };
}

/** Dashes of a line from (x0, y0) to (x1, y1). */
export function dashes(x0: number, y0: number, x1: number, y1: number, dash: number, gap: number): [number, number, number, number][] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len <= 0) return [];
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const out: [number, number, number, number][] = [];
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    out.push([x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e]);
  }
  return out;
}

/** The four corner flags (px) with the direction (unit) of the pennant, diagonally into the pitch. */
export function cornerFlags(m: Pick<PitchMetrics, "marginX" | "marginY" | "width" | "height">): { x: number; y: number; dx: number; dy: number }[] {
  const x0 = m.marginX, y0 = m.marginY, x1 = m.marginX + m.width, y1 = m.marginY + m.height;
  const k = Math.SQRT1_2;
  return [
    { x: x0, y: y0, dx: k, dy: k }, { x: x1, y: y0, dx: -k, dy: k },
    { x: x0, y: y1, dx: k, dy: -k }, { x: x1, y: y1, dx: -k, dy: -k },
  ];
}

/** A rounded stand corner: the inner (pitch) corner and the radius of the quarter bowl around it. */
export interface StandCorner { cx: number; cy: number; r: number; sx: 1 | -1; sy: 1 | -1 }

/** The four stand corners rounded into a bowl (tester report: the stands were square). */
export function standCorners(s: StandGeometry): StandCorner[] {
  const { outer, inner } = s;
  const t = s.thickness;
  const ir = inner.x + inner.w, ib = inner.y + inner.h;
  void outer;
  return [
    { cx: inner.x, cy: inner.y, r: Math.min(t.left, t.top), sx: -1, sy: -1 },
    { cx: ir, cy: inner.y, r: Math.min(t.right, t.top), sx: 1, sy: -1 },
    { cx: inner.x, cy: ib, r: Math.min(t.left, t.bottom), sx: -1, sy: 1 },
    { cx: ir, cy: ib, r: Math.min(t.right, t.bottom), sx: 1, sy: 1 },
  ];
}

/** True when (x, y) lies in a corner square of the band but outside its rounded bowl (no seat there). */
export function outsideCornerBowl(s: StandGeometry, x: number, y: number): boolean {
  for (const c of standCorners(s)) {
    const dx = (x - c.cx) * c.sx, dy = (y - c.cy) * c.sy;
    if (dx > 0 && dy > 0) return Math.hypot(dx, dy) > c.r;
  }
  return false;
}

/** A person standing around the pitch (px), facing `face` (radians, 0 = +x). */
export interface Bystander { x: number; y: number; face: number; kind: "tv" | "reporter" | "crew" | "steward" }

/**
 * TV cameras at the four corners (in the end apron, beside the corner flag), a reporter with a cameraman behind a bottom
 * board, and stewards facing the crowd along the foot of the stands. `u` = the figure unit (0.4 × marker radius).
 */
export function bystanders(m: PitchMetrics, u: number, reporterAt: { x: number; y: number } | null): Bystander[] {
  const st = m.stand;
  if (!st) return [];
  const out: Bystander[] = [];
  const x0 = m.marginX, x1 = m.marginX + m.width, y0 = m.marginY, y1 = m.marginY + m.height;
  const off = m.goalNetDepth + 1.6 * m.scale;
  // TV cameras beside the corner flags, looking at the centre of the pitch.
  const cx = x0 + m.width / 2, cy = y0 + m.height / 2;
  for (const [x, y] of [[x0 - off, y0 + 2.2 * m.scale], [x1 + off, y0 + 2.2 * m.scale], [x0 - off, y1 - 2.2 * m.scale], [x1 + off, y1 - 2.2 * m.scale]] as const) {
    out.push({ x, y, face: Math.atan2(cy - y, cx - x), kind: "tv" });
  }
  if (reporterAt) {
    out.push({ x: reporterAt.x, y: reporterAt.y, face: -Math.PI / 2, kind: "reporter" });
    out.push({ x: reporterAt.x, y: reporterAt.y - u * 4, face: Math.PI / 2, kind: "crew" });
  }
  // Stewards: at the foot of the top stand and of both end stands, facing the crowd.
  const inner = st.inner;
  const step = EXTRAS.STEWARD_YDS * m.scale;
  const pad = u * 1.4;
  for (let x = inner.x + step * 0.6; x < inner.x + inner.w - step * 0.4; x += step) out.push({ x, y: inner.y + pad, face: -Math.PI / 2, kind: "steward" });
  for (let y = inner.y + step * 0.7; y < inner.y + inner.h - step * 0.5; y += step) {
    out.push({ x: inner.x + pad, y, face: Math.PI, kind: "steward" });
    out.push({ x: inner.x + inner.w - pad, y, face: 0, kind: "steward" });
  }
  return out;
}

/** A vendor walking a walkway of the stand: his row and pace (stable per match). */
export interface Vendor { row: number; speed: number; phase: number; shirt: number }

export function vendors(seed: string, walkways: number): Vendor[] {
  if (walkways <= 0) return [];
  const r = mulberry32(seedFrom(`vendors:${seed}`));
  const [lo, hi] = EXTRAS.VENDORS;
  const n = lo + Math.floor(r() * (hi - lo + 1));
  const shirts = [0xf4f4f0, 0xffd23f, 0xe8452c, 0x2f80ed];
  return Array.from({ length: n }, () => ({
    row: Math.floor(r() * walkways), speed: 0.6 + r() * 0.8, phase: r(), shirt: shirts[Math.floor(r() * shirts.length)]!,
  }));
}

/** Position along a walkway of `length` px at `t` s: walks one way, turns at the ends (0..length). */
export function vendorAlong(v: Vendor, t: number, length: number, unitPx: number): { at: number; dir: 1 | -1 } {
  if (length <= 0) return { at: 0, dir: 1 };
  const speed = EXTRAS.VENDOR_YDS_S * v.speed * unitPx;
  const span = 2 * length;
  const d = ((v.phase * span + t * speed) % span + span) % span;
  return d < length ? { at: d, dir: 1 } : { at: span - d, dir: -1 };
}
