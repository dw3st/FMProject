import { mulberry32, seedFrom } from "@/Domain/rng";

/**
 * How the sun falls on a stadium (spec 2026-10-16-match-lighting; per stadium since 4.30). Drawing only.
 *
 * Every stadium has a unique id (`stadiumIdOf`: the venue's name and city, so two clubs sharing a ground share its
 * shadow) and a profile drawn from that id: the same stadium always looks the same. Not real orientations.
 * - `side`: which touchline the stand that casts the shadow is on (engine yards: "top" = y 0, "bottom" = y 74).
 * - `lean`: the sun's tilt toward one end (-1 = the x 0 end, +1 = the x 115 end).
 * - `covered`: a closed roof: no sunlight on the pitch, no rain or snow, the lights always on.
 * - `height`: how tall the stand is (multiplies the shadow depth).
 * - `cut`: where the shadow's edge turns toward the touchline (the end of the stand / roof): at the end the sun leans
 *   toward, at both ends or nowhere (a stand running the whole length). `cutX` yards from the end, ending at
 *   `cutDepth` of the depth.
 * - `sideSteps`: the stand's roof line along the touchline, equal segments with their own depth multiplier (steps
 *   like FM's roof outline).
 * - `endShadow`: the end stand the sun leans toward also casts a shadow (an L with the side one), `endDepth` = its
 *   reach as a fraction of the pitch length at sunset, `endSteps` its roof line across the width.
 */
export interface StadiumSun {
  stadiumId: string;
  side: "top" | "bottom";
  lean: number;
  covered: boolean;
  height: number;
  cut: "lean" | "both" | "none";
  cutX: number;
  cutDepth: number;
  sideSteps: number[];
  endShadow: boolean;
  endDepth: number;
  endSteps: number[];
  /** A real stadium (4.31): the sun is computed from it instead of `side` / `lean` / the depths. */
  real?: RealStadium;
}

/**
 * A real stadium (4.31, `src/Data/stadiums.json`, `bun scripts/fetchStadiums.ts`: Wikidata + OpenStreetMap):
 * where it is, which way its pitch runs, how tall each stand is and its roof. With it the sun is computed
 * (`solar.ts`) instead of drawn from the id.
 * - `axis`: azimuth (degrees from north) of the pitch's long axis = the game's +x ("high" end); +y (the "bottom"
 *   touchline) faces axis + 90°.
 * - `heights`: metres of the stand behind each side (0 = none).
 * - `tzStd` / `dst`: the local clock (standard UTC offset in hours, daylight-saving rule).
 */
export interface RealStadium {
  id: string;
  qid: string;
  name: string;
  lat: number;
  lon: number;
  axis: number;
  heights: { top: number; bottom: number; low: number; high: number };
  roof: "open" | "retractable" | "closed";
  tzStd: number;
  dst: "eu" | "us" | "none";
}

/** Share of covered stadiums (closed roof). */
export const COVERED_SHARE = 0.06;

const slug = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/**
 * Unique id of a stadium: `std_<name>_<city>` from the venue; a club without a venue gets its own
 * (`std_club_<id>`); a neutral venue is the match's (`std_neutral_<fixture id>`).
 */
export function stadiumIdOf(club: { id: string; venue?: { name?: string; city?: string } | null }, neutralFixtureId?: string): string {
  if (neutralFixtureId) return `std_neutral_${slug(neutralFixtureId)}`;
  const name = slug(club.venue?.name ?? "");
  if (!name) return `std_club_${slug(club.id)}`;
  const city = slug(club.venue?.city ?? "");
  return city ? `std_${name}_${city}` : `std_${name}`;
}

/** The stadium's sun profile, from its id. */
export function stadiumSun(stadiumId: string): StadiumSun {
  const rng = mulberry32(seedFrom(`sun:${stadiumId}`));
  const side = rng() < 0.5 ? "top" : "bottom";
  const lean = Math.round((rng() * 2 - 1) * 100) / 100;
  const covered = rng() < COVERED_SHARE;
  const height = Math.round((0.75 + rng() * 0.5) * 100) / 100;
  const c = rng();
  const cut = c < 0.55 ? "lean" : c < 0.8 ? "both" : "none";
  const cutX = Math.round(14 + rng() * 16);
  const cutDepth = Math.round((0.2 + rng() * 0.3) * 100) / 100;
  const steps = (n: number) => Array.from({ length: n }, () => Math.round((0.85 + rng() * 0.3) * 100) / 100);
  const sideSteps = steps(3 + Math.floor(rng() * 4));
  const endShadow = Math.abs(lean) > 0.25 && rng() < 0.7;
  const endDepth = Math.round((0.1 + rng() * 0.15) * 100) / 100;
  const endSteps = steps(2 + Math.floor(rng() * 3));
  return { stadiumId, side, lean, covered, height, cut, cutX, cutDepth, sideSteps, endShadow, endDepth, endSteps };
}
