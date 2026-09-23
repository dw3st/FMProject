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
