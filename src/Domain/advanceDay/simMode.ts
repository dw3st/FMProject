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
