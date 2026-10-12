import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { PERSONALITY } from "@/Domain/personality/personalityConfig";
import { traitT } from "@/Domain/personality/personality";
import { appealPreferencePenalty } from "@/Domain/facilities/facilities";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";

/**
 * How keen a player is on joining the user's club, as the scout reads it (#123). Built from the
 * same pieces as the real decision (`preferenceScore`, `refusesSmallerClub`, `refusesPoorFacilities`,
 * `sellPush`), but only on what the user sees: the traits of the scout's personality view, the
 * overall the screen shows. A hint, never a promise: the negotiation still uses the real values.
 */
export type ScoutInterest = "interested" | "hesitant" | "not_coming";

export interface InterestInput {
  /** Traits as the scout sees them (null = unknown: read as neutral). */
  ambition: number | null;
  loyalty: number | null;
  /** Natural tiers the user's club sits below / above the player's club (0 when not). */
  stepsDown: number;
  stepsUp: number;
  /** Free agent: no club to leave. */
  free: boolean;
  /** The player's club plays in the user's league (a direct rival). */
  sameLeague: boolean;
  age: number;
  /** Overall the screen shows (the middle of the range). */
  rating: number;
  /** Average overall of the user's squad. */
  buyerAvg: number;
  /** `facilitiesAppeal` of the user's club for him (100 = no effect). */
  appeal: number;
  /** Training-ground condition of the user's club (refusal of the very ambitious below 25%). */
  trainingCondition: number;
}

const PREF = NEGOTIATION.PREFERENCE;
const PEAK_AGE = { MIN: 25, MAX: 30 } as const;

/** Tuning of the hint (`scouting.md` → "Interesse"). */
export const INTEREST = {
  /** Interested from this score up; hesitant down to `HESITANT_MIN`; below, "would not come". */
  INTERESTED_MIN: -0.05,
  HESITANT_MIN: -0.17,
  /** A direct rival (same league) sells/leaves reluctantly. */
  RIVAL: 0.1,
  /** A star (≥ buyer average + 0.5) in his prime (25–30) does not step sideways. */
  PEAK_STAR: 0.1,
  PEAK_STAR_GAP: 0.5,
  /** A free agent just wants a club. */
  FREE: 0.15,
} as const;

const tOf = (v: number | null): number => (v === null ? 0 : traitT(v));

/**
 * Chance of starting as the screen can judge it: 1 near the buyer's average, 0.5 a bit below,
 * 0.25 well below (a reserve, but at a stronger squad than his: not a reason to say no).
 */
function starterGuess(rating: number, buyerAvg: number): number {
  if (rating >= buyerAvg - 0.3) return 1;
  if (rating >= buyerAvg - 0.8) return 0.5;
  return 0.25;
}

/** The hint's score (higher = keener). Exported for the tests and the tuning. */
export function interestScore(i: InterestInput): number {
  const tAmb = tOf(i.ambition);
  const tLoy = tOf(i.loyalty);
  // Prestige: the club's size against his own (35% of the real preference), the ambitious
  // weighing a smaller club more (the demand's `smallerClubMult`).
  const prestige = PREF.PRESTIGE * (i.stepsUp - i.stepsDown) / 3
    - PERSONALITY.SMALLER_CLUB_STEP * Math.max(0, tAmb) * i.stepsDown;
  const starter = PREF.STARTER * (starterGuess(i.rating, i.buyerAvg) - 0.5);
  const leaving = i.free
    ? INTEREST.FREE
    : -PERSONALITY.SELL_LOYALTY * Math.max(0, tLoy) - (i.sameLeague ? INTEREST.RIVAL : 0);
  const peakStar = i.age >= PEAK_AGE.MIN && i.age <= PEAK_AGE.MAX && i.stepsUp === 0
    && i.rating >= i.buyerAvg + INTEREST.PEAK_STAR_GAP ? INTEREST.PEAK_STAR : 0;
  return prestige + starter + leaving - peakStar - appealPreferencePenalty(i.appeal);
}

/** The hint: "would not come" when he would refuse outright (as the scout sees his ambition). */
export function scoutInterest(i: InterestInput): ScoutInterest {
  const veryAmbitious = (i.ambition ?? 0) >= PERSONALITY.SMALLER_CLUB_REFUSE_AMBITION;
  if (veryAmbitious && i.stepsDown >= PERSONALITY.SMALLER_CLUB_REFUSE_STEPS) return "not_coming";
  if (veryAmbitious && i.trainingCondition < FACILITIES.APPEAL.REFUSE_BELOW) return "not_coming";
  const s = interestScore(i);
  if (s >= INTEREST.INTERESTED_MIN) return "interested";
  if (s >= INTEREST.HESITANT_MIN) return "hesitant";
  return "not_coming";
}

/**
 * The "fits the budget" filter (#123): the estimated fee within the club's balance, and the
 * estimated asking wage within the wage cap. Free agents cost no fee.
 */
export function fitsScoutBudget(i: {
  feeEur: number;
  weeklyWage: number;
  balance: number;
  wageBill: number;
  maxWageBudget: number;
}): boolean {
  if (i.feeEur > Math.max(0, i.balance)) return false;
  return i.wageBill + i.weeklyWage <= i.maxWageBudget;
}

// ── Scout rows: the hint and the budget flag for every player outside the user's squad ──────

/** What the search needs of the user's club (built once per index on the server). */
export interface BuyerContext {
  squadId: string;
  leagueSlug: string;
  /** Natural financial tier index of the user's club (LOW 0 … ELITE 3). */
  tier: number;
  buyerAvg: number;
  /** `facilitiesAppeal` of the user's club for a player of this age. */
  appealFor: (age: number) => number;
  trainingCondition: number;
  balance: number;
  wageBill: number;
  maxWageBudget: number;
  /** The user's club wage factor (asking wage = curve × factor). */
  wageFactor: number;
  /** Natural tier index of a club by id (undefined: unknown club). */
  tierOf: (squadId: string) => number | undefined;
}

/** The fields of a scout row the hint reads (a subset of `DisplayPlayer`). */
export interface InterestRow {
  squadId?: string;
  free?: boolean;
  leagueSlug?: string;
  age: number;
  avg: number;
  valueMillions: number;
  personality?: { traits: { ambition: number | null; loyalty: number | null } };
}

export function interestInputFor(row: InterestRow, buyer: BuyerContext): InterestInput {
  const from = row.free || !row.squadId ? undefined : buyer.tierOf(row.squadId);
  const steps = from === undefined ? 0 : from - buyer.tier;
  return {
    ambition: row.personality?.traits.ambition ?? null,
    loyalty: row.personality?.traits.loyalty ?? null,
    stepsDown: Math.max(0, steps),
    stepsUp: Math.max(0, -steps),
    free: !!row.free,
    sameLeague: !row.free && !!row.leagueSlug && row.leagueSlug === buyer.leagueSlug,
    age: row.age,
    rating: row.avg,
    buyerAvg: buyer.buyerAvg,
    appeal: buyer.appealFor(row.age),
    trainingCondition: buyer.trainingCondition,
  };
}

/**
 * The hint and the budget flag of one row (`undefined` for the user's own players). The fee is the
 * value the screen shows (the middle of its range), the asking wage the curve at the shown overall
 * times the user's club factor.
 */
export function scoutRowExtras(
  row: InterestRow,
  buyer: BuyerContext,
  weeklyWageAt: (rating: number) => number,
): { interest: ScoutInterest; affordable: boolean } | undefined {
  if (row.squadId && row.squadId === buyer.squadId) return undefined;
  const affordable = fitsScoutBudget({
    feeEur: row.free ? 0 : row.valueMillions * 1_000_000,
    weeklyWage: weeklyWageAt(row.avg) * buyer.wageFactor,
    balance: buyer.balance,
    wageBill: buyer.wageBill,
    maxWageBudget: buyer.maxWageBudget,
  });
  return { interest: scoutInterest(interestInputFor(row, buyer)), affordable };
}
