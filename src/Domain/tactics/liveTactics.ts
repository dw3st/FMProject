/**
 * Live-match tactics of the user's side (Etapa 35, #108): tactical style and the four axes changed during a
 * match. Applied to the engine config of one team only; never saved (no `PUT /tactics`, no `tactics.json`).
 */
import type { TeamId } from "@/GameEngine/types";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { axesFor, type Mentality, type TacticalAxes, type TacticalStyle, type TeamInstructions } from "@/types/tacticsTypes";
import type { FamiliarityLevels } from "@/types/familiarityTypes";

export interface LiveTactics {
  style: TacticalStyle;
  axesOverride?: Partial<TacticalAxes>;
  /** Team instructions and the saved mentality level (stage 20), for this match only. */
  instructions?: TeamInstructions;
  mentalityLevel?: number;
}

/** Picking a style clears the axis and instruction edits (like the formation screen); the mentality level stays. */
export function withLiveStyle(style: TacticalStyle, prev?: LiveTactics): LiveTactics {
  return prev?.mentalityLevel ? { style, mentalityLevel: prev.mentalityLevel } : { style };
}

/** The instructions panel's value on top of the live tactics (the old axes edits are folded into it). */
export function withLiveInstructions(live: LiveTactics, next: { teamInstructions?: TeamInstructions; mentality?: number }): LiveTactics {
  return {
    style: live.style,
    ...(next.teamInstructions ? { instructions: next.teamInstructions } : {}),
    ...(next.mentality ? { mentalityLevel: next.mentality } : {}),
  };
}

/** One axis on top of the style; the style's own value drops the edit (no edits left = no override). */
export function withLiveAxis<K extends keyof TacticalAxes>(live: LiveTactics, key: K, value: TacticalAxes[K]): LiveTactics {
  const next: Partial<TacticalAxes> = { ...live.axesOverride, [key]: value };
  if (axesFor(live.style)[key] === value) delete next[key];
  const rest = { ...(live.instructions ? { instructions: live.instructions } : {}), ...(live.mentalityLevel ? { mentalityLevel: live.mentalityLevel } : {}) };
  return Object.keys(next).length ? { style: live.style, axesOverride: next, ...rest } : { style: live.style, ...rest };
}

/**
 * Pushes the live tactics into `team`'s engine config with the current mentality and the club's familiarity
 * record (its value for the chosen style drives the weights). The other team is never touched.
 */
export function applyLiveTactics(
  team: TeamId,
  live: LiveTactics,
  mentality: Mentality,
  familiarity?: FamiliarityLevels,
): void {
  applyTeamTacticsConfig(team, live.style, mentality, live.axesOverride, familiarity, live.instructions, live.mentalityLevel);
  applyTeamAttackConfig(team, live.style, mentality, live.axesOverride, familiarity, live.instructions, live.mentalityLevel);
}
