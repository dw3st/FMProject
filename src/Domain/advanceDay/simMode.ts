export type SimMode = "full" | "fast";

/** How many leagues a manager can follow (star on the league table). Following never changes the sim mode. */
export const MAX_FOLLOWED_LEAGUES = 3;

/**
 * Which engine resolves a club match (engine rebuild, stage 1): the full engine only when one of the two clubs has
 * a human seat; every other match, the seat's own league and followed leagues included, goes to the quickSim (as
 * FM Mobile does). A national team game of a seat's manager is decided in the national day (`nationalWorld.ts`).
 */
export function resolveSimMode(home: string, away: string, humanClubs: ReadonlySet<string>): SimMode {
  return humanClubs.has(home) || humanClubs.has(away) ? "full" : "fast";
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
