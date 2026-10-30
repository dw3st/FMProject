import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { pitchInjuryMult } from "@/Domain/facilities/facilityItems";
import { livingFacilities } from "@/Domain/facilities/facilities";
import { financialTierOf } from "@/Domain/aiFinance/aiClubFinance";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";
import type { FinancialTier, Squad } from "@/types/playerTypes";

/**
 * Grass and mowing pattern of a stadium pitch (spec 2026-10-16-pitch-types). The human club stores them on
 * its facilities (`items.stadiumPitch.turf`, `mowing`); AI clubs derive both from the club id, nothing stored.
 */

export const TURF_TYPES: readonly TurfType[] = ["natural", "hybrid", "synthetic"];
export const MOWING_PATTERNS: readonly MowingPattern[] = ["stripes", "checker", "diagonal", "circles", "none"];
/** What an AI club mows (never a plain pitch: the AI rule predates the plain one, art phase 9). */
const AI_MOWING: readonly MowingPattern[] = ["stripes", "checker", "diagonal", "circles"];

export const isTurfType = (v: unknown): v is TurfType => typeof v === "string" && (TURF_TYPES as readonly string[]).includes(v);
export const isMowingPattern = (v: unknown): v is MowingPattern =>
  typeof v === "string" && (MOWING_PATTERNS as readonly string[]).includes(v);

/** Daily wear of the stadium pitch × this (absent = natural). */
export const turfWearMult = (turf: TurfType | undefined): number => F.TURF.WEAR_MULT[turf ?? "natural"];
/** Injury risk of both sides in a home game × this (absent = natural). */
export const turfInjuryMult = (turf: TurfType | undefined): number => F.TURF.INJURY_MULT[turf ?? "natural"];

/** Injury multiplier of a match pitch: its condition (`pitchInjuryMult`) × its grass. 90 / natural = 1. */
export function pitchInjury(condition: number, turf: TurfType | undefined): number {
  return pitchInjuryMult(condition) * turfInjuryMult(turf);
}

/** The grass of an AI club: fixed by its id and tier (`TURF.AI_SHARE`). */
export function aiTurfOf(squadId: string, tier: FinancialTier): TurfType {
  const share = F.TURF.AI_SHARE[tier];
  const r = mulberry32(seedFrom(`turf:${squadId}`))();
  if (r < share.synthetic) return "synthetic";
  if (r < share.synthetic + share.hybrid) return "hybrid";
  return "natural";
}

/** The mowing pattern of an AI club: fixed by its id. */
export function aiMowingOf(squadId: string): MowingPattern {
  const r = mulberry32(seedFrom(`mowing:${squadId}`))();
  return AI_MOWING[Math.min(AI_MOWING.length - 1, Math.floor(r * AI_MOWING.length))]!;
}

/** Grass of a club's stadium: the human club's pitch item, else the AI rule. */
export function clubTurf(squad: Squad): TurfType {
  const f = livingFacilities(squad);
  if (f) return f.items.stadiumPitch.turf ?? "natural";
  return aiTurfOf(squad.id, financialTierOf(squad));
}

/** Mowing pattern of a club's stadium: the human club's choice, else the AI rule. */
export function clubMowing(squad: Squad): MowingPattern {
  const f = livingFacilities(squad);
  if (f) return f.mowing ?? "stripes";
  return aiMowingOf(squad.id);
}
