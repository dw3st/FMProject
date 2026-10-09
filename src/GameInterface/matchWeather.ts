import type { MatchConditions, MatchWeather } from "@/Domain/matchday/matchConditions";
import type { IconName } from "@/GameInterface/Icons";

/**
 * Icons of the cosmetic match weather (`matchConditions`), shared by the dashboard's "Next match"
 * card, the match preview and the match result. Night matches swap the sun for the moon.
 */
const WEATHER_ICON: Record<MatchWeather, IconName> = {
  sunny: "sun",
  clear: "moon",
  partlyCloudy: "cloud-sun",
  cloudy: "cloud",
  rain: "cloud-rain",
  wind: "wind",
  cold: "thermometer-snowflake",
  snow: "snowflake",
  hot: "thermometer-sun",
};

export function weatherIconName({ weather, night }: Pick<MatchConditions, "weather" | "night">): IconName {
  if (night && weather === "partlyCloudy") return "cloud-moon";
  return WEATHER_ICON[weather];
}

/** i18n key of a weather label (`dashboard.home.weather.*`). */
export function weatherLabelKey(weather: MatchWeather): string {
  return `dashboard.home.weather.${weather}`;
}
