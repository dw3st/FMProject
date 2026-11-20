/**
 * MentalMatchConfig — a player's mental profile in a match (`GamePlayer.mental`, `decisions.md` → phase 3) and the
 * per-team override the lab, `/test` and the effect-size measurement use (like `PersonalityMatchConfig.ts`).
 *
 * In a real match every player plays with his own decisions / composure / flair / anticipation (roster, 0..10, derived
 * when missing), his hidden consistency and a mood fixed at kickoff: half his morale, half his recent form. An override
 * (0..10) sets the four attributes of every player of that side. `simulateMatch` always sets (or clears) it.
 */
import type { PlayerMental, TeamId } from '@/GameEngine/types';
import type { RosterPlayer } from '@/types/playerTypes';
import { lineupMental } from '@/GameEngine/Domain/TeamLineup';
import { consistencyOf } from '@/Domain/mental/mental';
import { mentalShiftOf, personalityOf } from '@/Domain/personality/personality';
import { moraleFactor } from '@/Domain/morale/morale';
import { formOf, moodOf } from '@/GameEngine/Domain/HolderMind';
import { matchMoraleOf } from '@/GameEngine/Configs/MoraleConfig';
import { registerEngineMemory, recordPart } from '@/GameEngine/Support/EngineMemory';

const TEAM_MENTAL_OVERRIDE: Record<TeamId, number | undefined> = { A: undefined, B: undefined };

/** Sets a side's mental level (0..10) for the next match; undefined = each player's own. */
export function setTeamMentalOverride(team: TeamId, level: number | undefined): void {
  TEAM_MENTAL_OVERRIDE[team] = level === undefined || !Number.isFinite(level) ? undefined : Math.max(0, Math.min(10, level));
}

export function teamMentalOverride(team: TeamId): number | undefined {
  return TEAM_MENTAL_OVERRIDE[team];
}

/** The mental profile a roster player of `team` plays this match with. */
export function matchMentalOf(team: TeamId, rp: RosterPlayer): PlayerMental {
  const base = lineupMental(rp.stats, rp.id, rp.age);
  const lvl = TEAM_MENTAL_OVERRIDE[team];
  const v = lvl === undefined ? base : { decisions: lvl / 10, composure: lvl / 10, flair: lvl / 10, anticipation: lvl / 10 };
  const shift = mentalShiftOf(personalityOf(rp));
  return {
    ...v,
    consistency: consistencyOf(rp.age, shift),
    mood: moodOf(moraleFactor(matchMoraleOf(team, rp.morale)), formOf(rp.seasonLog?.recentRatings)),
  };
}

// Stage 19 (`live-modes.md`): the per-team configs travel with a mid-match snapshot.
registerEngineMemory('MentalMatchConfig.TEAM_MENTAL_OVERRIDE', recordPart(TEAM_MENTAL_OVERRIDE as unknown as Record<string, unknown>));
