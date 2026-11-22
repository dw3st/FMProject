/**
 * HomeAdvantageConfig — the home side's edge in the engine (stage 21c).
 *
 * The home side plays with its attributes × HOME_ADVANTAGE.EXECUTION (the same kind of lever as morale and
 * familiarity). No home side (neutral venue, tests, the lab without the option) = no effect, identical to before.
 * `simulateMatch` and the live-match setup always set it (or clear it), so nothing leaks from a previous match.
 */
import type { TeamId } from '@/GameEngine/types';
import { registerEngineMemory, recordPart } from '@/GameEngine/Support/EngineMemory';

export const HOME_ADVANTAGE = {
  /** Attribute multiplier of the home side. Calibrated against real football (home ~1.5 × away ~1.15 goals). */
  EXECUTION: 1.05,
};

const HOME_SIDE: { team: TeamId | null } = { team: null };

export function setHomeSide(team: TeamId | null | undefined): void {
  HOME_SIDE.team = team ?? null;
}

export function homeSide(): TeamId | null {
  return HOME_SIDE.team;
}

/** The home multiplier of `team` (1 away, neutral or with no home side). */
export function homeExecutionMult(team: TeamId): number {
  return HOME_SIDE.team === team ? HOME_ADVANTAGE.EXECUTION : 1;
}

export function withHomeExecution<S extends object>(stats: S, team: TeamId): S {
  const k = homeExecutionMult(team);
  if (k === 1) return stats;
  const out: Record<string, number> = { ...(stats as unknown as Record<string, number>) };
  for (const key of Object.keys(out)) out[key] = Math.min(10, out[key]! * k);
  return out as unknown as S;
}

registerEngineMemory('HomeAdvantageConfig.HOME_SIDE', recordPart(HOME_SIDE as unknown as Record<string, unknown>));

{
  const raw = typeof process !== 'undefined' ? process.env?.HOME_ADVANTAGE_OVERRIDES : undefined;
  if (raw) Object.assign(HOME_ADVANTAGE, JSON.parse(raw));
}
