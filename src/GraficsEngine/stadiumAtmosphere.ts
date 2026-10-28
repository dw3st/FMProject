/**
 * Stadium atmosphere of the live match (4.39, tester reports): floodlight towers in the four corners of the stand,
 * phone lights in the crowd at night, and flares with smoke and fireworks in a big game. Pure, in canvas pixels,
 * on the effects clock (seconds); `PixiPitch` draws it. Drawing only: nothing here reaches the `GameState`.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import type { SeatCell } from "@/GraficsEngine/crowd";

export const ATMOSPHERE = {
  /** Tower: mast length and panel size in stand-corner sizes (the smaller of the two stand thicknesses there). */
  TOWER: { MAST: 0.55, PANEL_W: 0.62, PANEL_H: 0.24, MAST_COLOR: 0x56606b, PANEL_OFF: 0x8a929c, PANEL_ON: 0xfff4d6 },
  /** Floodlight level above which the panels are drawn on (and phones show). */
  LIGHTS_ON: 0.35,
  /** Share of the filled seats with a phone light at night; a home goal doubles it for GOAL_BOOST_S. */
  PHONES: { SHARE: 0.03, GOAL_BOOST_S: 6, REDRAW_S: 0.2, COLOR: 0xf4f7ff },
  /** Flares: per burst, how many in the home end, how long they burn, the smoke puffs each one leaves. */
  FLARES: { COUNT: 5, BURN_S: 7, PUFF_EVERY_S: 0.35, PUFF_LIFE_S: 5, PUFF_ALPHA: 0.32, GLOW: 0xff5a36 },
  /** Fireworks (night only): shells per burst, the time between them, sparks per shell, how long a spark lives. */
  FIREWORKS: { SHELLS: 6, EVERY_S: 0.4, SPARKS: 22, LIFE_S: 1.3, GOLD: 0xffd166, WHITE: 0xffffff },
} as const;

export interface TowerSpot {
  x: number; y: number;
  /** Radians, from the tower toward the pitch centre. */
  angle: number;
  /** Size unit of the tower, px. */
  size: number;
}

/** One tower in each corner of the stand band, the panel turned to the pitch centre. */
export function towerSpots(stand: StandGeometry): TowerSpot[] {
  const { outer, inner, thickness: t } = stand;
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  const right = outer.x + outer.w;
  const bottom = outer.y + outer.h;
  const corners: [number, number, number, number][] = [
    [outer.x + t.left / 2, outer.y + t.top / 2, t.left, t.top],
    [right - t.right / 2, outer.y + t.top / 2, t.right, t.top],
    [outer.x + t.left / 2, bottom - t.bottom / 2, t.left, t.bottom],
    [right - t.right / 2, bottom - t.bottom / 2, t.right, t.bottom],
  ];
  return corners.map(([x, y, a, b]) => ({ x, y, angle: Math.atan2(cy - y, cx - x), size: Math.max(4, Math.min(a, b)) }));
}

/** Where a tower's panel sits (the floodlight glow comes from there). */
export function towerPanel(t: TowerSpot): { x: number; y: number } {
  const d = t.size * ATMOSPHERE.TOWER.MAST;
  return { x: t.x + Math.cos(t.angle) * d, y: t.y + Math.sin(t.angle) * d };
}

export interface PhoneLight {
  x: number; y: number;
  /** 0..1: the lowest ranks are on all night, the rest only while a home goal boosts the crowd. */
  rank: number;
  phase: number;
  /** Seconds of one slow sway. */
  period: number;
}

/** Candidate seats for phone lights: 2 × the night share, ranked, the same seats for the same game. */
export function phoneLights(seats: readonly SeatCell[], seed: string): PhoneLight[] {
  const rng = mulberry32(seedFrom(`phones:${seed}`));
  const out: PhoneLight[] = [];
  const keep = ATMOSPHERE.PHONES.SHARE * 2;
  for (const s of seats) {
    if (rng() >= keep) continue;
    out.push({ x: s.x, y: s.y, rank: rng(), phase: rng() * Math.PI * 2, period: 2.5 + rng() * 2.5 });
  }
  return out;
}

/** Alpha of a phone light at `t` (0 = not shown): half the candidates at night, all of them during a home goal. */
export function phoneAlpha(p: PhoneLight, t: number, boosted: boolean): number {
  if (!boosted && p.rank >= 0.5) return 0;
  const sway = 0.5 + 0.5 * Math.sin((t / p.period) * Math.PI * 2 + p.phase);
  return 0.45 + 0.5 * sway;
}

/** A burst of flares and fireworks: at kickoff and at every home goal of a big game. */
export interface CelebrationBurst {
  at: number;
  seed: string;
  /** Home end stand (flares), px. */
  end: { x: number; y: number; w: number; h: number };
  /** Every stand band side (fireworks over the stands). */
  sky: { x: number; y: number; w: number; h: number }[];
  color: number;
  night: boolean;
}

export interface SmokePuff { x: number; y: number; r: number; alpha: number; color: number }
export interface FlareGlow { x: number; y: number; r: number; alpha: number }
export interface Spark { x: number; y: number; r: number; alpha: number; color: number }

/** Whole length of a burst, seconds (after this nothing of it is drawn). */
export function burstLength(b: CelebrationBurst): number {
  const flares = ATMOSPHERE.FLARES.BURN_S + ATMOSPHERE.FLARES.PUFF_LIFE_S;
  const fireworks = b.night ? ATMOSPHERE.FIREWORKS.EVERY_S * ATMOSPHERE.FIREWORKS.SHELLS + ATMOSPHERE.FIREWORKS.LIFE_S : 0;
  return Math.max(flares, fireworks);
}

const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number, sh: number) => (s >> sh) & 255;
  const one = (sh: number) => Math.round(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * t) << sh;
  return one(16) | one(8) | one(0);
};

/** Flares burning in the home end and the smoke they leave, at `now`. Pure: computed from the time alone. */
export function flareSmoke(b: CelebrationBurst, now: number): { glows: FlareGlow[]; puffs: SmokePuff[] } {
  const F = ATMOSPHERE.FLARES;
  const age = now - b.at;
  if (age < 0 || age > F.BURN_S + F.PUFF_LIFE_S) return { glows: [], puffs: [] };
  const rng = mulberry32(seedFrom(`flares:${b.seed}:${b.at.toFixed(3)}`));
  const unit = Math.max(5, Math.min(b.end.w, b.end.h) * 0.4);
  // The wind for this burst: smoke leans to one side and rises.
  const windX = (rng() - 0.5) * 2 * unit * 1.6;
  const windY = -unit * (1.2 + rng() * 0.8);
  const smokeColor = mix(b.color, 0xb8bec6, 0.55);
  const glows: FlareGlow[] = [];
  const puffs: SmokePuff[] = [];
  for (let i = 0; i < F.COUNT; i++) {
    const ox = b.end.x + b.end.w * (0.15 + 0.7 * rng());
    const oy = b.end.y + b.end.h * (0.15 + 0.7 * rng());
    const start = rng() * 0.8;
    const burn = age - start;
    if (burn >= 0 && burn <= F.BURN_S) {
      const flicker = 0.75 + 0.25 * Math.sin(now * 23 + i * 1.7);
      glows.push({ x: ox, y: oy, r: unit * 0.55, alpha: flicker * Math.min(1, (F.BURN_S - burn) / 0.6) });
    }
    const n = Math.floor(F.BURN_S / F.PUFF_EVERY_S);
    for (let k = 0; k < n; k++) {
      const pa = burn - k * F.PUFF_EVERY_S;
      if (pa < 0 || pa > F.PUFF_LIFE_S) continue;
      const life = pa / F.PUFF_LIFE_S;
      const jitter = ((k * 7919 + i * 104729) % 100) / 100 - 0.5;
      puffs.push({
        x: ox + windX * pa + jitter * unit,
        y: oy + windY * pa,
        r: unit * (0.6 + 2.4 * life),
        alpha: F.PUFF_ALPHA * (1 - life) * Math.min(1, pa / 0.3),
        color: smokeColor,
      });
    }
  }
  return { glows, puffs };
}

/** Fireworks over the stands at `now` (none by day). Pure. */
export function fireworks(b: CelebrationBurst, now: number): Spark[] {
  if (!b.night || b.sky.length === 0) return [];
  const W = ATMOSPHERE.FIREWORKS;
  const rng = mulberry32(seedFrom(`fireworks:${b.seed}:${b.at.toFixed(3)}`));
  const out: Spark[] = [];
  for (let s = 0; s < W.SHELLS; s++) {
    const area = b.sky[Math.floor(rng() * b.sky.length)]!;
    const cx = area.x + area.w * (0.1 + 0.8 * rng());
    const cy = area.y + area.h * (0.1 + 0.8 * rng());
    const radius = Math.max(22, Math.min(area.w, area.h) * (1.6 + rng() * 0.8));
    const pick = rng();
    const color = pick < 0.4 ? b.color : pick < 0.7 ? W.GOLD : W.WHITE;
    const age = now - b.at - s * W.EVERY_S;
    if (age < 0 || age > W.LIFE_S) continue;
    const life = age / W.LIFE_S;
    const spread = radius * (1 - (1 - life) ** 2);
    const drop = radius * 0.35 * life * life;
    for (let k = 0; k < W.SPARKS; k++) {
      const a = (k / W.SPARKS) * Math.PI * 2;
      out.push({
        x: cx + Math.cos(a) * spread,
        y: cy + Math.sin(a) * spread + drop,
        r: Math.max(1.6, radius * 0.065 * (1 - life * 0.5)),
        alpha: 1 - life,
        color,
      });
    }
  }
  return out;
}
