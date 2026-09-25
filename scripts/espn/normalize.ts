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
