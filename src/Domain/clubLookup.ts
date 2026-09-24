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

/** True when the given squad is the human player's club. */
export function isPlayerSquad(squad: Squad, meta: MetaRef): boolean {
  return squad.id === meta.clubId;
}

/** True when the given squad id is the human player's club. */
export function isPlayerSquadId(squadId: string, meta: Pick<MetaRef, "clubId">): boolean {
  return squadId === meta.clubId;
}

/**
 * Find the player's squad from a collection.
 * Primary:  squad.id match.
 * Fallback: league + slug (legacy saves where clubId may store a file slug).
 */
export function findPlayerSquad(squads: Squad[], meta: MetaRef): Squad | null {
  return (
    squads.find((s) => s.id === meta.clubId) ??
    squads.find((s) => s.leagueSlug === meta.leagueSlug && s.slug === meta.clubId) ??
    null
  );
}
