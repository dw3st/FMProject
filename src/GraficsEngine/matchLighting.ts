import { LIGHTING as L } from "@/GraficsEngine/pitchStyle";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import type { MatchPhase } from "@/GameEngine/types";

/**
 * Light of the live match (spec 2026-10-16-match-lighting): the time of the match from the kickoff and the match
 * clock, and what that time and the weather look like. Pure; drawing only.
 */

/** "HH:MM" -> minutes since midnight. */
export const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const HALF = 45;
const BREAK = 15;
const ET_BREAK = 5;
const ET_HALF = 15;

export interface ClockState {
  matchPhase: MatchPhase;
  matchTime: number;
  extraTimeFirst: number;
  extraTimeSecond: number;
  etStoppageFirst?: number;
}

/** Local time (minutes since midnight) of the match: kickoff + played time + breaks + stoppage. */
export function matchClockMinutes(s: ClockState, kickoff: number): number {
  const t = s.matchTime / 60;
  const ef = s.extraTimeFirst / 60;
  const es = s.extraTimeSecond / 60;
  const etf = (s.etStoppageFirst ?? 0) / 60;
  const secondStart = HALF + ef + BREAK;
  const regEnd = secondStart + HALF + es;
  switch (s.matchPhase) {
    case "preMatch": return kickoff;
    case "firstHalf": return kickoff + t;
    case "halfTime": return kickoff + HALF + ef;
    case "secondHalf": return kickoff + secondStart + t;
    case "extraTimeBreak": return kickoff + regEnd;
    case "extraTimeFirst": return kickoff + regEnd + ET_BREAK + t;
    case "extraTimeSecond": return kickoff + regEnd + ET_BREAK + ET_HALF + etf + t;
    default: return kickoff + regEnd + ET_BREAK + 2 * ET_HALF + etf;
  }
}

/**
 * One player shadow, in marker radii from the marker centre (`playerShadow.ts` draws it).
 * - `cast`: from the centre along `angle` (radians, 0 = +x, π/2 = +y), `length` long, half-width `width` at the
 *   feet tapering to `tip`.
 * - `contact`: an ellipse under the feet: centre `length` from the marker centre along `angle`, radii `width` × `tip`.
 */
export interface ShadowSpec {
  kind: "cast" | "contact";
  angle: number;
  length: number;
  width: number;
  tip: number;
  alpha: number;
}

export interface Lighting {
  warm: { color: number; alpha: number };
  dark: { color: number; alpha: number };
  veil: { color: number; alpha: number };
  /** 0..1: floodlights on (night glow in the corners, vignette). */
  flood: number;
  vignette: number;
  /**
   * Stadium shadow (`stadiumShadow.ts`): the side stand's depth as a fraction of the pitch width (74 yd), the end
   * stand's reach in yards (0 without an end shadow), how dark, and the warm light on the sunlit rest.
   */
  stand: { depth: number; endDepth: number; alpha: number; color: number; litAlpha: number };
  /** Closed roof: no rain or snow drawn. */
  covered: boolean;
  /** Every player's shadows: a soft contact shadow under the feet, plus the sun's or the floodlights' cast ones. */
  shadows: ShadowSpec[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function matchLighting(input: { clock: number; sunset: number; weather: MatchWeather; sun: StadiumSun }): Lighting {
  const mins = input.clock - input.sunset;
  const covered = input.sun.covered;
  const golden = clamp01((mins - L.GOLDEN_FROM) / (L.DUSK_FROM - L.GOLDEN_FROM));
  const sunUp = clamp01((L.NIGHT_FROM - mins) / (L.NIGHT_FROM - L.DUSK_FROM));
  const outsideFlood = clamp01((mins - L.DUSK_FROM) / (L.NIGHT_FROM - L.DUSK_FROM));
  // A covered stadium: no sun or weather on the pitch, the lights always on; the night outside only half as dark.
  const flood = covered ? Math.max(outsideFlood, L.COVERED.FLOOD) : outsideFlood;
  const night = covered ? outsideFlood * L.COVERED.NIGHT_SCALE : outsideFlood;
  const sunShare = covered ? 0 : (L.SUN_BY_WEATHER as Record<string, number>)[input.weather] ?? 1;
  const sun = sunUp * sunShare;
  const veilAlpha = covered ? 0 : (L.VEIL.BY_WEATHER as Record<string, number>)[input.weather] ?? 0;

  const dir = input.sun.side === "top" ? 1 : -1; // shadows point away from the sun
  const C = L.CONTACT_SHADOW;
  const shadows: ShadowSpec[] = [
    { kind: "contact", angle: C.ANGLE, length: C.OFFSET, width: C.RX, tip: C.RY, alpha: C.ALPHA },
  ];
  if (sun > 0.01) {
    const S = L.SUN_SHADOW;
    shadows.push({
      // Never straight down the marker: the sun is always a little to one side (by the stadium's lean).
      kind: "cast", angle: Math.atan2(dir, (input.sun.lean >= 0 ? -1 : 1) * (S.SIDE + S.SIDE * Math.abs(input.sun.lean))),
      length: S.LEN + (S.LEN_GOLDEN - S.LEN) * golden, width: S.WIDTH, tip: S.TIP, alpha: S.ALPHA * sun,
    });
  }
  if (flood > 0.01) {
    const F = L.FLOOD_SHADOW;
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      shadows.push({ kind: "cast", angle: Math.atan2(ay, ax), length: F.LEN, width: F.WIDTH, tip: F.TIP, alpha: F.ALPHA * flood });
    }
  }
  const depth = Math.min(L.STAND.MAX_SHARE, (L.STAND.MIN_DEPTH + (L.STAND.MAX_DEPTH - L.STAND.MIN_DEPTH) * golden) * input.sun.height);
  return {
    warm: { color: L.WARM.COLOR, alpha: L.WARM.MAX * golden * sun },
    dark: { color: L.NIGHT.COLOR, alpha: L.NIGHT.MAX * night },
    veil: { color: L.VEIL.COLOR, alpha: veilAlpha },
    flood: night,
    vignette: L.NIGHT.VIGNETTE * night,
    stand: {
      depth,
      endDepth: input.sun.endShadow
        ? input.sun.endDepth * PITCH_LENGTH * (L.STAND.END_DAY + (1 - L.STAND.END_DAY) * golden) * input.sun.height
        : 0,
      alpha: L.STAND.ALPHA * sun,
      color: L.STAND.COLOR,
      litAlpha: L.STAND.LIT.ALPHA * sun,
    },
    covered,
    shadows,
  };
}
