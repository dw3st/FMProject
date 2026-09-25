import { normName } from "@/../scripts/openfootball/ids";

/** Named HTML entities that show up in native world data (e.g. "M. O&apos;Riley"). */
const HTML_ENTITIES: Record<string, string> = {
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&amp;": "&",
};

function decodeHtmlEntities(s: string): string {
  return s.replace(/&(?:apos|#39|quot|amp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

/** Club-type tokens that never tell two clubs apart. */
const CLUB_NOISE = new Set([
  "fc", "afc", "cf", "sc", "ac", "cd", "ca", "club", "sk", "fk", "bk", "if", "ssc", "sv", "as", "us",
  "sd", "ud", "rc", "rcd", "cr", "se", "ec", "the", "futbol", "football", "calcio", "clube",
]);
/** Suffixes dropped only by the loose key (a match on it must still be unique). */
const LOOSE_NOISE = new Set(["city", "united", "town", "wanderers", "rovers", "county", "albion", "hotspur"]);

const tokens = (s: string) => normName(decodeHtmlEntities(s)).split(" ").filter((t) => t.length > 0);

export function clubKey(name: string): string {
  return tokens(name).filter((t) => !CLUB_NOISE.has(t)).join(" ");
}

export function looseClubKey(name: string): string {
  return clubKey(name).split(" ").filter((t) => t && !LOOSE_NOISE.has(t)).join(" ");
}

export function playerKey(name: string): string {
  return normName(decodeHtmlEntities(name));
}

/**
 * Known ESPN citizenship spellings that differ from this world's nationality convention
 * (see the `nationality` values already present in `src/example_data/squads`). Keyed by the
 * lowercased ESPN value; only synonyms are listed here — adjectives ("Italian", "French") are
 * deliberately NOT mapped, so they fall through and get rejected by `normalizeNationality`.
 */
const NATIONALITY_ALIASES: Record<string, string> = {
  "united states": "USA",
  "united states of america": "USA",
  "ireland": "Republic of Ireland",
  "korea republic": "South Korea",
  "republic of korea": "South Korea",
  "korea, south": "South Korea",
  "korea dpr": "North Korea",
  "korea, north": "North Korea",
  "north korea": "North Korea",
  "czech republic": "Czechia",
  "turkey": "Türkiye",
  "cape verde": "Cape Verde Islands",
  "cabo verde": "Cape Verde Islands",
  "dr congo": "Congo DR",
  "democratic republic of congo": "Congo DR",
  "democratic republic of the congo": "Congo DR",
  "republic of the congo": "Congo",
  "congo republic": "Congo",
  "swaziland": "Eswatini",
  "macedonia": "North Macedonia",
  "fyr macedonia": "North Macedonia",
  "bosnia": "Bosnia and Herzegovina",
  "cote d'ivoire": "Ivory Coast",
  "côte d'ivoire": "Ivory Coast",
  "st. kitts and nevis": "St Kitts and Nevis",
  "saint kitts and nevis": "St Kitts and Nevis",
  "st. lucia": "St Lucia",
  "saint lucia": "St Lucia",
};

/**
 * Maps an ESPN `citizenship` value onto this world's nationality convention. Returns `null` for
 * `null`/empty input and for any value that isn't (after alias mapping) a country already known
 * to the world — this rejects adjective forms ("Italian", "French") and typos alike, rather than
 * guessing. Callers should keep the previous nationality (matched players) or leave it unset (new
 * players) when this returns `null`.
 */
export function normalizeNationality(espn: string | null, worldNames: ReadonlySet<string>): string | null {
  if (!espn) return null;
  const trimmed = espn.trim();
  if (!trimmed) return null;
  const candidate = NATIONALITY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  return worldNames.has(candidate) ? candidate : null;
}
