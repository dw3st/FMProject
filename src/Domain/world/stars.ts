import { Player } from "@/Domain/Player";
import type { Squad } from "@/types/playerTypes";

/**
 * The `n` best players in the world (by `Player.computeOverallAvg`), across every squad.
 * Ties are broken by id (ascending) so the result is deterministic. Pure — no I/O.
 */
export function topPlayerIds(squads: Squad[], n = 50): Set<string> {
  const ranked = squads
    .flatMap((squad) => squad.players)
    .map((p) => ({ id: p.id, overall: Player.computeOverallAvg(p) }))
    .sort((a, b) => b.overall - a.overall || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, Math.max(0, n));
  return new Set(ranked.map((p) => p.id));
}
