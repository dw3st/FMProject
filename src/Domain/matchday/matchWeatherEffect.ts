import type { MatchWeather } from "@/Domain/matchday/matchConditions";

/** Weather of one match: the drawn one, whether a roof covered it, and what the match plays with. */
export interface WeatherOfMatch {
  weather: MatchWeather;
  covered: boolean;
  effective: MatchWeather;
}

/** Weathers a roof keeps out (heat and cold still count). */
const ROOF_STOPS = new Set<MatchWeather>(["rain", "snow", "wind"]);

/** The weather the match plays with: under a roof rain, snow and wind become `cloudy` (neutral). */
export function effectiveWeather(weather: MatchWeather, covered: boolean): MatchWeather {
  return covered && ROOF_STOPS.has(weather) ? "cloudy" : weather;
}

/** Weathers with an effect on the match (`WeatherConfig.ts`). */
const ACTIVE = new Set<MatchWeather>(["rain", "snow", "wind", "hot", "cold"]);

/** i18n key of the one-line effect text (preview, result); null = nothing to say. */
export function weatherEffectKey(w: WeatherOfMatch): string | null {
  if (w.covered && ROOF_STOPS.has(w.weather)) return "weatherEffect.covered";
  return ACTIVE.has(w.effective) ? `weatherEffect.${w.effective}` : null;
}
