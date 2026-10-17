import { LIGHTING as L } from "@/GraficsEngine/pitchStyle";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";
import type { StadiumSun } from "@/Domain/matchday/stadiumSun";
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

/** One player shadow, relative to the marker centre, in marker radii (rotation in radians). */
export interface ShadowSpec { dx: number; dy: number; rx: number; ry: number; rotation: number; alpha: number }

export interface Lighting {
  warm: { color: number; alpha: number };
  dark: { color: number; alpha: number };
  veil: { color: number; alpha: number };
  /** 0..1: floodlights on (night glow in the corners, vignette). */
  flood: number;
  vignette: number;
  /** Stand shadow from the sun touchline: depth = fraction of the pitch width (74 yd). */
  stand: { side: "top" | "bottom"; depth: number; lean: number; alpha: number };
  /** Extra shadows of every player (the small contact shadow under the marker stays as it is). */
  shadows: ShadowSpec[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function matchLighting(input: { clock: number; sunset: number; weather: MatchWeather; sun: StadiumSun }): Lighting {
  const mins = input.clock - input.sunset;
  const golden = clamp01((mins - L.GOLDEN_FROM) / (L.DUSK_FROM - L.GOLDEN_FROM));
  const sunUp = clamp01((L.NIGHT_FROM - mins) / (L.NIGHT_FROM - L.DUSK_FROM));
  const flood = clamp01((mins - L.DUSK_FROM) / (L.NIGHT_FROM - L.DUSK_FROM));
  const sunShare = (L.SUN_BY_WEATHER as Record<string, number>)[input.weather] ?? 1;
  const sun = sunUp * sunShare;
  const veilAlpha = (L.VEIL.BY_WEATHER as Record<string, number>)[input.weather] ?? 0;

  const dir = input.sun.side === "top" ? 1 : -1; // shadows point away from the sun
  const shadows: ShadowSpec[] = [];
  if (sun > 0.01) {
    const len = L.SUN_SHADOW.LEN + (L.SUN_SHADOW.LEN_GOLDEN - L.SUN_SHADOW.LEN) * golden;
    const angle = Math.atan2(dir, -input.sun.lean * 0.6);
    shadows.push({
      dx: Math.cos(angle) * len * 0.5, dy: Math.sin(angle) * len * 0.5,
      rx: len * 0.5 + 0.5, ry: L.SUN_SHADOW.WIDTH, rotation: angle, alpha: L.SUN_SHADOW.ALPHA * sun,
    });
  }
  if (flood > 0.01) {
    for (const [ax, ay] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const angle = Math.atan2(ay, ax);
      shadows.push({
        dx: Math.cos(angle) * L.FLOOD_SHADOW.LEN * 0.5, dy: Math.sin(angle) * L.FLOOD_SHADOW.LEN * 0.5,
        rx: L.FLOOD_SHADOW.LEN * 0.5 + 0.4, ry: L.FLOOD_SHADOW.WIDTH, rotation: angle, alpha: L.FLOOD_SHADOW.ALPHA * flood,
      });
    }
  }
  return {
    warm: { color: L.WARM.COLOR, alpha: L.WARM.MAX * golden * sun },
    dark: { color: L.NIGHT.COLOR, alpha: L.NIGHT.MAX * flood },
    veil: { color: L.VEIL.COLOR, alpha: veilAlpha },
    flood,
    vignette: L.NIGHT.VIGNETTE * flood,
    stand: {
      side: input.sun.side,
      depth: L.STAND.MIN_DEPTH + (L.STAND.MAX_DEPTH - L.STAND.MIN_DEPTH) * golden,
      lean: input.sun.lean * L.STAND.LEAN,
      alpha: L.STAND.ALPHA * sun,
    },
    shadows,
  };
}
