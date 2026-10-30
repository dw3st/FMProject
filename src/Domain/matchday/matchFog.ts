/**
 * Fog of the match (art phase 9): drawing only. The weather already plays (`matchConditions`, 4.32), so fog is not a
 * new weather: a share of the overcast and cold matches is drawn foggy, picked by the match seed. Nothing in the
 * engine or the quickSim reads it. A covered stadium has no fog.
 */
import { seedFrom } from "@/Domain/rng";
import type { MatchWeather } from "@/Domain/matchday/matchConditions";

export const MATCH_FOG = {
  /** Weathers that can come with fog, and the share of them that does. */
  WEATHERS: ["cloudy", "cold"] as readonly string[],
  SHARE: 0.3,
} as const;

/** Whether the match is drawn foggy. */
export function matchHasFog(weather: MatchWeather | "wind_rain" | null | undefined, seed: string, covered = false): boolean {
  if (covered || !weather || !MATCH_FOG.WEATHERS.includes(weather)) return false;
  return (seedFrom(`fog:${seed}`) % 1000) / 1000 < MATCH_FOG.SHARE;
}
