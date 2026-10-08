import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { conditionOf, effectAt } from "@/Domain/facilities/facilityItems";
import { livingFacilities, seasonFraction } from "@/Domain/facilities/facilities";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { clamp } from "@/Domain/math";
import type { FinancialTier, Squad } from "@/types/playerTypes";

/**
 * Match pitch (`docs/superpowers/specs/2026-10-08-living-facilities-design.md` §3). Nothing is
 * stored for the AI: its home pitch falls through the season by tier and is new again the next one.
 */

/** AI home pitch: START − DROP × fraction of the home club's league window (clamped to 0..1). */
export function aiPitchCondition(tier: FinancialTier, fraction: number): number {
  const f = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0.5;
  return F.AI_PITCH.START[tier] - F.AI_PITCH.DROP[tier] * f;
}

/** × injury risk of both sides on a pitch in this condition (1 from 40% up, 1.6 at 0%). */
export function pitchInjuryMult(condition: number): number {
  return effectAt(F.WEAR.PITCH_INJURY_MAX, condition);
}

/**
 * Condition of the pitch of a fixture: neutral venue → `AI_PITCH.NEUTRAL`; a home club with the
 * living facilities (the human club) → its stadium pitch; otherwise the AI formula with the home
 * club's tier and the fraction of its league window (no window: the middle of the season).
 */
export function matchPitchCondition(
  home: Squad,
  fixture: { neutral?: boolean },
  window: { start: string; end: string } | undefined | null,
  date: string,
): number {
  if (fixture.neutral) return F.AI_PITCH.NEUTRAL;
  const f = livingFacilities(home);
  if (f) return conditionOf(f.items.stadiumPitch);
  const fraction = window ? seasonFraction(date, window.start, window.end) : 0.5;
  return aiPitchCondition(financialTierOf(home), fraction);
}
