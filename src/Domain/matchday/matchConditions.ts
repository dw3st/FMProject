/**
 * Cosmetic match-day details for the dashboard's "Next match" card: kickoff time and weather.
 * Neither exists in the simulation — they are derived deterministically from the fixture (same
 * fixture, same answer) and have no effect on any match. Pure, no I/O.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export type MatchWeather =
  | "sunny" | "clear" | "partlyCloudy" | "cloudy" | "rain" | "wind" | "cold" | "snow" | "hot";

/** Rough climate of the home country: which months are winter, or none at all. */
export type Climate = "north" | "south" | "tropical" | "arid";

type Season = "winter" | "spring" | "summer" | "autumn";

const SOUTH = new Set(["Brazil", "Argentina", "Uruguay", "Chile", "Paraguay", "South Africa", "Australia"]);
const TROPICAL = new Set([
  "Colombia", "Venezuela", "Peru", "Kenya", "Nigeria", "Ghana", "Cameroon", "Indonesia", "Fiji",
]);
const ARID = new Set(["Saudi Arabia", "United Arab Emirates", "Egypt", "Algeria"]);

/** Climate from the country name as written in `leagueData`/squads (`"England"`, `"Brazil"`). */
export function climateOf(country: string | null | undefined): Climate {
  if (!country) return "north";
  if (SOUTH.has(country)) return "south";
  if (TROPICAL.has(country)) return "tropical";
  if (ARID.has(country)) return "arid";
  return "north";
}

function seasonOf(month: number, climate: "north" | "south"): Season {
  const m = climate === "south" ? ((month + 5) % 12) + 1 : month; // shift by six months
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

/** Weighted weather table per season (or per climate without seasons). */
const WEATHER: Record<Season | "tropical" | "arid", [MatchWeather, number][]> = {
  winter: [["sunny", 1], ["partlyCloudy", 2], ["cloudy", 3], ["rain", 3], ["wind", 2], ["cold", 3], ["snow", 1]],
  spring: [["sunny", 3], ["partlyCloudy", 3], ["cloudy", 2], ["rain", 2], ["wind", 1]],
  summer: [["sunny", 5], ["partlyCloudy", 3], ["cloudy", 1], ["rain", 1], ["hot", 2]],
  autumn: [["sunny", 2], ["partlyCloudy", 2], ["cloudy", 3], ["rain", 3], ["wind", 2]],
  tropical: [["sunny", 3], ["partlyCloudy", 3], ["hot", 3], ["cloudy", 1], ["rain", 3]],
  arid: [["sunny", 6], ["hot", 4], ["partlyCloudy", 1], ["wind", 1]],
};

/**
 * Approximate local sunset ("HH:MM") per season, or per climate without seasons. A kickoff at or
 * after it is a night match: no sun, no heat (see `NIGHT_WEATHER`).
 */
export const SUNSET: Record<Season | "tropical" | "arid", string> = {
  summer: "20:30",
  spring: "19:00",
  autumn: "19:00",
  winter: "17:30",
  tropical: "18:30",
  arid: "18:30",
};

/** What a daytime draw becomes after dark. Anything not listed stays the same. */
const NIGHT_WEATHER: Partial<Record<MatchWeather, MatchWeather>> = {
  sunny: "clear",
  hot: "clear",
};

const WEEKEND_KICKOFFS = ["13:30", "15:00", "16:00", "17:30", "18:30", "20:00"];
const WEEKDAY_KICKOFFS = ["19:00", "19:45", "20:00", "20:45", "21:30"];

function pick<T>(items: readonly T[], r: number): T {
  return items[Math.min(items.length - 1, Math.floor(r * items.length))]!;
}

function pickWeighted<T>(items: readonly [T, number][], r: number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [v, w] of items) {
    if (x < w) return v;
    x -= w;
  }
  return items[items.length - 1]![0];
}

export interface MatchConditions {
  /** "HH:MM", local time of the home ground. */
  kickoff: string;
  weather: MatchWeather;
  /** Kickoff at or after sunset (`SUNSET`): the screens show night icons (moon). */
  night: boolean;
}

/**
 * Kickoff time and weather for a fixture. Same `{ date, home, away }` → same answer.
 * Weekends draw from afternoon/evening slots, weekdays from evening slots; the weather follows the
 * month and the home country's climate (winter in July in the south, no winter in the tropics).
 * After sunset sun and heat become a clear sky; the draw itself is the same as by day.
 */
export function matchConditions(
  fixture: { date: string; home: string; away: string },
  homeCountry?: string | null,
): MatchConditions {
  const rng = mulberry32(seedFrom(`${fixture.date}:${fixture.home}:${fixture.away}:conditions`));
  const day = new Date(`${fixture.date}T00:00:00Z`).getUTCDay();
  const weekend = day === 0 || day === 6;
  const kickoff = pick(weekend ? WEEKEND_KICKOFFS : WEEKDAY_KICKOFFS, rng());
  const climate = climateOf(homeCountry);
  const month = Number(fixture.date.slice(5, 7));
  const key = climate === "tropical" || climate === "arid" ? climate : seasonOf(month, climate);
  const drawn = pickWeighted(WEATHER[key], rng());
  const night = kickoff >= SUNSET[key];
  return { kickoff, weather: night ? (NIGHT_WEATHER[drawn] ?? drawn) : drawn, night };
}
