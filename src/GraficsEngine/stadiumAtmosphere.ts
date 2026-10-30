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
  /**
   * Flares: per burst, how many in the home end (COUNT ± COUNT_JITTER), how long they burn, the smoke puffs each one
   * leaves. Each glow breathes slowly (its own rate within PULSE_HZ and size within SIZE) instead of a fast flicker.
   */
  FLARES: {
    COUNT: 5, COUNT_JITTER: 2, BURN_S: 7, PUFF_EVERY_S: 0.35, PUFF_LIFE_S: 5, PUFF_ALPHA: 0.32, GLOW: 0xff5a36,
    PULSE_HZ: [0.8, 2.2], SIZE: [0.42, 0.68],
  },
  /**
   * Fireworks (night only): SHELLS random shells per burst, GAP_S apart (random), each a rocket climbing for RISE_S
   * with a short trail, a soft flash, then round glowing sparks that spread, fall and fade. Every shell draws its own
   * style (peony, ring, willow, crackle), spark count, size, life and colours, so no two bursts look alike.
   */
  FIREWORKS: {
    SHELLS: [6, 11], GAP_S: [0.12, 0.7], RISE_S: [0.35, 0.6], RISE_FRAC: 2.4, TRAIL: 5, SPARKS: [14, 30],
    LIFE_S: [1.1, 1.9], FLASH_S: 0.14, FADE_FROM: 0.45, GRAVITY: 0.45, SPARK: 0.05, STREAK: 2, GLOW: 0.35,
    PALETTE: [0xff4d4d, 0xffd166, 0x5ad1ff, 0x7cff6b, 0xff7ad9, 0xffffff, 0xb18cff, 0xff9f43],
  },
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

export interface SmokePuff { x: number; y: number; r: number; alpha: number; color: number; /** Which smoke puff of the art pack (0..3). */ n: number }
export interface FlareGlow { x: number; y: number; r: number; alpha: number }
/** One round spark; `glow` (0..1) asks for a soft halo around it. */
export interface Spark { x: number; y: number; r: number; alpha: number; color: number; glow?: number }

/** Whole length of a burst, seconds (after this nothing of it is drawn). An upper bound for the random shells. */
export function burstLength(b: CelebrationBurst): number {
  const flares = ATMOSPHERE.FLARES.BURN_S + 1.6 + ATMOSPHERE.FLARES.PUFF_LIFE_S;
  const W = ATMOSPHERE.FIREWORKS;
  const fireworks = b.night ? W.GAP_S[1] * W.SHELLS[1] + W.RISE_S[1] + W.LIFE_S[1] * 1.25 : 0;
  return Math.max(flares, fireworks);
}

const between = (rng: () => number, [lo, hi]: readonly [number, number]) => lo + (hi - lo) * rng();
const smooth = (t: number) => t * t * (3 - 2 * t);

const mix = (a: number, b: number, t: number): number => {
  const ch = (s: number, sh: number) => (s >> sh) & 255;
  const one = (sh: number) => Math.round(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * t) << sh;
  return one(16) | one(8) | one(0);
};

/** Flares burning in the home end and the smoke they leave, at `now`. Pure: computed from the time alone. */
export function flareSmoke(b: CelebrationBurst, now: number): { glows: FlareGlow[]; puffs: SmokePuff[] } {
  const F = ATMOSPHERE.FLARES;
  const age = now - b.at;
  if (age < 0 || age > F.BURN_S + 1.6 + F.PUFF_LIFE_S) return { glows: [], puffs: [] };
  const rng = mulberry32(seedFrom(`flares:${b.seed}:${b.at.toFixed(3)}`));
  const unit = Math.max(5, Math.min(b.end.w, b.end.h) * 0.4);
  // The wind for this burst: smoke leans to one side and rises.
  const windX = (rng() - 0.5) * 2 * unit * 1.6;
  const windY = -unit * (1.2 + rng() * 0.8);
  const smokeColor = mix(b.color, 0xb8bec6, 0.55);
  const glows: FlareGlow[] = [];
  const puffs: SmokePuff[] = [];
  const count = F.COUNT - F.COUNT_JITTER + Math.floor(rng() * (F.COUNT_JITTER * 2 + 1));
  for (let i = 0; i < count; i++) {
    const ox = b.end.x + b.end.w * (0.15 + 0.7 * rng());
    const oy = b.end.y + b.end.h * (0.15 + 0.7 * rng());
    const start = rng() * 1.6;
    const hz = between(rng, F.PULSE_HZ), phase = rng() * Math.PI * 2, size = between(rng, F.SIZE);
    const burn = age - start;
    if (burn >= 0 && burn <= F.BURN_S) {
      // A slow breath plus a softer second wave: smooth, and never in step with the other flares.
      const w = Math.sin(burn * hz * Math.PI * 2 + phase) * 0.6 + Math.sin(burn * hz * 2.7 * Math.PI + phase * 1.3) * 0.4;
      const ignite = smooth(Math.min(1, burn / 0.5));
      const dying = smooth(Math.min(1, (F.BURN_S - burn) / 0.9));
      glows.push({ x: ox, y: oy, r: unit * size * (0.9 + 0.12 * w) * (0.6 + 0.4 * ignite), alpha: (0.82 + 0.18 * w) * ignite * dying });
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
        n: (k + i) % 4,
      });
    }
  }
  return { glows, puffs };
}

/** One exploded shell drawn with the art pack's firework atlas (art phase 9). */
export interface ShellSprite {
  /** 0 peony, 1 ring, 2 willow, 3 crackle (the atlas order). */
  style: number;
  x: number; y: number;
  /** Burst radius, px. */
  radius: number;
  color: number;
  alpha: number;
  /** Progress of the burst, 0..1 (the atlas frame). */
  t: number;
  rotation: number;
  flip: 1 | -1;
}

/**
 * Fireworks over the stands at `now` (none by day): random shells, each a rocket with a trail, a soft flash, then round
 * glowing sparks in its own style (peony, ring, willow, crackle) that spread, drop and fade out smoothly. Pure; the same
 * burst always draws the same shells.
 */
export function fireworks(b: CelebrationBurst, now: number, shellSprites?: ShellSprite[]): Spark[] {
  if (!b.night || b.sky.length === 0) return [];
  const W = ATMOSPHERE.FIREWORKS;
  const rng = mulberry32(seedFrom(`fireworks:${b.seed}:${b.at.toFixed(3)}`));
  const out: Spark[] = [];
  const shells = Math.round(between(rng, W.SHELLS));
  let launch = 0;
  for (let s = 0; s < shells; s++) {
    if (s > 0) launch += between(rng, W.GAP_S);
    const area = b.sky[Math.floor(rng() * b.sky.length)]!;
    const cx = area.x + area.w * (0.1 + 0.8 * rng());
    const cy = area.y + area.h * (0.1 + 0.8 * rng());
    const radius = Math.max(22, Math.min(area.w, area.h) * (1.2 + rng() * 1.2));
    const style = Math.floor(rng() * 4); // 0 peony, 1 ring, 2 willow, 3 crackle
    const outer = rng() < 0.35 ? b.color : W.PALETTE[Math.floor(rng() * W.PALETTE.length)]!;
    const inner = W.PALETTE[Math.floor(rng() * W.PALETTE.length)]!;
    const count = Math.round(between(rng, W.SPARKS) * (style === 2 ? 1.3 : 1));
    const rise = between(rng, W.RISE_S), life = between(rng, W.LIFE_S) * (style === 2 ? 1.25 : 1);
    const drift = (rng() - 0.5) * radius * 0.5;
    const gravity = W.GRAVITY * (style === 2 ? 2.4 : 0.7 + rng() * 0.6);
    const sparkR = Math.max(1.1, radius * W.SPARK * (0.8 + rng() * 0.5));
    // Every spark: its angle, speed, size and twinkle, drawn once per shell so the shape is stable frame to frame.
    const sparks = Array.from({ length: count }, (_, k) => ({
      ang: style === 1 ? (k / count) * Math.PI * 2 : rng() * Math.PI * 2,
      speed: style === 1 ? 0.95 + rng() * 0.05 : 0.45 + rng() * 0.55,
      size: 0.7 + rng() * 0.6,
      inner: rng() < 0.35,
      hz: 6 + rng() * 6, phase: rng() * Math.PI * 2,
    }));
    const age = now - b.at - launch;
    if (age < 0 || age > rise + life) continue;

    if (age < rise) {
      // The rocket climbs from below the burst point (eased, drifting a little), with a fading trail.
      const at = (t: number) => ({ x: cx - drift * (1 - t), y: cy + radius * W.RISE_FRAC * (1 - t) * (1 - t) });
      const t = age / rise;
      for (let k = 0; k < W.TRAIL; k++) {
        const p = at(Math.max(0, t - k * 0.05));
        out.push({ x: p.x, y: p.y, r: sparkR * (k === 0 ? 1 : 0.75 - k * 0.1), alpha: k === 0 ? 1 : 0.65 - k * 0.12,
          color: k === 0 ? 0xffffff : 0xffd166, glow: k === 0 ? W.GLOW : 0 });
      }
      continue;
    }

    const a = age - rise;
    const t = a / life;
    const fadeOut = 1 - smooth(Math.max(0, (t - W.FADE_FROM) / (1 - W.FADE_FROM)));
    if (shellSprites) {
      // The art pack's burst instead of the drawn sparks (same shell, same time); the flash stays drawn.
      if (a < W.FLASH_S) {
        const f = 1 - a / W.FLASH_S;
        out.push({ x: cx, y: cy, r: radius * 0.3 * (0.5 + 0.5 * f), alpha: 0.7 * f * f, color: 0xffffff, glow: 1 });
      }
      shellSprites.push({
        style, x: cx, y: cy + radius * gravity * t * t * 0.5, radius, color: outer, alpha: fadeOut, t,
        rotation: (s * 2.399) % (Math.PI * 2), flip: s % 2 === 0 ? 1 : -1,
      });
      continue;
    }
    if (a < W.FLASH_S) {
      const f = 1 - a / W.FLASH_S;
      out.push({ x: cx, y: cy, r: radius * 0.3 * (0.5 + 0.5 * f), alpha: 0.7 * f * f, color: 0xffffff, glow: 1 });
    }
    const fade = 1 - smooth(Math.max(0, (t - W.FADE_FROM) / (1 - W.FADE_FROM)));
    const pos = (sp: typeof sparks[number], tt: number) => {
      const spread = radius * sp.speed * (1 - (1 - tt) ** 3);
      return { x: cx + Math.cos(sp.ang) * spread, y: cy + Math.sin(sp.ang) * spread + radius * gravity * tt * tt };
    };
    for (const sp of sparks) {
      const twinkle = style === 3 && t > 0.35 ? 0.55 + 0.45 * Math.sin(a * sp.hz * Math.PI * 2 + sp.phase) : 1;
      const alpha = fade * twinkle;
      if (alpha <= 0.02) continue;
      const color = sp.inner ? inner : outer;
      const r = sparkR * sp.size * (1 - t * 0.4);
      // A short streak behind each spark keeps the motion smooth.
      for (let k = W.STREAK; k >= 1; k--) {
        const p = pos(sp, Math.max(0, t - k * 0.035));
        out.push({ x: p.x, y: p.y, r: r * (1 - k * 0.22), alpha: alpha * (0.45 - k * 0.12), color });
      }
      const p = pos(sp, t);
      out.push({ x: p.x, y: p.y, r, alpha, color, glow: W.GLOW });
    }
  }
  return out;
}
