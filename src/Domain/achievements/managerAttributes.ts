import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import { clamp } from "@/Domain/math";
import { MANAGER_ATTRIBUTES, type ManagerAttribute, type ManagerAttributes } from "@/types/achievementTypes";

/**
 * Manager attributes 1..20 (`.claude/rules/game/achievements.md` §4): neutral at 10, ±5% at the extreme.
 * Every effect is exactly 1 at 10 or when the value is absent (the AI, a save without the file).
 */

export function initialAttributes(): ManagerAttributes {
  const out = {} as ManagerAttributes;
  for (const k of MANAGER_ATTRIBUTES) out[k] = A.ATTRIBUTE_START;
  return out;
}

export function clampAttribute(v: number): number {
  return Math.round(clamp(v, A.ATTRIBUTE_MIN, A.ATTRIBUTE_MAX) * 100) / 100;
}

/** t = (v − 10)/10 in [−1, 1]; 0 when absent. */
export function attributeT(v: number | undefined): number {
  if (v === undefined || !Number.isFinite(v)) return 0;
  return clamp((v - A.ATTRIBUTE_START) / A.ATTRIBUTE_START, -1, 1);
}

/** 1 + 5% × t: Motivation (morale gains), Tactics (familiarity), Youth (DP of the young). */
export function attributeBoost(v: number | undefined): number {
  const t = attributeT(v);
  return t === 0 ? 1 : 1 + A.EFFECT * t;
}

/** 1 − 5% × t: Negotiation (wage demand, fee), Discipline (fouls, cards). */
export function attributeReduce(v: number | undefined): number {
  const t = attributeT(v);
  return t === 0 ? 1 : 1 - A.EFFECT * t;
}

export function attributeOf(attrs: Partial<ManagerAttributes> | undefined, key: ManagerAttribute): number | undefined {
  return attrs?.[key];
}

/** Players this young or younger get the Youth attribute on their DP. */
export const YOUTH_ATTRIBUTE_MAX_AGE = 21;

/** DP multiplier of the Youth attribute for a player of `age` (1 above 21 or without attributes). */
export function youthAttributeMult(attrs: Partial<ManagerAttributes> | undefined, age: number): number {
  if (age > YOUTH_ATTRIBUTE_MAX_AGE) return 1;
  return attributeBoost(attrs?.youth);
}
