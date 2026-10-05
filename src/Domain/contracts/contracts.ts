import { moraleDemandMult } from "@/Domain/morale/morale";
import { CONTRACT_CONFIG as C } from "@/Domain/contracts/contractConfig";
import { overallAvg } from "@/Domain/playerRating";
import { playerWeeklyWage, wageFactorOf } from "@/Domain/finance/wages";
import { addDays } from "@/Domain/dates";
import type { PlayerContract, RosterPlayer, Squad } from "@/types/playerTypes";
import { clamp } from "@/Domain/math";
import { seedFrom } from "@/Domain/rng";
import {
  ambitionDemandMult, compatriotMult, loyaltyRenewalMult, refusesSmallerClub, seasonsAtClub, smallerClubMult, tierStepsDown,
} from "@/Domain/personality/personality";

type ContractRefusal = "lowWage" | "tooManyYears" | "invalidYears" | "smallerClub";

/**
 * Where a signing comes from (`.claude/rules/game/personality.md`): the player's current club (a
 * purchase) or his last club (a free agent). Only used to compare the clubs' natural tiers.
 */
export interface DemandContext {
  fromSquad?: Pick<Squad, "finances"> | null;
}

/** The parts of a wage demand (each a multiplier, 1 = no effect) and whether he refuses the club. */
export interface DemandBreakdown {
  demand: number;
  /** Before personality (curve × importance × youth × morale). */
  base: number;
  ambition: number;
  /** Own-club renewal only. */
  loyalty: number;
  /** A club of his nationality's country (not his own club). */
  compatriot: number;
  /** A club smaller than his current/last one (ambition). */
  smallerClub: number;
  /** Ambition ≥ 17 and the club two or more tiers smaller. */
  refuses: boolean;
}

export interface ContractOfferResult {
  accepted: boolean;
  reason: "ok" | ContractRefusal;
  /** What the player asks per week. */
  demand: number;
}

/** Adds whole years to an ISO date (Feb 29 clamps to Feb 28). */
export function addYearsIso(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years;
  const rest = iso.slice(4);
  return rest === "-02-29" && !isLeap(y) ? `${y}-02-28` : `${y}${rest}`;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function teamAverage(squad: Squad): number {
  if (squad.players.length === 0) return 0;
  return squad.players.reduce((s, p) => s + overallAvg(p), 0) / squad.players.length;
}

/** Deterministic 0..1 from a player id (and salt). */
function unit(playerId: string, salt: string): number {
  return seedFrom(`${playerId}:${salt}`) / 4294967296;
}

/** Initial contract: deterministic length by age; wage from the shared curve at the club's factor. */
export function initialContract(player: RosterPlayer, squad: Squad, seasonEnd: string): PlayerContract {
  const band = player.age <= C.YOUNG_MAX_AGE ? C.INITIAL_YEARS.young
    : player.age <= C.PRIME_MAX_AGE ? C.INITIAL_YEARS.prime : C.INITIAL_YEARS.veteran;
  const [lo, hi] = band;
  const years = lo + Math.floor(unit(player.id, "initial") * (hi - lo + 1));
  return { until: addYearsIso(seasonEnd, years - 1), wage: playerWeeklyWage(player, wageFactorOf(squad)) };
}

/**
 * Personality multiplier on a wage at `squad` (`.claude/rules/game/personality.md`): ambition
 * always; on a renewal at his own club, loyalty by seasons there; on a signing elsewhere, the
 * compatriot discount and the smaller-club premium (from `ctx.fromSquad`).
 */
function personalityParts(player: RosterPlayer, squad: Squad, ctx: DemandContext = {}) {
  const own = squad.players.some((p) => p.id === player.id);
  const steps = own ? 0 : tierStepsDown(ctx.fromSquad, squad);
  return {
    ambition: ambitionDemandMult(player),
    loyalty: own ? loyaltyRenewalMult(player, seasonsAtClub(player, squad.id)) : 1,
    compatriot: own ? 1 : compatriotMult(player, squad.country),
    smallerClub: smallerClubMult(player, steps),
    refuses: refusesSmallerClub(player, steps),
  };
}

/** The demand and its parts (see `DemandBreakdown`). */
export function demandBreakdown(player: RosterPlayer, squad: Squad, _date: string, ctx: DemandContext = {}): DemandBreakdown {
  const avg = teamAverage(squad);
  const rating = overallAvg(player);
  const importance = 1 + clamp(rating - avg, 0, C.IMPORTANCE_CAP) * C.IMPORTANCE_WEIGHT;
  const young = player.age <= C.YOUNG_MAX_AGE && rating >= avg ? C.YOUNG_RISING_BONUS : 1;
  // An unhappy (or furious) player asks more (`.claude/rules/game/morale.md`); no stored morale = 1.
  const base = playerWeeklyWage(player, wageFactorOf(squad)) * importance * young * moraleDemandMult(player);
  const parts = personalityParts(player, squad, ctx);
  return {
    demand: Math.round(base * parts.ambition * parts.loyalty * parts.compatriot * parts.smallerClub),
    base: Math.round(base),
    ...parts,
  };
}

/** Weekly wage the player asks for at this club. `date` is part of the signature for future seasonality. */
export function contractDemand(player: RosterPlayer, squad: Squad, date: string, ctx: DemandContext = {}): number {
  return demandBreakdown(player, squad, date, ctx).demand;
}

export function evaluateContractOffer(
  offer: { wage: number; years: number },
  player: RosterPlayer,
  squad: Squad,
  date: string,
  ctx: DemandContext = {},
): ContractOfferResult {
  const breakdown = demandBreakdown(player, squad, date, ctx);
  const demand = breakdown.demand;
  // A very ambitious player turns down a much smaller club whatever the terms (`personality.md`).
  if (breakdown.refuses) return { accepted: false, reason: "smallerClub", demand };
  if (!Number.isInteger(offer.years) || offer.years < C.MIN_YEARS || offer.years > C.MAX_YEARS) {
    return { accepted: false, reason: "invalidYears", demand };
  }
  if (player.age + offer.years > C.MAX_CONTRACT_AGE) return { accepted: false, reason: "tooManyYears", demand };
  if (!Number.isFinite(offer.wage) || offer.wage < demand) return { accepted: false, reason: "lowWage", demand };
  return { accepted: true, reason: "ok", demand };
}

/** Length (years) the AI offers on a renewal or free signing, by age. */
export function aiRenewalYears(player: RosterPlayer): number {
  if (player.age <= C.YOUNG_MAX_AGE + 3) return C.AI_RENEW_YEARS.young;
  if (player.age <= 30) return C.AI_RENEW_YEARS.prime;
  return C.AI_RENEW_YEARS.veteran;
}

/**
 * Renewal / fresh contract on the current curve: `years` seasons counting the one ending at
 * `seasonEnd` as the first. Wage is the curve at the club's factor (what the AI pays).
 */
export function renewalContract(player: RosterPlayer, squad: Squad, seasonEnd: string, years: number): PlayerContract {
  // The AI pays the curve shaped by his personality (ambition; loyalty on a renewal at his club,
  // the compatriot discount on a signing) — `.claude/rules/game/personality.md`.
  const p = personalityParts(player, squad);
  const wage = Math.round(playerWeeklyWage(player, wageFactorOf(squad)) * p.ambition * p.loyalty * p.compatriot);
  return { until: addYearsIso(seasonEnd, Math.max(0, years - 1)), wage };
}

/**
 * AI renewal rule: decent for the team (rating >= average - margin), young enough, and the new
 * wage fits under the cap. `wageBill` is the club's bill WITHOUT this player's old wage.
 */
export function aiShouldRenew(
  player: RosterPlayer,
  squad: Squad,
  newWage: number,
  wageBill: number,
  maxWageBudget: number,
): boolean {
  if (player.age >= C.AI_RENEW_MAX_AGE) return false;
  if (overallAvg(player) < teamAverage(squad) - C.AI_RENEW_RATING_MARGIN) return false;
  return wageBill + newWage <= maxWageBudget;
}

/** True when the contract ends on or before `date` (+ optional grace days). */
export function isExpired(contract: PlayerContract | undefined, date: string, graceDays = 0): boolean {
  if (!contract) return false;
  return contract.until <= (graceDays > 0 ? addDays(date, graceDays) : date);
}

/** The next May 31 on or after `date` — only a fallback when a squad's league end is unknown. */
export function defaultSeasonEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  return date <= `${y}-05-31` ? `${y}-05-31` : `${y + 1}-05-31`;
}

/** The squad with an initial contract on every player that has none (others untouched). */
export function withContracts(squad: Squad, seasonEnd: string): Squad {
  if (squad.players.every((p) => p.contract)) return squad;
  return {
    ...squad,
    players: squad.players.map((p) => (p.contract ? p : { ...p, contract: initialContract(p, squad, seasonEnd) })),
  };
}

/**
 * End of a contract of `years` seasons signed on `date`. Off-season signings (date past the
 * league's season end, before the country rollover) count from the NEXT season's end.
 */
export function contractEndFor(date: string, seasonEnd: string, years: number): string {
  const base = date > seasonEnd ? addYearsIso(seasonEnd, 1) : seasonEnd;
  return addYearsIso(base, Math.max(0, years - 1));
}

/**
 * Renewal limits: remaining seasons on the current contract plus `years` may not exceed
 * MAX_YEARS, nor run the player past the age cap.
 */
export function renewalWithinLimits(player: RosterPlayer, date: string, seasonEnd: string, years: number): boolean {
  const firstEnd = date > seasonEnd ? addYearsIso(seasonEnd, 1) : seasonEnd;
  const current = player.contract?.until ?? firstEnd;
  const remaining = Math.max(1, Number(current.slice(0, 4)) - Number(firstEnd.slice(0, 4)) + 1);
  if (remaining + years > C.MAX_YEARS) return false;
  return player.age + remaining - 1 + years <= C.MAX_CONTRACT_AGE;
}
