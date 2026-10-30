/**
 * Match HUD (FIFA style, tester request): when a player of the user's team has the ball, a band under the pitch shows
 * him. Which four attributes it shows depends on his position; how long it stays after he lets the ball go. Pure.
 */
import type { PlayerStatsRecord } from "@/types/playerTypes";

export type HudAttr = "reflex" | "jump" | "pressing" | "passing" | "tackling" | "heading" | "strength" | "speed"
  | "stamina" | "vision" | "dribbling" | "finishing";

export const HUD = {
  /** Seconds (real) the band stays after the player passes or loses the ball, so quick passes do not flicker it. */
  LINGER_S: 1.6,
} as const;

const BY_ROLE: Record<string, readonly HudAttr[]> = {
  GK: ["reflex", "jump", "pressing", "passing"],
  CB: ["tackling", "heading", "strength", "speed"],
  LB: ["speed", "tackling", "passing", "stamina"], RB: ["speed", "tackling", "passing", "stamina"],
  LWB: ["speed", "tackling", "passing", "stamina"], RWB: ["speed", "tackling", "passing", "stamina"],
  CDM: ["tackling", "passing", "vision", "stamina"], DM: ["tackling", "passing", "vision", "stamina"],
  CM: ["passing", "vision", "dribbling", "stamina"],
  CAM: ["passing", "vision", "dribbling", "finishing"], AM: ["passing", "vision", "dribbling", "finishing"],
  LM: ["speed", "dribbling", "passing", "finishing"], RM: ["speed", "dribbling", "passing", "finishing"],
  LW: ["speed", "dribbling", "passing", "finishing"], RW: ["speed", "dribbling", "passing", "finishing"],
  ST: ["finishing", "heading", "speed", "strength"], CF: ["finishing", "heading", "speed", "strength"],
};

/** The four attributes shown for a player in `role`, each 0..100 (the game's 0..10 × 10). */
export function hudAttributes(role: string, stats: Partial<PlayerStatsRecord>): { key: HudAttr; value: number }[] {
  const keys = BY_ROLE[role] ?? BY_ROLE.CM!;
  return keys.map((key) => ({ key, value: Math.round(((stats as Record<string, number | undefined>)[key] ?? 0) * 10) }));
}
