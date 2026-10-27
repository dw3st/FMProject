/**
 * Pure matching of our clubs to TheSportsDB teams (crests for clubs with no native or ESPN crest).
 * Used by scripts/fetchTheSportsDBBadges.ts.
 *
 * The free key's `searchteams.php` answers with a single "best" team, so a hit says nothing by itself:
 * the name must match. A team is kept only when one of our name variants and one of its names (strTeam
 * or an alternate) have exactly the same significant tokens.
 */
import { decodeHtmlEntities } from "@/../scripts/espn/normalize";

export interface TsdbTeam {
  idTeam: string;
  strTeam: string;
  strTeamAlternate?: string | null;
  strCountry?: string | null;
  strSport?: string | null;
  strGender?: string | null;
  strBadge?: string | null;
}

export interface BadgeClub { id: string; name: string; shortName?: string | null; country: string }

/** Our leagueData country → TheSportsDB strCountry spellings. */
const COUNTRY_ALIASES: Record<string, string[]> = {
  USA: ["USA", "United States"],
  "Czech Republic": ["Czech Republic", "Czechia"],
  Turkey: ["Turkey", "Türkiye"],
  "United Arab Emirates": ["United Arab Emirates", "UAE"],
  Russia: ["Russia", "Russian Federation"],
};

export function sameCountry(ours: string, theirs: string | null | undefined): boolean {
  if (!theirs) return false;
  const t = theirs.trim().toLowerCase();
  return (COUNTRY_ALIASES[ours] ?? [ours]).some((a) => a.toLowerCase() === t);
}

const TRANSLIT: Record<string, string> = { ø: "o", ł: "l", ß: "ss", æ: "ae", đ: "d", œ: "oe", þ: "th", ı: "i" };

/** Lower-case ASCII words, accents stripped, digits kept (unlike clubKey, which drops them). */
export function words(s: string): string[] {
  return decodeHtmlEntities(s).toLowerCase().replace(/[øłßæđœþı]/g, (c) => TRANSLIT[c] ?? c)
    .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length > 0);
}

/** Club-type tokens and connectors that never tell two clubs apart (clubKey's list plus more). */
const NOISE = new Set([
  "fc", "afc", "cf", "sc", "ac", "cd", "ca", "club", "sk", "fk", "bk", "if", "ssc", "sv", "as", "us",
  "sd", "ud", "rc", "rcd", "cr", "se", "ec", "the", "futbol", "football", "calcio", "clube",
  "pfk", "pfc", "nk", "hnk", "ks", "mfk", "ofk", "kf", "fks", "gks", "mks", "tj", "jk", "il", "ik", "ff", "ifk", "sfc", "ssd",
  "de", "del", "la", "el", "y", "e", "do", "da", "di", "and",
]);

/** Significant tokens: words without club-type tokens and connectors (years stay: "Levski 2020" is not "Levski"). */
export function coreTokens(s: string): string[] {
  return words(s).filter((t) => !NOISE.has(t));
}

const sameSet = (a: string[], b: string[]) => {
  const sa = new Set(a), sb = new Set(b);
  return sa.size > 0 && sa.size === sb.size && [...sa].every((t) => sb.has(t));
};

/** "of_ar_racing_de_cordoba" → "racing de cordoba" (the open-football seed's full club name); null otherwise. */
export function nameFromId(id: string): string | null {
  const m = /^of_[a-z]{2}_(.+)$/.exec(id);
  return m ? m[1]!.replace(/_/g, " ") : null;
}

/**
 * Our name variants. The id name of an of_* club is its full seed name ("Racing" is "racing de cordoba"):
 * a display name whose tokens are a strict subset of it is dropped, so a bare "Racing" never matches
 * another club's "Racing".
 */
export function ourVariants(club: BadgeClub): string[][] {
  const fromId = nameFromId(club.id);
  const idTokens = fromId ? coreTokens(fromId) : [];
  const out: string[][] = idTokens.length ? [idTokens] : [];
  for (const n of [club.name, club.shortName ?? ""]) {
    const t = coreTokens(n);
    if (t.length === 0) continue;
    const strictSubsetOfId = idTokens.length > t.length && t.every((x) => idTokens.includes(x));
    if (!strictSubsetOfId && !out.some((v) => sameSet(v, t))) out.push(t);
  }
  return out;
}

/** Search queries to try, in order (deduplicated, ≥ 3 characters). */
export function badgeQueries(club: BadgeClub): string[] {
  const cleaned = coreTokens(club.name).join(" ");
  const fromId = nameFromId(club.id);
  return [...new Set([club.name, club.shortName ?? "", fromId ?? "", cleaned].map((q) => q.trim()).filter((q) => q.length >= 3))];
}

function theirVariants(t: TsdbTeam): string[][] {
  const names = [t.strTeam, ...(t.strTeamAlternate ?? "").split(",")];
  return names.map((n) => coreTokens(n.trim())).filter((v) => v.length > 0);
}

/** Tokens that mark a reserve, youth or women's side. */
const SIDE_MARKERS = new Set(["ii", "iii", "b", "2", "u17", "u19", "u20", "u21", "u23", "women", "w", "reserves", "reserve", "youth", "academy", "akatemia", "feminino", "femenino", "femenil", "ladies"]);

/** strTeam marks a reserve/youth/women's side that our name does not. */
function isOtherSide(club: BadgeClub, t: TsdbTeam): boolean {
  const ours = new Set([club.name, club.shortName ?? "", nameFromId(club.id) ?? ""].flatMap(words));
  return words(t.strTeam).some((x) => SIDE_MARKERS.has(x) && !ours.has(x));
}

export type BadgePick = { team: TsdbTeam } | { skip: "none" | "ambiguous"; candidates: string[] };

/**
 * Pick the TheSportsDB team for one of our clubs from a search result: soccer, not a women's team, same
 * country, a badge, and a name with exactly the same significant tokens as one of ours. Several passing
 * teams → ambiguous.
 */
export function pickBadgeTeam(club: BadgeClub, teams: TsdbTeam[]): BadgePick {
  const ours = ourVariants(club);
  const pass = teams.filter((t) =>
    (t.strSport ?? "") === "Soccer" &&
    (t.strGender ?? "Male") !== "Female" &&
    sameCountry(club.country, t.strCountry) &&
    !!t.strBadge &&
    !isOtherSide(club, t) &&
    theirVariants(t).some((tv) => ours.some((ov) => sameSet(ov, tv))));
  const unique = [...new Map(pass.map((t) => [t.idTeam, t])).values()];
  if (unique.length === 1) return { team: unique[0]! };
  if (unique.length === 0) return { skip: "none", candidates: teams.map((t) => `${t.idTeam}:${t.strTeam}`) };
  return { skip: "ambiguous", candidates: unique.map((t) => `${t.idTeam}:${t.strTeam}`) };
}
