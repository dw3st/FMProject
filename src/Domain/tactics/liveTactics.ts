/**
 * Live-match tactics of the user's side (Etapa 35, #108): tactical style and the four axes changed during a
 * match. Applied to the engine config of one team only; never saved (no `PUT /tactics`, no `tactics.json`).
 */
import type { TeamId } from "@/GameEngine/types";
import { applyTeamTacticsConfig } from "@/GameEngine/Configs/DefenseConfig";
import { applyTeamAttackConfig } from "@/GameEngine/Configs/AttackConfig";
import { axesFor, type Mentality, type TacticalAxes, type TacticalStyle } from "@/types/tacticsTypes";
import type { FamiliarityLevels } from "@/types/familiarityTypes";

export interface LiveTactics {
  style: TacticalStyle;
  axesOverride?: Partial<TacticalAxes>;
}

/** Picking a style clears the axis edits (like the formation screen). */
export function withLiveStyle(style: TacticalStyle): LiveTactics {
  return { style };
}

/** One axis on top of the style; the style's own value drops the edit (no edits left = no override). */
export function withLiveAxis<K extends keyof TacticalAxes>(live: LiveTactics, key: K, value: TacticalAxes[K]): LiveTactics {
  const next: Partial<TacticalAxes> = { ...live.axesOverride, [key]: value };
  if (axesFor(live.style)[key] === value) delete next[key];
  return Object.keys(next).length ? { style: live.style, axesOverride: next } : { style: live.style };
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
  applyTeamTacticsConfig(team, live.style, mentality, live.axesOverride, familiarity);
  applyTeamAttackConfig(team, live.style, mentality, live.axesOverride, familiarity);
}
