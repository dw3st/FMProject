import { addDays } from "@/Domain/dates";
import { aiClubFinance } from "@/Domain/aiFinance/aiClubFinance";
import { aiShouldRenew, contractDemand, evaluateContractOffer, renewalContract } from "@/Domain/contracts/contracts";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { preferenceScore, starterChance } from "@/Domain/negotiation/rivals";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { PreContract } from "@/types/transferMarketTypes";

/**
 * Pre-contracts (D2, Etapa 25, `.claude/rules/game/negotiation.md`): the human signs an AI player
 * whose contract ends within PRE_CONTRACT_DAYS, for free, at any time (no window). He joins at the
 * rollover of his club's country, before the AI renewals. Pure.
 */

/** Contract ends within PRE_CONTRACT_DAYS of `date` (and not already over). */
export function preContractEligible(player: RosterPlayer, date: string): boolean {
  const until = player.contract?.until;
  if (!until || player.loan) return false;
  return until >= date && until <= addDays(date, NEGOTIATION.PRE_CONTRACT_DAYS);
}

export type PreContractAnswer =
  | { accepted: true; preference: { human: number; current: number } }
  | { accepted: false; reason: "notEligible" | "lowWage" | "tooManyYears" | "invalidYears" | "prefersCurrent" | "smallerClub"; demand: number; preference?: { human: number; current: number } };

/**
 * The player's answer: the contract terms must be acceptable (`evaluateContractOffer` at the human
 * club), then — when his AI club would renew him (`aiShouldRenew`) — the human club must beat the
 * renewal on preference (wage, prestige, chance of starting).
 */
export function answerPreContract(args: {
  offer: { wage: number; years: number };
  player: RosterPlayer;
  human: Squad;
  current: Squad;
  date: string;
  /** Club prestige 0..1. */
  humanPrestige: number;
  currentPrestige: number;
  /** Next season end of the current club (renewal contract). */
  nextSeasonEnd: string;
}): PreContractAnswer {
  const { player, human, current, date } = args;
  // Personality (`personality.md`): coming from `current` (smaller-club premium / refusal).
  const ctx = { fromSquad: current };
  const demand = contractDemand(player, human, date, ctx);
  if (!preContractEligible(player, date)) return { accepted: false, reason: "notEligible", demand };
  const terms = evaluateContractOffer(args.offer, player, human, date, ctx);
  if (!terms.accepted) return { accepted: false, reason: terms.reason as "lowWage" | "tooManyYears" | "invalidYears" | "smallerClub", demand: terms.demand };
  const renewal = renewalContract(player, current, args.nextSeasonEnd, 1);
  const fin = aiClubFinance(current);
  const billWithout = squadWeeklyWages(current.players.filter((p) => p.id !== player.id), wageFactorOf(current));
  const aiRenews = aiShouldRenew(player, current, renewal.wage, billWithout, fin.maxWageBudget);
  const preference = {
    human: preferenceScore({ wage: args.offer.wage, demand, prestige: args.humanPrestige, starter: starterChance(player, human) }),
    current: preferenceScore({ wage: renewal.wage, demand: contractDemand(player, current, date), prestige: args.currentPrestige, starter: starterChance(player, current) }),
  };
  if (aiRenews && preference.current >= preference.human) {
    return { accepted: false, reason: "prefersCurrent", demand, preference };
  }
  return { accepted: true, preference };
}

/** Pre-contracts of players at `squadIds` (the clubs whose country rolls today). */
export function dueAtRollover(preContracts: PreContract[] | undefined, squadIds: Set<string>): PreContract[] {
  return (preContracts ?? []).filter((p) => squadIds.has(p.fromClubId));
}
