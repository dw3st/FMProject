/**
 * MoraleConfig — per-team morale override for the engine (`.claude/rules/game/morale.md`).
 *
 * In a real match every player plays at his own stored morale (`RosterPlayer.morale`, human club
 * only; absent = the neutral 65, no effect). The lab and `/test` set a whole side instead: while a
 * team has an override, every player of that team plays at it. `simulateMatch` always sets (or
 * clears) the override from its options, so nothing leaks from a previous match.
 */
import type { TeamId } from '@/GameEngine/types';

const TEAM_MORALE_OVERRIDE: Record<TeamId, number | undefined> = { A: undefined, B: undefined };

export function setTeamMoraleOverride(team: TeamId, morale: number | undefined): void {
  TEAM_MORALE_OVERRIDE[team] = morale;
}

/** The morale a player of `team` plays at: the team override, else his own. */
export function matchMoraleOf(team: TeamId, playerMorale: number | undefined): number | undefined {
  return TEAM_MORALE_OVERRIDE[team] ?? playerMorale;
}
