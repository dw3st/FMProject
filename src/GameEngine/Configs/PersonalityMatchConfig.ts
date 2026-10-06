/**
 * PersonalityMatchConfig — per-team temperament override for the engine
 * (`.claude/rules/game/personality.md`), like `MoraleConfig.ts`.
 *
 * In a real match every player plays at his own temperament (derived from his id). The lab and
 * `/test` set a whole side instead (1..20): while a team has an override, every player of that team
 * fouls and is booked as if he had it. `simulateMatch` always sets (or clears) the override from its
 * options, so nothing leaks from a previous match.
 */
import type { TeamId } from '@/GameEngine/types';
import { temperamentT, temperamentTOf } from '@/Domain/personality/personality';
import type { RosterPlayer } from '@/types/playerTypes';

const TEAM_TEMPERAMENT_OVERRIDE: Record<TeamId, number | undefined> = { A: undefined, B: undefined };

export function setTeamTemperamentOverride(team: TeamId, temperament: number | undefined): void {
  TEAM_TEMPERAMENT_OVERRIDE[team] = temperament;
}

/** Temperament t (−1..1) a player of `team` plays with: the team override, else his own. */
export function matchTemperamentOf(team: TeamId, rp: RosterPlayer): number {
  return temperamentTOf(TEAM_TEMPERAMENT_OVERRIDE[team]) ?? temperamentT(rp);
}
