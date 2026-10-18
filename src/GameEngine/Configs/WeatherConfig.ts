import type { MatchWeather } from "@/Domain/matchday/matchConditions";

/**
 * Weather of a match in the engine (`.claude/rules/game/weather.md`): the effective weather (after the stadium
 * roof). `wind_rain` exists only in `/test` (wind and rain together).
 */
export type EngineWeather = MatchWeather | "wind_rain";

/** Multipliers a weather applies on levers the engine already has. 1 = no change. */
export interface WeatherEffect {
  /** First-touch control of a high ball (`highBallControlChance`). */
  control: number;
  /** Loose-ball deceleration (`LOOSE_BALL_DECELERATION`): < 1 the ball skids further, > 1 it stops sooner. */
  looseDecel: number;
  /** Loose-ball initial speed (`LOOSE_BALL_INITIAL_SPEED`). */
  looseSpeed: number;
  /** Carry speed of the ball carrier. */
  carrySpeed: number;
  /** Landing error of crosses and long balls (σ). */
  aerialError: number;
  /** Keeper claim chance on a high ball (`gkClaimChance`). */
  gkClaim: number;
  /** Goal chance of a shot from beyond `LONG_SHOT_DISTANCE` yards. */
  longShot: number;
  /** Energy drain on the pitch (`consumeEnergy`). */
  drain: number;
  /** Injury risk per minute and per contact. */
  injury: number;
}

/** Distance (yards from the goal line) beyond which a shot is a long shot (outside the box). */
export const LONG_SHOT_DISTANCE = 18;

export const NEUTRAL_WEATHER: Readonly<WeatherEffect> = Object.freeze({
  control: 1, looseDecel: 1, looseSpeed: 1, carrySpeed: 1, aerialError: 1, gkClaim: 1, longShot: 1, drain: 1, injury: 1,
});

/**
 * Effects per weather (spec 2026-10-18 §2; tuned by `scripts/weather-measure.ts`). Mutable on purpose: the
 * measurement script patches it in process (`WEATHER_OVERRIDES`). Weathers not listed are neutral.
 */
export const WEATHER_EFFECTS: Partial<Record<MatchWeather, Partial<WeatherEffect>>> = {
  rain: { control: 0.92, looseDecel: 0.7, gkClaim: 0.9 },
  snow: { looseDecel: 1.2, looseSpeed: 0.9, carrySpeed: 0.95, control: 0.94 },
  wind: { aerialError: 3, longShot: 0.95 },
  hot: { drain: 1.08 },
  cold: { injury: 1.1 },
};

function effectOf(w: MatchWeather): WeatherEffect {
  return { ...NEUTRAL_WEATHER, ...WEATHER_EFFECTS[w] };
}

/** The multipliers of a weather; absent / neutral = all 1. */
export function weatherEffectOf(weather: EngineWeather | null | undefined): WeatherEffect {
  if (!weather) return { ...NEUTRAL_WEATHER };
  if (weather === "wind_rain") {
    const a = effectOf("wind");
    const b = effectOf("rain");
    const out = { ...NEUTRAL_WEATHER };
    for (const k of Object.keys(out) as (keyof WeatherEffect)[]) out[k] = a[k] * b[k];
    return out;
  }
  return effectOf(weather);
}

/** True when the weather changes nothing in the engine. */
export function isNeutralWeather(weather: EngineWeather | null | undefined): boolean {
  const e = weatherEffectOf(weather);
  return (Object.keys(e) as (keyof WeatherEffect)[]).every((k) => e[k] === 1);
}
