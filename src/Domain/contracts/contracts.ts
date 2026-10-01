import { CONTRACT_CONFIG as C } from "@/Domain/contracts/contractConfig";
import { overallAvg } from "@/Domain/playerRating";
import { playerWeeklyWage, wageFactorOf } from "@/Domain/finance/wages";
import { seedFrom } from "@/Domain/cups/cupIds";
import type { PlayerContract, RosterPlayer, Squad } from "@/types/playerTypes";

export type ContractRefusal = "lowWage" | "tooManyYears" | "invalidYears";

export interface ContractOfferResult {
  accepted: boolean;
  reason: "ok" | ContractRefusal;
  /** What the player asks per week. */
  demand: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Adds whole years to an ISO date (Feb 29 clamps to Feb 28). */
export function addYearsIso(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years;
  const rest = iso.slice(4);
  return rest === "-02-29" && !isLeap(y) ? `${y}-02-28` : `${y}${rest}`;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function teamAverage(squad: Squad): number {
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

/** Weekly wage the player asks for at this club. `date` is part of the signature for future seasonality. */
export function contractDemand(player: RosterPlayer, squad: Squad, _date: string): number {
  const avg = teamAverage(squad);
  const rating = overallAvg(player);
  const importance = 1 + clamp(rating - avg, 0, C.IMPORTANCE_CAP) * C.IMPORTANCE_WEIGHT;
  const young = player.age <= C.YOUNG_MAX_AGE && rating >= avg ? C.YOUNG_RISING_BONUS : 1;
  return Math.round(playerWeeklyWage(player, wageFactorOf(squad)) * importance * young);
}

export function evaluateContractOffer(
  offer: { wage: number; years: number },
  player: RosterPlayer,
  squad: Squad,
  date: string,
): ContractOfferResult {
  const demand = contractDemand(player, squad, date);
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
  return { until: addYearsIso(seasonEnd, Math.max(0, years - 1)), wage: playerWeeklyWage(player, wageFactorOf(squad)) };
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
  return contract.until <= (graceDays > 0 ? addDaysIso(date, graceDays) : date);
}
