import { Player } from "@/Domain/Player";
import type { Squad } from "@/types/playerTypes";

/** Top players per club (report of a tester, 4.40): see `.claude/rules/game/transfers.md` → "Limite do top 25". */
export const STAR_LIMIT = {
  /** How many of the world's best players count as "top" (the gold star). */
  TOP: 25,
  /** At most this many of them in a club's senior squad after a signing. */
  MAX: 5,
} as const;

/**
 * Ids of the world's `TOP` best players (senior squads, by `Player.computeOverallAvg`, ties by id): the gold star
 * of `computeStars` is this same list.
 */
export function worldTopIds(squads: readonly Squad[], top: number = STAR_LIMIT.TOP): Set<string> {
  const all = squads
    .flatMap((s) => s.players)
    .map((p) => ({ id: p.id, overall: Player.computeOverallAvg(p) }))
    .sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(all.slice(0, top).map((x) => x.id));
}

/** Top players in the club's senior squad (the academy never counts). */
export function topPlayerCount(squad: Pick<Squad, "players">, top: ReadonlySet<string>): number {
  let n = 0;
  for (const p of squad.players) if (top.has(p.id)) n++;
  return n;
}

/**
 * The club cannot bring `playerId` in: he is a top player, not in the squad yet, and the club already has `MAX`.
 * A club over the limit because one of its own players climbed into the top keeps him; it only signs no other.
 */
export function breaksStarLimit(buyer: Pick<Squad, "players">, playerId: string, top: ReadonlySet<string> | undefined): boolean {
  if (!top || !top.has(playerId)) return false;
  if (buyer.players.some((p) => p.id === playerId)) return false;
  return topPlayerCount(buyer, top) >= STAR_LIMIT.MAX;
}
