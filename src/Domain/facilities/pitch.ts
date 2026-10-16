import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { conditionOf } from "@/Domain/facilities/facilityItems";
import { livingFacilities, seasonFraction } from "@/Domain/facilities/facilities";
import { clubMowing, clubTurf } from "@/Domain/facilities/turf";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { clamp } from "@/Domain/math";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";
import type { FinancialTier, Squad } from "@/types/playerTypes";

/**
 * Match pitch (`docs/superpowers/specs/2026-10-08-living-facilities-design.md` §3,
 * `2026-10-16-pitch-types-design.md`). Nothing is stored for the AI: its home pitch falls through the
 * season by tier and grass, and is new again the next one.
 */

/** The pitch a match is played on: condition 0..100, grass, mowing pattern. */
export interface MatchPitch {
  condition: number;
  turf: TurfType;
  mowing: MowingPattern;
}

/** AI home pitch: START - DROP x grass wear x fraction of the home club's league window (clamped to 0..1). */
export function aiPitchCondition(tier: FinancialTier, fraction: number, turf: TurfType = "natural"): number {
  const f = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0.5;
  return F.AI_PITCH.START[tier] - F.AI_PITCH.DROP[tier] * F.TURF.WEAR_MULT[turf] * f;
}

export { pitchInjuryMult } from "@/Domain/facilities/facilityItems";

/**
 * The pitch of a fixture: neutral venue -> `AI_PITCH.NEUTRAL`, natural, stripes; a home club with the
 * living facilities (the human club) -> its stadium pitch; otherwise the AI formula with the home club's
 * tier, grass and the fraction of its league window (no window: the middle of the season).
 */
export function matchPitch(
  home: Squad,
  fixture: { neutral?: boolean },
  window: { start: string; end: string } | undefined | null,
  date: string,
): MatchPitch {
  if (fixture.neutral) return { condition: F.AI_PITCH.NEUTRAL, turf: "natural", mowing: "stripes" };
  const turf = clubTurf(home);
  const mowing = clubMowing(home);
  const f = livingFacilities(home);
  if (f) return { condition: conditionOf(f.items.stadiumPitch), turf, mowing };
  const fraction = window ? seasonFraction(date, window.start, window.end) : 0.5;
  return { condition: aiPitchCondition(financialTierOf(home), fraction, turf), turf, mowing };
}

/** Condition only (`matchPitch(...).condition`). */
export function matchPitchCondition(
  home: Squad,
  fixture: { neutral?: boolean },
  window: { start: string; end: string } | undefined | null,
  date: string,
): number {
  return matchPitch(home, fixture, window, date).condition;
}
