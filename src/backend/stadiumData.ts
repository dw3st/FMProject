import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hhmm, sunsetUtcMinutes, utcOffsetMinutes } from "@/Domain/matchday/solar";
import { stadiumIdOf, stadiumSun, type RealStadium, type StadiumSun } from "@/Domain/matchday/stadiumSun";
import { matchConditions, type MatchWeather } from "@/Domain/matchday/matchConditions";
import { effectiveWeather, type WeatherOfMatch } from "@/Domain/matchday/matchWeatherEffect";

/**
 * Real stadiums of the main leagues (4.31, `bun scripts/fetchStadiums.ts`): world data, read once from
 * `src/Data/stadiums.json` (squadId → stadium). Missing file or club = the stadium drawn from its id.
 */
const FILE = fileURLToPath(new URL("../Data/stadiums.json", import.meta.url));
let stadiums: Record<string, RealStadium> | null = null;
export function realStadiumOf(squadId: string): RealStadium | undefined {
  if (!stadiums) {
    try { stadiums = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, RealStadium>; } catch { stadiums = {}; }
  }
  return Object.hasOwn(stadiums, squadId) ? stadiums[squadId] : undefined;
}

/** A retractable roof is closed in rain, snow and the cold. */
const ROOF_CLOSED_IN = new Set<MatchWeather>(["rain", "snow", "cold"]);

/**
 * The sun over a match's ground and the sunset there: a real stadium (unique id `std_<Wikidata item>`, the real
 * sunset for the date) or the profile drawn from the venue's id. Neutral venues are never real.
 */
export function matchSun(
  home: { id: string; venue?: { name?: string; city?: string } | null }, neutralFixtureId: string | undefined,
  date: string | undefined, weather: MatchWeather,
): { sun: StadiumSun; sunset: string | null } {
  const real = neutralFixtureId ? undefined : realStadiumOf(home.id);
  if (!real) return { sun: stadiumSun(stadiumIdOf(home, neutralFixtureId)), sunset: null };
  const covered = real.roof === "closed" || (real.roof === "retractable" && ROOF_CLOSED_IN.has(weather));
  const sun: StadiumSun = { ...stadiumSun(real.id), stadiumId: real.id, covered, real };
  const set = date ? sunsetUtcMinutes(real.lat, real.lon, date) : null;
  return { sun, sunset: set !== null && date ? hhmm(set + utcOffsetMinutes(real.tzStd, real.dst, date)) : null };
}

/**
 * The weather a match is played with (`.claude/rules/game/weather.md`): `matchConditions` (the preview's), the roof
 * of the stadium the light draws (`matchSun`), and the effective weather. A neutral venue has no weather effect.
 */
export function matchWeatherOf(
  fixture: { id: string; date: string; home: string; away: string; competition?: string; neutral?: boolean },
  home: { id: string; country?: string | null; venue?: { name?: string; city?: string } | null },
): WeatherOfMatch {
  // A neutral venue keeps the drawn weather (the preview shows it) but plays without its effect.
  if (fixture.neutral) return { weather: matchConditions(fixture, null).weather, covered: false, effective: "sunny" };
  const c = matchConditions(fixture, home.country ?? null);
  const { sun } = matchSun(home, undefined, fixture.date, c.weather);
  return { weather: c.weather, covered: sun.covered, effective: effectiveWeather(c.weather, sun.covered) };
}
