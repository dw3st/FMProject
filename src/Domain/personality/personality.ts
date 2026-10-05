/**
 * Player personality (`.claude/rules/game/personality.md`). Pure, no I/O.
 *
 * Four traits (1..20) derived deterministically from the player's id — never stored, so no save
 * migration and the same player has the same personality in every career. A reborn player inherits
 * the original's (`reborn.fromId`); `RosterPlayer.personality` is only an override (tests).
 *
 * Nobody outside this file reads the raw traits: consumers call the multipliers below, each exactly
 * 1 (or 0) at the neutral value 10,5. The distribution is symmetric around it, so the world-average
 * effect of every multiplier is 1.
 */
import { PERSONALITY as P } from "@/Domain/personality/personalityConfig";
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { naturalFinancialTier, tierIndex } from "@/Domain/aiFinance/aiClubFinance";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type {
  Personality, PersonalitySummary, PersonalityTrait, PersonalityView, TraitBand,
} from "@/types/personalityTypes";

export const PERSONALITY_TRAITS: readonly PersonalityTrait[] = ["ambition", "loyalty", "professionalism", "temperament"];

type PersonalityHolder = Pick<RosterPlayer, "id"> & Partial<Pick<RosterPlayer, "reborn" | "personality">>;

// ── Generation ───────────────────────────────────────────────────────────────

/** 1..20 bell-shaped draw: mean of three uniform hashes. */
function draw(id: string, trait: string): number {
  const r = mulberry32(seedFrom(`personality:${id}:${trait}`));
  const raw = (r() + r() + r()) / 3;
  return 1 + Math.round(raw * (P.MAX - P.MIN));
}

const cache = new Map<string, Personality>();

/** The personality generated for an id (no override). */
export function generatePersonality(id: string): Personality {
  const hit = cache.get(id);
  if (hit) return hit;
  const ambition = draw(id, "ambition");
  const loyalty = clamp(
    Math.round(P.LOYALTY_OWN * draw(id, "loyalty") + P.LOYALTY_AMBITION * (P.MAX + P.MIN - ambition)),
    P.MIN, P.MAX,
  );
  const out: Personality = {
    ambition,
    loyalty,
    professionalism: draw(id, "professionalism"),
    temperament: draw(id, "temperament"),
  };
  if (cache.size > 200_000) cache.clear();
  cache.set(id, out);
  return out;
}

/** A player's personality: the override, else derived from his id (a reborn player: the original's). */
export function personalityOf(p: PersonalityHolder): Personality {
  if (p.personality) return p.personality;
  return generatePersonality(p.reborn?.fromId ?? p.id);
}

// ── Scale, bands, summary ────────────────────────────────────────────────────

/** −1..1, 0 at the neutral value 10,5. */
export function traitT(v: number): number {
  return clamp((v - P.NEUTRAL) / P.SPAN, -1, 1);
}

function t(p: PersonalityHolder, trait: PersonalityTrait): number {
  return traitT(personalityOf(p)[trait]);
}

export function traitBand(v: number): TraitBand {
  if (v <= P.BAND_MAX.very_low) return "very_low";
  if (v <= P.BAND_MAX.low) return "low";
  if (v <= P.BAND_MAX.medium) return "medium";
  if (v <= P.BAND_MAX.high) return "high";
  return "very_high";
}

/** Band index 1..5 (the 5-segment bar). */
export function bandLevel(band: TraitBand): number {
  return ["very_low", "low", "medium", "high", "very_high"].indexOf(band) + 1;
}

const SUMMARY_HIGH: Record<PersonalityTrait, PersonalitySummary> = {
  ambition: "ambitious", loyalty: "loyal", professionalism: "professional", temperament: "hothead",
};
const SUMMARY_LOW: Record<PersonalityTrait, PersonalitySummary> = {
  ambition: "settled", loyalty: "mercenary", professionalism: "sloppy", temperament: "calm",
};

/** One-word summary from the known trait furthest from neutral ("balanced" when none stands out). */
export function summaryOf(traits: Partial<Record<PersonalityTrait, number | null>>): PersonalitySummary {
  let best: PersonalityTrait | null = null;
  let dev = 0;
  for (const trait of PERSONALITY_TRAITS) {
    const v = traits[trait];
    if (v === null || v === undefined) continue;
    const d = Math.abs(v - P.NEUTRAL);
    if (d > dev) { dev = d; best = trait; }
  }
  if (!best || dev < P.SUMMARY_MIN_DEV) return "balanced";
  return (traits[best] as number) > P.NEUTRAL ? SUMMARY_HIGH[best] : SUMMARY_LOW[best];
}

export function summaryTrait(p: PersonalityHolder): PersonalitySummary {
  return summaryOf(personalityOf(p));
}

// ── Scout view ───────────────────────────────────────────────────────────────

function signedNoise(key: string): number {
  return mulberry32(seedFrom(key))() * 2 - 1;
}

/**
 * What the screens show of `p`'s personality with the chief scout's uncertainty `scoutNoise`
 * (0..1,5): each trait shifted by up to ±(noise × 4), deterministic per save + player + trait,
 * clamped to 1..20; from noise 1 temperament and professionalism read as unknown. 0 = exact.
 */
export function obscurePersonality(personality: Personality, scoutNoise: number, saveId: string, playerId: string): PersonalityView {
  const traits = {} as Record<PersonalityTrait, number | null>;
  for (const trait of PERSONALITY_TRAITS) {
    if (scoutNoise <= 0) { traits[trait] = personality[trait]; continue; }
    if (scoutNoise >= P.SCOUT_UNKNOWN_NOISE && (trait === "temperament" || trait === "professionalism")) {
      traits[trait] = null;
      continue;
    }
    const shift = Math.round(scoutNoise * P.SCOUT_SCALE * signedNoise(`${saveId}:${playerId}:personality:${trait}`));
    traits[trait] = clamp(personality[trait] + shift, P.MIN, P.MAX);
  }
  return { traits, uncertain: scoutNoise >= P.SCOUT_UNCERTAIN_NOISE };
}

/** The screens' view: the scout's (other clubs) or the exact personality (own club). */
export function personalityViewOf(p: RosterPlayer): PersonalityView {
  return p.personalityView ?? { traits: { ...personalityOf(p) }, uncertain: false };
}

// ── Development (professionalism) ────────────────────────────────────────────

/** DP multiplier: ×0,85 (sloppy) … ×1,15 (model professional). */
export function professionalismDpMult(p: PersonalityHolder): number {
  return 1 + P.DP_WEIGHT * t(p, "professionalism");
}

/** Age-decay multiplier: the model professional keeps his level a little longer. */
export function professionalismDecayMult(p: PersonalityHolder): number {
  return 1 - P.DECAY_WEIGHT * t(p, "professionalism");
}

/**
 * Morale DP multiplier seen through the personality: a professional (t ≥ 0,4) does not lose DP to
 * low morale (the very-happy bonus stays).
 */
export function shieldedMoraleDpMult(p: PersonalityHolder, moraleMult: number): number {
  return moraleMult < 1 && t(p, "professionalism") >= P.PRO_MORALE_SHIELD_T ? 1 : moraleMult;
}

/** Everything personal on the DP of a session or match: professionalism × the (shielded) morale. */
export function personalDpMult(p: PersonalityHolder, moraleMult = 1): number {
  return professionalismDpMult(p) * shieldedMoraleDpMult(p, moraleMult);
}

// ── Discipline (temperament) ─────────────────────────────────────────────────

/** Temperament t of a player (the engine stores it on `GamePlayer.temperament`). */
export function temperamentT(p: PersonalityHolder): number {
  return t(p, "temperament");
}

/** t of a whole-side temperament override (1..20); undefined = none. */
export function temperamentTOf(v: number | undefined): number | undefined {
  return v === undefined ? undefined : traitT(v);
}

export function temperamentFoulMult(tt: number): number {
  return 1 + P.FOUL_WEIGHT * tt;
}

export function temperamentYellowMult(tt: number): number {
  return 1 + P.YELLOW_WEIGHT * tt;
}

export function temperamentRedMult(tt: number): number {
  return 1 + P.RED_WEIGHT * tt;
}

// ── Morale (human club) ──────────────────────────────────────────────────────

/** Every morale event delta × this (temperament). */
export function moraleVolatility(p: PersonalityHolder): number {
  return 1 + P.MORALE_VOLATILITY * t(p, "temperament");
}

/** Minutes deficit (negative Monday delta) × this (ambition). */
export function minutesDeficitMult(p: PersonalityHolder): number {
  return 1 + P.MINUTES_AMBITION * t(p, "ambition");
}

export function isLoyal(p: PersonalityHolder): boolean {
  return personalityOf(p).loyalty >= P.LOYAL_MIN;
}

/** Morale below which he asks for a transfer (null: a loyal player never asks from morale alone). */
export function transferRequestBelow(p: PersonalityHolder, base: number): number | null {
  if (isLoyal(p)) return null;
  return base + P.TRANSFER_REQUEST_AMBITION * t(p, "ambition");
}

/** Does a bid make him ask to talk about the move (wants_move)? */
export function wantsMove(p: PersonalityHolder, morale: number, stronger: boolean, base: number): boolean {
  if (isLoyal(p)) return morale < P.LOYAL_WANTS_MOVE_BELOW;
  if (morale < base + P.WANTS_MOVE_AMBITION * t(p, "ambition")) return true;
  return stronger && personalityOf(p).ambition >= P.STRONGER_BID_MIN_AMBITION;
}

/** "Listed for sale without asking" × this: the loyal one feels it more. */
export function listedUnaskedMult(p: PersonalityHolder): number {
  return 1 + P.LISTED_LOYALTY * t(p, "loyalty");
}

/** "Broken promise" × this: the loyal one forgives more. */
export function promiseBrokenMult(p: PersonalityHolder): number {
  return 1 - P.BROKEN_PROMISE_LOYALTY * t(p, "loyalty");
}

/** "Demand more" works on a professional as on a content player. */
export function takesDemandWell(p: PersonalityHolder): boolean {
  return personalityOf(p).professionalism >= P.PRO_DEMAND_MIN;
}

// ── Contracts and transfers ──────────────────────────────────────────────────

/** Wage demand × this: the ambitious asks up to 8% more, the settled 8% less. */
export function ambitionDemandMult(p: PersonalityHolder): number {
  return 1 + P.AMBITION_DEMAND * t(p, "ambition");
}

/** Seasons at `squadId`: closed seasons there in his history, plus the current one when he is there. */
export function seasonsAtClub(p: Pick<RosterPlayer, "squadId" | "history">, squadId: string): number {
  const seasons = new Set((p.history ?? []).filter((r) => r.squadId === squadId && !r.loan).map((r) => r.season));
  return seasons.size + (p.squadId === squadId ? 1 : 0);
}

/** Own-club renewal × this: a loyal player with years at the club asks up to 10% less. */
export function loyaltyRenewalMult(p: PersonalityHolder, seasons: number): number {
  return 1 - P.LOYALTY_RENEWAL * Math.max(0, t(p, "loyalty")) * Math.min(1, seasons / P.LOYALTY_FULL_SEASONS);
}

/** Signing by a club of his own country × this: a loyal player asks up to 5% less. */
export function compatriotMult(p: PersonalityHolder & Pick<RosterPlayer, "nationality">, clubCountry: string | undefined): number {
  if (!clubCountry || !p.nationality || p.nationality !== clubCountry) return 1;
  return 1 - P.COMPATRIOT * Math.max(0, t(p, "loyalty"));
}

/** Natural tiers (by income) the buyer sits below his current/last club (0 when not smaller). */
export function tierStepsDown(fromSquad: Pick<Squad, "finances"> | null | undefined, toSquad: Pick<Squad, "finances">): number {
  if (!fromSquad) return 0;
  return Math.max(0, tierIndex(naturalFinancialTier(fromSquad.finances)) - tierIndex(naturalFinancialTier(toSquad.finances)));
}

/** Demand × this for a club `steps` tiers smaller. */
export function smallerClubMult(p: PersonalityHolder, steps: number): number {
  if (steps <= 0) return 1;
  return 1 + P.SMALLER_CLUB_STEP * Math.max(0, t(p, "ambition")) * steps;
}

/** A very ambitious player refuses a club two or more tiers smaller. */
export function refusesSmallerClub(p: PersonalityHolder, steps: number): boolean {
  return steps >= P.SMALLER_CLUB_REFUSE_STEPS && personalityOf(p).ambition >= P.SMALLER_CLUB_REFUSE_AMBITION;
}

/**
 * AI seller score push: the ambitious forces a move to a bigger club, the loyal "does not want to
 * leave". Added to `saleDecisionScore`.
 */
export function sellPush(p: PersonalityHolder, buyerIsBigger: boolean): number {
  return (buyerIsBigger ? P.SELL_AMBITION * t(p, "ambition") : 0) - P.SELL_LOYALTY * Math.max(0, t(p, "loyalty"));
}
