/**
 * Market recalibration applied to one player (`data_process/transfermarkt/derived.json`, see
 * `.claude/rules/data/espn-import.md` → "Recalibração pelo valor de mercado"). Pure — no filesystem;
 * `scripts/applyMarketRecalibration.ts` reads and writes the squads.
 */
import { rescaleToOverall, type AttrWeights } from "@/../scripts/curated/corrections";
import type { DerivedEntry } from "@/../scripts/transfermarkt/derive";
import { getMainRole } from "@/Domain/roles";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * 1. `naturalPosition` is written; when its line differs from `positions[0]`, the line follows it (the world keeps
 *    the main role in `positions[0]`: "GK", "Defender", "Midfielder", "Forward").
 * 2. `targetOverall` rescales the attributes with the natural position's weights (`rescaleToOverall`, the same single
 *    shift as the manual corrections), only when off by more than the tolerance.
 * 3. `birthDate` / `heightCm` are copied; `nationality` only fills a missing one (never replaces).
 * Returns the same object when nothing changes (idempotent); a changed player loses the cached `overallAvg`.
 */
export function applyDerived(player: RosterPlayer, entry: DerivedEntry, roles: AttrWeights): RosterPlayer {
  let next: RosterPlayer = { ...player, positions: [...player.positions], stats: { ...player.stats } };

  if (entry.naturalPosition) {
    next.naturalPosition = entry.naturalPosition;
    const line = getMainRole(entry.naturalPosition);
    if (getMainRole(next.positions[0] ?? "CM") !== line) next.positions[0] = line;
  }
  if (entry.targetOverall !== undefined) next = rescaleToOverall(next, entry.targetOverall, roles);
  if (entry.birthDate) next.birthDate = entry.birthDate;
  if (entry.heightCm) next.heightCm = entry.heightCm;
  if (entry.nationality && !next.nationality) next.nationality = entry.nationality;

  if (JSON.stringify(withoutCache(next)) === JSON.stringify(withoutCache(player))) return player;
  delete next.overallAvg;
  return next;
}

function withoutCache(p: RosterPlayer): RosterPlayer {
  const { overallAvg: _cached, ...rest } = p;
  return rest as RosterPlayer;
}
