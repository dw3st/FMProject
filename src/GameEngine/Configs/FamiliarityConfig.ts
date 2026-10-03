/**
 * FamiliarityConfig — how a team's familiarity with its style nudges the EXISTING tactic weights
 * (`.claude/rules/game/style-training.md`, `.claude/rules/game-engine/tactical-config.md`).
 *
 * Each entry is the change at `familiarityFactor = +1` (familiarity 100); it scales linearly with
 * the factor, so familiarity 50 (factor 0) leaves every weight exactly as the style sets it and
 * familiarity 0 (factor −1) is the mirror. `mult` entries are relative (× (1 + m × factor)), `add`
 * entries are absolute (+ a × factor). No new fields: only weights the style already drives.
 *
 * The STYLE (not the familiarity) keeps driving team intents; mentality is applied before this.
 */
import type { TacticalStyle } from '@/types/tacticsTypes';
import type { TeamId } from '@/GameEngine/types';
import type { TeamPassWeights, TeamCarryWeights } from '@/GameEngine/Configs/AttackConfig';
import type { DefenseConfigValues } from '@/GameEngine/Configs/DefenseConfig';

export interface FamiliarityEffect {
  passMult?:   Partial<Record<keyof TeamPassWeights, number>>;
  carryMult?:  Partial<Record<keyof TeamCarryWeights, number>>;
  defenseAdd?: Partial<Record<keyof DefenseConfigValues, number>>;
}

/** Keyed by the team's tactical style; read with that style's familiarity. */
export const STYLE_FAMILIARITY_EFFECTS: Record<TacticalStyle, FamiliarityEffect> = {
  // Short, safe circulation: lane clarity and the receiver's space.
  possession:     { passMult: { LANE_WEIGHT: 0.03, RECEIVER_SPACE_WEIGHT: 0.03 } },
  // A drilled press closes down sooner.
  high_press:     { defenseAdd: { PRESS_INTENSITY: 0.05 } },
  // Breaks and direct play: forward progress on the ball and in the pass.
  counter_attack: { passMult: { PROGRESS_WEIGHT: 0.03 }, carryMult: { PROGRESS_WEIGHT: 0.03 } },
  direct_play:    { passMult: { PROGRESS_WEIGHT: 0.03 }, carryMult: { PROGRESS_WEIGHT: 0.03 } },
  // No extreme: half of each.
  balanced:       { passMult: { LANE_WEIGHT: 0.015, PROGRESS_WEIGHT: 0.015 } },
};

/** `high_line_trap` familiarity: only when the effective defensive line is `high`. */
export const HIGH_LINE_TRAP_EFFECT: FamiliarityEffect = { defenseAdd: { DEFENSIVE_LINE_HEIGHT: 0.03 } };

/** `long_ball` familiarity: always (any team can go long). */
export const LONG_BALL_EFFECT: FamiliarityEffect = { passMult: { LONG_BALL_WEIGHT: 0.05 } };

/** Stamina cost of a `press` action under a high press (always, familiarity or not). */
export const HIGH_PRESS_STAMINA_MULT = 1.10;

/**
 * Execution: a side that knows its style plays it a little sharper — its players' attributes are
 * multiplied by `1 + EXECUTION_STAT_SCALE × familiarityFactor` for the match (capped at 10), the
 * engine counterpart of quickSim's strength × (1 + 0.02 × factor). The weight nudges above give the
 * style its identity but measured ≈ 0 on results (`.claude/rules/game/style-training.md`); this is
 * the term that makes a drilled side win more. Mutable only so calibration scripts can override it.
 */
export const FAMILIARITY_ENGINE = { EXECUTION_STAT_SCALE: 0.02 };

const TEAM_EXECUTION_MULT: Record<TeamId, number> = { A: 1, B: 1 };

/** Set from `applyTeamAttackConfig` (style familiarity factor of the team). */
export function setTeamExecution(team: TeamId, familiarityFactor: number): void {
  TEAM_EXECUTION_MULT[team] = 1 + FAMILIARITY_ENGINE.EXECUTION_STAT_SCALE * familiarityFactor;
}

/** Attribute multiplier for the team's players this match (1 = neutral). */
export function getTeamExecutionMult(team: TeamId): number {
  return TEAM_EXECUTION_MULT[team];
}

/** `stats` × the team's execution multiplier, each attribute capped at 10. */
export function withTeamExecution<S extends object>(stats: S, team: TeamId): S {
  const k = TEAM_EXECUTION_MULT[team];
  if (k === 1) return stats;
  const out: Record<string, number> = { ...(stats as unknown as Record<string, number>) };
  for (const key of Object.keys(out)) out[key] = Math.min(10, out[key]! * k);
  return out as unknown as S;
}

/** Applies `mult` entries of `effect` (× (1 + m × factor)) to `target` in place. */
export function applyMult<T extends { [K in keyof T]: number }>(
  target: T,
  mult: Partial<Record<keyof T, number>> | undefined,
  factor: number,
): void {
  if (!mult || factor === 0) return;
  for (const k of Object.keys(mult) as (keyof T)[]) {
    target[k] = ((target[k] as number) * (1 + (mult[k] ?? 0) * factor)) as T[keyof T];
  }
}

/** Applies `add` entries (+ a × factor), clamped to 0..1 (every defense weight is a 0..1 share). */
export function applyAdd<T extends { [K in keyof T]: number }>(
  target: T,
  add: Partial<Record<keyof T, number>> | undefined,
  factor: number,
): void {
  if (!add || factor === 0) return;
  for (const k of Object.keys(add) as (keyof T)[]) {
    target[k] = Math.max(0, Math.min(1, (target[k] as number) + (add[k] ?? 0) * factor)) as T[keyof T];
  }
}
