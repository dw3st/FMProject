/**
 * Animated crowd (4.38.12, mock approved 2026-10-28): every fan is a small person (head, shoulders, the shirt in his
 * side's colour, some with a scarf) that moves on his own. A soft continuous bounce, close in phase within a section so
 * a chant reads as a gentle wave; the Mexican wave raises the arms as it goes round; a goal makes the scoring side jump
 * with the arms up. Big flags wave over the home stands. Pure, in canvas pixels; the effects clock drives it (frozen
 * while paused, nothing with the tab hidden). The figures are drawn by `crowdFigures.ts`.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export const CROWD_MOTION = {
  /** A figure's size (its scale `s`, px) in seat cells. */
  FIGURE: 1.25,
  /** Section side in seat cells: the fans of a section bounce in close phase (plus JITTER rad). */
  SECTION_CELLS: 7, JITTER: 0.8,
  /** Bounce: up to BOUNCE × s, BOUNCE_HZ per second (× each fan's own speed, SPEED_SPREAD around 1). */
  BOUNCE: 0.22, BOUNCE_HZ: 0.42, SPEED_SPREAD: 0.2,
  /** Wave: once every WAVE_EVERY_S it goes round in WAVE_LAP_S; a fan it passes lifts WAVE × s with the arms up. */
  WAVE: 0.55, WAVE_EVERY_S: 20, WAVE_LAP_S: 8, WAVE_WIDTH: 0.3,
  /** Goal: the scoring side jumps (up to GOAL_JUMP × s) with the arms up for GOAL_S, fading. */
  GOAL_JUMP: 0.55, GOAL_S: 3.5, GOAL_HZ: 0.95,
  /** Share of the home fans with a scarf; head looks (skin tones, hair colours, bald, cap). */
  SCARF_SHARE: 0.3, SKINS: 6, HAIRS: 7, BALD_SHARE: 0.12, CAP_SHARE: 0.08,
  /** Small flags waved by hand: share of the home fans, flag size and stick length in figure sizes, swing. */
  HAND_FLAG: { SHARE: 0.07, W: 0.75, H: 0.5, STICK: 1.1, SWING: 0.65, HZ: 0.9 },
  /**
   * Big banners held up over the heads by a group of home fans: per long side and on the home end, size in seat cells
   * (along the side, across), cloth strips, ripple speed, the holders' bounce.
   */
  BANNERS: { PER_LONG_SIDE: 2, HOME_END: 1, LONG: 12, DEEP: 3.2, END_DEEP: 0.6, STRIPS: 14, HZ: 0.55, RIPPLE: 0.35, BOB: 0.18, HOLD_EVERY: 3 },
} as const;

/** A seat with a position (px) and a side. */
export interface FanSeat { x: number; y: number; team: "home" | "away" }

/**
 * How a fan looks and moves: head (skin, hair: 0..HAIRS-1, HAIRS = bald, HAIRS+1 = cap), scarf, a small flag in the
 * hand (home fans without a scarf), phase, speed.
 */
export interface FanLook { skin: number; hair: number; scarf: boolean; flag: boolean; phase: number; speed: number }

/** Looks of every fan, deterministic per seed and seat position. */
export function fanLooks(seats: readonly FanSeat[], cellPx: number, seed: string): FanLook[] {
  const C = CROWD_MOTION;
  const sectionPx = cellPx * C.SECTION_CELLS;
  const sectionPhase = new Map<string, number>();
  return seats.map((s, i) => {
    const r = mulberry32(seedFrom(`fan:${seed}:${i}:${Math.round(s.x)}:${Math.round(s.y)}`));
    const key = `${Math.floor(s.x / sectionPx)}:${Math.floor(s.y / sectionPx)}`;
    let base = sectionPhase.get(key);
    if (base === undefined) {
      base = mulberry32(seedFrom(`fan-section:${seed}:${key}`))() * Math.PI * 2;
      sectionPhase.set(key, base);
    }
    const look = r();
    const scarf = s.team === "home" && r() < C.SCARF_SHARE;
    return {
      skin: Math.floor(r() * C.SKINS),
      hair: look < C.CAP_SHARE ? C.HAIRS + 1 : look < C.CAP_SHARE + C.BALD_SHARE ? C.HAIRS : Math.floor(r() * C.HAIRS),
      scarf,
      flag: s.team === "home" && !scarf && r() < C.HAND_FLAG.SHARE / (1 - C.SCARF_SHARE),
      phase: base + (r() - 0.5) * C.JITTER,
      speed: 1 + (r() - 0.5) * 2 * C.SPEED_SPREAD,
    };
  });
}

/** A fan's pose at `now`: how far up (px) and the arms (0 = down, 1 = up). */
export interface FanPose { lift: number; arms: number }

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * Pose of a fan at `now`. `s` is the figure size (px), `centre` the pitch centre, `waveFrom` the first wave's time,
 * `goalAge` the seconds since his side scored (null: no goal running).
 */
export function fanPose(
  fan: { x: number; y: number; phase: number; speed: number }, now: number, s: number,
  centre: { x: number; y: number }, waveFrom: number, goalAge: number | null,
): FanPose {
  const C = CROWD_MOTION;
  const b = Math.sin(now * C.BOUNCE_HZ * Math.PI * 2 * fan.speed + fan.phase) * 0.5 + 0.5;
  let lift = b * b * C.BOUNCE * s;
  let arms = 0;
  const sinceWave = now - waveFrom;
  if (sinceWave >= 0) {
    const inCycle = sinceWave % C.WAVE_EVERY_S;
    if (inCycle < C.WAVE_LAP_S) {
      const front = (inCycle / C.WAVE_LAP_S) * Math.PI * 2;
      const ang = Math.atan2(fan.y - centre.y, fan.x - centre.x) + Math.PI;
      let d = Math.abs(ang - front);
      d = Math.min(d, Math.PI * 2 - d);
      if (d < C.WAVE_WIDTH) {
        const w = smooth(1 - d / C.WAVE_WIDTH);
        lift += w * C.WAVE * s;
        arms = Math.max(arms, w);
      }
    }
  }
  if (goalAge !== null && goalAge >= 0 && goalAge < C.GOAL_S) {
    const g = 1 - goalAge / C.GOAL_S;
    lift += Math.abs(Math.sin(goalAge * C.GOAL_HZ * Math.PI * 2 * fan.speed + fan.phase)) * C.GOAL_JUMP * s * g;
    arms = Math.max(arms, Math.min(1, g * 2));
  }
  return { lift, arms };
}

/** A side of the stand (px). */
export interface StandBand { side: "top" | "bottom" | "left" | "right"; x: number; y: number; w: number; h: number }

/** Angle (rad, from vertical) of a hand flag's stick at `now`: a steady swing, wider when the fan is up. */
export function handFlagAngle(fan: { phase: number; speed: number }, now: number, arms: number): number {
  const H = CROWD_MOTION.HAND_FLAG;
  return Math.sin(now * H.HZ * Math.PI * 2 * fan.speed + fan.phase * 1.3) * H.SWING * (0.7 + 0.3 * arms);
}

/** A banner held over a stand: its rectangle (px, the cloth at rest) and its ripple phase. */
export interface StandBanner { x: number; y: number; w: number; h: number; phase: number }

/**
 * Banners over the home stands: along the two long sides and on the home end (never the away end, never a stand under
 * works), held a little up from the middle of the band. `cellPx` is the seat cell.
 */
export function standBanners(
  bands: readonly StandBand[], homeSide: "left" | "right", cellPx: number, seed: string, skip: readonly string[] = [],
): StandBanner[] {
  const B = CROWD_MOTION.BANNERS;
  const rng = mulberry32(seedFrom(`stand-banners:${seed}`));
  const out: StandBanner[] = [];
  for (const b of bands) {
    if (skip.includes(b.side)) continue;
    if (b.side === "top" || b.side === "bottom") {
      const w = Math.min(b.w / (B.PER_LONG_SIDE * 2), B.LONG * cellPx);
      const h = Math.min(b.h * 0.7, B.DEEP * cellPx);
      for (let i = 0; i < B.PER_LONG_SIDE; i++) {
        const cx = b.x + b.w * (i * 2 + 1.5) / (B.PER_LONG_SIDE * 2 + 1);
        // Room above for the lift (bob + ripple): low in the band, toward the pitch on the top stand.
        const room = (B.BOB + B.RIPPLE * 0.5) * h;
        const y = b.side === "top" ? b.y + Math.max(room, b.h - h - 1) : b.y + Math.max(room, Math.min(1, b.h - h));
        out.push({ x: cx - w / 2, y, w, h, phase: rng() * Math.PI * 2 });
      }
    } else if (b.side === homeSide) {
      const w = b.w * B.END_DEEP * 1.4;
      const h = Math.min(b.h * 0.25, B.LONG * cellPx * 0.5);
      for (let i = 0; i < B.HOME_END; i++) {
        const cy = b.y + b.h * (i + 0.5) / B.HOME_END;
        out.push({ x: b.x + (b.w - w) / 2, y: cy - h / 2, w, h, phase: rng() * Math.PI * 2 });
      }
    }
  }
  return out;
}

/**
 * Vertical offset (px) of the cloth at strip `k` (0..STRIPS) of a banner at `now`: the holders lift it together
 * (bob) and a ripple runs along it. Never below its rest position.
 */
export function bannerOffset(banner: StandBanner, k: number, now: number): number {
  const B = CROWD_MOTION.BANNERS;
  const bob = (Math.sin(now * B.HZ * Math.PI * 2 + banner.phase) * 0.5 + 0.5) * B.BOB * banner.h;
  const ripple = (Math.sin(now * B.HZ * 2.3 * Math.PI * 2 + banner.phase - k * 0.55) * 0.5 + 0.5) * B.RIPPLE * banner.h * 0.5;
  return -(bob + ripple);
}
