/**
 * The AI sometimes changes its game plan against a human club (tester report 6dcd454e, 12.47), so the manager's
 * read of the opponent is never exact. Pure and deterministic: one draw per fixture and club. Only when the AI did
 * not study the manager (the study plan keeps the style then) and never AI × AI. See `.claude/rules/game/study.md`.
 */
import type { AiFormationRecord, FinancialTier } from "@/types/playerTypes";
import type { TacticalStyle } from "@/types/tacticsTypes";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import { AI_VARIATION } from "@/Domain/formation/aiFormationConfig";
import { unitFrom } from "@/Domain/rng";

export type AiPlanKind = "season" | "formation" | "style";

export interface AiPlanVariation {
  kind: AiPlanKind;
  /** Formation the AI plays (the matchday one unless `kind` is "formation"). */
  formation: string;
  style: TacticalStyle;
}

export interface AiPlanInput {
  fixtureId: string;
  aiSquadId: string;
  tier: FinancialTier;
  record: AiFormationRecord;
  /** The formation the season plan gives for this match (season pick or the underdog shape). */
  matchdayFormation: string;
  /** Season level (`AiFormationRecord.level`) of the human club. */
  opponentLevel: number;
}

/** Style of a varied plan by the strength gap: the underdog counters, the favourite takes the ball or presses. */
export function variedStyle(key: string, aiLevel: number, opponentLevel: number): TacticalStyle {
  const gap = aiLevel - opponentLevel;
  if (gap <= -AI_VARIATION.CLOSE_GAP) return AI_VARIATION.UNDERDOG_STYLE;
  const pool = gap >= AI_VARIATION.CLOSE_GAP ? AI_VARIATION.FAVOURITE_STYLES : AI_VARIATION.CLOSE_STYLES;
  return pool[Math.min(pool.length - 1, Math.floor(unitFrom(`${key}:style`) * pool.length))]!;
}

export function aiPlanVariation(input: AiPlanInput): AiPlanVariation {
  const key = `aiplan:${input.fixtureId}:${input.aiSquadId}`;
  const chance = AI_VARIATION.CHANCE[input.tier];
  const u = unitFrom(key);
  const season: AiPlanVariation = { kind: "season", formation: input.matchdayFormation, style: DEFAULT_TACTICAL_STYLE };
  if (u < chance.formation) {
    const second = input.record.second;
    return second && second !== input.matchdayFormation ? { ...season, kind: "formation", formation: second } : season;
  }
  if (u < chance.formation + chance.style) {
    return { ...season, kind: "style", style: variedStyle(key, input.record.level, input.opponentLevel) };
  }
  return season;
}
