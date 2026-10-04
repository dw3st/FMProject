/**
 * Centralized club/squad identity resolution.
 *
 * meta.clubId stores the squad's internal ID (e.g. "135") — it is NOT a
 * filesystem slug (e.g. "cruzeiro"). All "is this the player's club?" checks
 * must go through these helpers to avoid id-vs-slug mismatches.
 */

import type { Squad } from "@/types/playerTypes";

/** Minimal save metadata needed for club identity checks. */
export type MetaRef = { clubId: string; leagueSlug: string };

/** True when the given squad id is the human player's club. */
export function isPlayerSquadId(squadId: string, meta: Pick<MetaRef, "clubId">): boolean {
  return squadId === meta.clubId;
}

/** Find the player's squad (by `meta.clubId`, the squad id) in a collection. */
export function findPlayerSquad(squads: Squad[], meta: MetaRef): Squad | null {
  return squads.find((s) => s.id === meta.clubId) ?? null;
}
