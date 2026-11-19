export type SimMode = "full" | "fast";

export const MAX_FOLLOWED_LEAGUES = 3;

/**
 * Which engine resolves a league's matches. Derived (never stored) so it can't go stale
 * when the player changes league: own league + up to 3 followed leagues use the full engine.
 */
export function resolveSimMode(
  leagueSlug: string,
  meta: { leagueSlug: string; followedLeagues?: string[] },
): SimMode {
  if (leagueSlug === meta.leagueSlug) return "full";
  const followed = (meta.followedLeagues ?? []).slice(0, MAX_FOLLOWED_LEAGUES);
  return followed.includes(leagueSlug) ? "full" : "fast";
}

/** Cleans a client-supplied followedLeagues list: known slugs only, not the player's league, unique, max 3. */
export function sanitizeFollowedLeagues(input: unknown, validSlugs: Set<string>, ownLeague: string): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string" || !validSlugs.has(v) || v === ownLeague || out.includes(v)) continue;
    out.push(v);
    if (out.length === MAX_FOLLOWED_LEAGUES) break;
  }
  return out;
}

/** Sim mode with several seats: full when any seat would resolve the league in the full engine. */
export function resolveSimModeForSeats(
  leagueSlug: string,
  seats: readonly { leagueSlug: string; followedLeagues?: string[] }[],
): SimMode {
  return seats.some((s) => resolveSimMode(leagueSlug, s) === "full") ? "full" : "fast";
}

/**
 * Leagues the day advance plays in the full engine for a world with these seats (each seat's league and
 * followed leagues), sorted and unique: the same rule as `resolveSimModeForSeats`, as a list for the screens.
 */
export function fullEngineLeagues(seats: readonly { leagueSlug: string; followedLeagues?: string[] }[]): string[] {
  const out = new Set<string>();
  for (const s of seats) {
    if (s.leagueSlug) out.add(s.leagueSlug);
    for (const f of (s.followedLeagues ?? []).slice(0, MAX_FOLLOWED_LEAGUES)) out.add(f);
  }
  return [...out].sort();
}

/** Sim mode shown on screen: the viewer's own rule, or full when another seat's day advance plays it in full. */
export function displayedSimMode(
  leagueSlug: string,
  meta: { leagueSlug: string; followedLeagues?: string[] },
  worldFullLeagues: readonly string[],
): SimMode {
  return resolveSimMode(leagueSlug, meta) === "full" || worldFullLeagues.includes(leagueSlug) ? "full" : "fast";
}
