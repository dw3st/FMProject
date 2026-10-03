/**
 * Style familiarity (`.claude/rules/game/style-training.md`): how well a squad knows each way of
 * playing, 0..100. Keys are the user-facing tactical styles plus two transversal skills.
 */
import type { TacticalStyle } from "@/types/tacticsTypes";

export type FamiliarityKey = TacticalStyle | "high_line_trap" | "long_ball";

export const FAMILIARITY_KEYS: readonly FamiliarityKey[] = [
  "counter_attack",
  "high_press",
  "possession",
  "direct_play",
  "balanced",
  "high_line_trap",
  "long_ball",
];

/** Familiarity values a team brings to a match. Missing key = neutral (50). */
export type FamiliarityLevels = Partial<Record<FamiliarityKey, number>>;

export function isFamiliarityKey(v: unknown): v is FamiliarityKey {
  return typeof v === "string" && (FAMILIARITY_KEYS as readonly string[]).includes(v);
}
