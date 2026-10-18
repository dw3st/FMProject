/**
 * Cosmetic match-day details for the dashboard's "Next match" card and the light of the live match
 * (kickoff time, weather, sunset). Derived deterministically from the fixture (same fixture, same answer). The weather plays
 * since 4.32 (`.claude/rules/game/weather.md`); kickoff and sunset stay cosmetic. Pure, no I/O.
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

type Slots = [string, number][];
/**
 * Typical local kickoffs per country (4.32): Saturday, Sunday (and Friday / Monday) and midweek, weighted by how
 * often each slot is used. Not the real fixture list: the usual times of each league, so a real stadium's sun falls
 * where it would. Countries not listed use the generic slots above.
 */
const COUNTRY_KICKOFFS: Record<string, { sat: Slots; sun: Slots; mid: Slots }> = {
  England: {
    sat: [["12:30", 2], ["15:00", 5], ["17:30", 2], ["20:00", 1]],
    sun: [["14:00", 3], ["16:30", 3]],
    mid: [["19:30", 3], ["19:45", 2], ["20:00", 3]],
  },
  Spain: {
    sat: [["14:00", 1], ["16:15", 2], ["18:30", 2], ["21:00", 3]],
    sun: [["14:00", 1], ["16:15", 2], ["18:30", 2], ["21:00", 3]],
    mid: [["19:00", 1], ["21:00", 3], ["21:30", 1]],
  },
  Italy: {
    sat: [["15:00", 2], ["18:00", 2], ["20:45", 3]],
    sun: [["12:30", 1], ["15:00", 3], ["18:00", 2], ["20:45", 3]],
    mid: [["18:30", 1], ["20:45", 3]],
  },
  Germany: {
    sat: [["15:30", 5], ["18:30", 2]],
    sun: [["15:30", 2], ["17:30", 2], ["19:30", 1]],
    mid: [["18:30", 1], ["20:30", 3]],
  },
  France: {
    sat: [["17:00", 2], ["19:00", 2], ["21:00", 2]],
    sun: [["13:00", 1], ["15:00", 2], ["17:15", 2], ["20:45", 2]],
    mid: [["19:00", 1], ["21:00", 3]],
  },
  Portugal: {
    sat: [["15:30", 1], ["18:00", 2], ["20:30", 2]],
    sun: [["15:30", 2], ["18:00", 2], ["20:30", 2]],
    mid: [["19:00", 1], ["20:15", 2], ["21:15", 2]],
  },
  Netherlands: {
    sat: [["16:30", 1], ["18:45", 2], ["20:00", 2], ["21:00", 1]],
    sun: [["12:15", 2], ["14:30", 3], ["16:45", 2], ["20:00", 1]],
    mid: [["18:45", 1], ["20:00", 2], ["21:00", 2]],
  },
  Brazil: {
    sat: [["16:00", 2], ["18:30", 2], ["21:00", 2]],
    sun: [["11:00", 1], ["16:00", 3], ["18:30", 2], ["20:30", 1]],
    mid: [["19:00", 1], ["19:30", 2], ["21:30", 3]],
  },
  Argentina: {
    sat: [["15:00", 1], ["17:00", 2], ["19:15", 2], ["21:30", 2]],
    sun: [["15:00", 1], ["17:00", 2], ["19:15", 2], ["21:30", 2]],
    mid: [["19:00", 2], ["21:15", 2]],
  },
  USA: {
    sat: [["16:00", 1], ["19:30", 5], ["20:30", 1]],
    sun: [["14:00", 1], ["18:00", 1], ["19:00", 1]],
    mid: [["19:30", 3], ["20:00", 1]],
  },
};

/** European continental nights: 18:45 / 21:00 CET, an hour earlier in England and Portugal. */
const EUROPE_NIGHT: Slots = [["18:45", 1], ["21:00", 3]];
const EUROPE_NIGHT_WET: Slots = [["17:45", 1], ["20:00", 3]];
const SOUTH_AMERICA_NIGHT: Slots = [["19:00", 1], ["21:30", 3]];

/** The weighted slots a fixture draws its kickoff from. */
export function kickoffSlots(date: string, country: string | null | undefined, competition?: string): Slots {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (competition === "ucl" || competition === "uel") {
    return country === "England" || country === "Portugal" ? EUROPE_NIGHT_WET : EUROPE_NIGHT;
  }
  if (competition === "lib" || competition === "sud") return SOUTH_AMERICA_NIGHT;
  const table = country ? COUNTRY_KICKOFFS[country] : undefined;
  if (!table) return (day === 0 || day === 6 ? WEEKEND_KICKOFFS : WEEKDAY_KICKOFFS).map((k) => [k, 1]);
  if (day === 6) return table.sat;
  if (day === 0) return table.sun;
  // Friday and Monday nights take the midweek slots.
  return table.mid;
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
  /** Local sunset "HH:MM" of that day (`SUNSET` by season or climate); `night` = kickoff >= sunset. */
  sunset: string;
}

/**
 * Kickoff time and weather for a fixture. Same `{ date, home, away }` → same answer.
 * The kickoff follows the home country's usual slots (`kickoffSlots`; generic weekend / weekday slots elsewhere,
 * continental nights by competition); the weather follows the
 * month and the home country's climate (winter in July in the south, no winter in the tropics).
 * After sunset sun and heat become a clear sky; the draw itself is the same as by day.
 */
export function matchConditions(
  fixture: { date: string; home: string; away: string; competition?: string },
  homeCountry?: string | null,
): MatchConditions {
  const rng = mulberry32(seedFrom(`${fixture.date}:${fixture.home}:${fixture.away}:conditions`));
  const kickoff = pickWeighted(kickoffSlots(fixture.date, homeCountry, fixture.competition), rng());
  const climate = climateOf(homeCountry);
  const month = Number(fixture.date.slice(5, 7));
  const key = climate === "tropical" || climate === "arid" ? climate : seasonOf(month, climate);
  const drawn = pickWeighted(WEATHER[key], rng());
  const night = kickoff >= SUNSET[key];
  return { kickoff, weather: night ? (NIGHT_WEATHER[drawn] ?? drawn) : drawn, night, sunset: SUNSET[key] };
}
