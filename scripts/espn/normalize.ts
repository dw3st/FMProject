import { nationalityFlagCode } from "@/Domain/world/nationalityFlag";
import { normName } from "@/../scripts/openfootball/ids";

/** Named HTML entities that show up in native world data (e.g. "M. O&apos;Riley"). */
const HTML_ENTITIES: Record<string, string> = {
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&amp;": "&",
};

export function decodeHtmlEntities(s: string): string {
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
 * ESPN stores some Turkish names with the tail of a word upper-cased right after a dotless
 * `ı` ("BahadıR", "AlkıS") — the classic i/İ casing bug. Lowercase (Turkish locale) any run of
 * capitals that directly follows a lowercase `ı` inside a word.
 */
export function fixNameCasing(name: string | null | undefined): string {
  if (!name) return "";
  return name.replace(/ı(\p{Lu}+)/gu, (_m, caps: string) => "ı" + caps.toLocaleLowerCase("tr"));
}

/**
 * ESPN citizenship spellings (lowercased) → this world's nationality convention, the spelling the
 * squads of `src/example_data/squads` use ("United States", "DR Congo", "Côte d’Ivoire"…). Only
 * synonyms are listed — adjectives ("Italian", "French") are deliberately NOT mapped, so they fall
 * through and get rejected by `normalizeNationality`. Until #143 several targets were ESPN's own
 * spellings ("USA", "Congo DR"), which the world doesn't use: those players lost their nationality.
 */
const NATIONALITY_ALIASES: Record<string, string> = {
  "usa": "United States",
  "united states": "United States",
  "ireland": "Ireland",
  "united states of america": "United States",
  "republic of ireland": "Ireland",
  "korea republic": "South Korea",
  "republic of korea": "South Korea",
  "korea, south": "South Korea",
  "korea dpr": "North Korea",
  "korea, north": "North Korea",
  "czech republic": "Czechia",
  "turkey": "Türkiye",
  "cape verde islands": "Cape Verde",
  "cabo verde": "Cape Verde",
  "congo dr": "DR Congo",
  "democratic republic of congo": "DR Congo",
  "democratic republic of the congo": "DR Congo",
  "congo": "Congo - Brazzaville",
  "republic of the congo": "Congo - Brazzaville",
  "congo republic": "Congo - Brazzaville",
  "swaziland": "Eswatini",
  "macedonia": "North Macedonia",
  "fyr macedonia": "North Macedonia",
  "bosnia": "Bosnia & Herzegovina",
  "bosnia and herzegovina": "Bosnia & Herzegovina",
  "trinidad and tobago": "Trinidad & Tobago",
  "st vincent and the grenadines": "St. Vincent & Grenadines",
  "st. vincent and the grenadines": "St. Vincent & Grenadines",
  "saint vincent and the grenadines": "St. Vincent & Grenadines",
  "ivory coast": "Côte d’Ivoire",
  "cote d'ivoire": "Côte d’Ivoire",
  "côte d'ivoire": "Côte d’Ivoire",
  "st kitts and nevis": "St. Kitts & Nevis",
  "st. kitts and nevis": "St. Kitts & Nevis",
  "saint kitts and nevis": "St. Kitts & Nevis",
  "st lucia": "St. Lucia",
  "saint lucia": "St. Lucia",
  "comoros islands": "Comoros",
  "palestine": "Palestinian Territories",
};

/**
 * Maps an ESPN `citizenship` value onto this world's nationality convention. Returns `null` for
 * `null`/empty input and for any value that isn't (after alias mapping) a country — one already in
 * the world or one the game has a flag for (`nationalityFlagCode`, #143: a country no squad had
 * before the import, like Wales or Kosovo, is still a country). This rejects adjective forms
 * ("Italian", "French") and typos alike, rather than guessing. Callers should keep the previous
 * nationality (matched players) or leave it unset (new players) when this returns `null`.
 */
export function normalizeNationality(espn: string | null, worldNames: ReadonlySet<string>): string | null {
  if (!espn) return null;
  const trimmed = espn.trim();
  if (!trimmed) return null;
  const candidate = NATIONALITY_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  return worldNames.has(candidate) || nationalityFlagCode(candidate) ? candidate : null;
}
