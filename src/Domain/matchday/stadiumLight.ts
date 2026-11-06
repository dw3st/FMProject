/**
 * The stadium's floodlights by the Structure and lighting item (4.47.21, mock approved): its level sets how strong and
 * how warm the light is (weak and yellowish at 1, strong and white at 10); below 40% condition one tower is dark and
 * the stands look grimy, below 15% two towers. An AI club has the level of its tier, never worn. Drawing only. Pure.
 */
import { mulberry32, seedFrom, shuffle } from "@/Domain/rng";

export interface StadiumLight {
  /** Item level 1..10. */
  level: number;
  /** Item condition 0..100. */
  condition: number;
}

export const STADIUM_LIGHT = {
  AI_LEVEL: { LOW: 3, MEDIUM: 5, HIGH: 7, ELITE: 9 } as Record<string, number>,
  NEUTRAL_LEVEL: 7,
  WORN: 40,
  BROKEN: 15,
  /** Floodlight strength at level 1 and 10 (1 = the light drawn until 4.47.20). */
  GAIN: [0.6, 1.12] as const,
  /** Warmth at level 1 and 10: 1 = yellowish, 0 = neutral, below 0 = a cool white. */
  WARM: [1, -0.4] as const,
  /** Extra night darkness at level 1 (none at 10). */
  DARK: 0.16,
  /** Grime of the stands at 0% condition. */
  GRIME_MAX: 0.55,
} as const;

export interface LightLook {
  gain: number;
  warm: number;
  /** Tint of the light (0xRRGGBB): yellowish to cool white. */
  tint: number;
  /** Extra darkness over the pitch at night, 0..DARK. */
  dark: number;
  /** Indices (0..3, the order of `towerSpots`) of the dark towers. */
  off: number[];
  /** 0..GRIME_MAX. */
  grime: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mixColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const m = (s: number) => Math.round(lerp(ch(a, s), ch(b, s), t));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export function lightLook(light: StadiumLight | undefined, seed: string): LightLook {
  const L = STADIUM_LIGHT;
  const level = Math.max(1, Math.min(10, light?.level ?? L.NEUTRAL_LEVEL));
  const cond = Math.max(0, Math.min(100, light?.condition ?? 100));
  const t = (level - 1) / 9;
  const warm = lerp(L.WARM[0], L.WARM[1], t);
  const tint = warm >= 0 ? mixColor(0xffffff, 0xffd49a, warm) : mixColor(0xffffff, 0xdfe9ff, -warm / 0.4);
  const broken = cond < L.BROKEN ? 2 : cond < L.WORN ? 1 : 0;
  const rng = mulberry32(seedFrom(`towers-off:${seed}`));
  const order = shuffle([0, 1, 2, 3], rng);
  return {
    gain: lerp(L.GAIN[0], L.GAIN[1], t),
    warm,
    tint,
    dark: L.DARK * (1 - t),
    off: order.slice(0, broken).sort(),
    grime: cond < L.WORN ? L.GRIME_MAX * (L.WORN - cond) / L.WORN : 0,
  };
}

/** The light of an AI home club (or one without facility items): the level of its tier, in good condition. */
export function tierLight(tier: string | undefined): StadiumLight {
  return { level: STADIUM_LIGHT.AI_LEVEL[tier ?? "MEDIUM"] ?? 5, condition: 100 };
}
