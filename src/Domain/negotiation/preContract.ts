import { addDays } from "@/Domain/dates";
import { aiClubFinance } from "@/Domain/aiFinance/aiClubFinance";
import { aiShouldRenew, contractDemand, evaluateContractOffer, renewalContract } from "@/Domain/contracts/contracts";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { preferenceScore, starterChance, type PreferenceInput } from "@/Domain/negotiation/rivals";
import { freeSigningScore, preferredRival, type FreeSigningRival } from "@/Domain/negotiation/freeSigning";
import { facilitiesAppeal } from "@/Domain/facilities/facilities";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

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
  | { accepted: false; reason: "notEligible" | "lowWage" | "lowBonus" | "tooManyYears" | "invalidYears" | "prefersCurrent" | "smallerClub" | "poorFacilities"; demand: number; preference?: { human: number; current: number } }
  | { accepted: false; reason: "prefersRival"; demand: number; rival: FreeSigningRival };

/**
 * The player's answer: the contract terms must be acceptable (`evaluateContractOffer` at the human
 * club), then — when his AI club would renew him (`aiShouldRenew`) — the human club must beat the
 * renewal on preference (wage, prestige, chance of starting).
 */
export function answerPreContract(args: {
  /** `bonus`: signing bonus offered, EUR (4.47.9); must reach `bonusAsk`. */
  offer: { wage: number; years: number; bonus?: number };
  /** Signing bonus he asks (`signingBonusAsk`); absent = none (tests of the older rule). */
  bonusAsk?: number;
  /** AI clubs competing for him, with their preference inputs (`freeSigningRivals`). */
  rivals?: { rival: FreeSigningRival; pref: PreferenceInput }[];
  player: RosterPlayer;
  human: Squad;
  current: Squad;
  date: string;
  /** Club prestige 0..1. */
  humanPrestige: number;
  currentPrestige: number;
  /** Next season end of the current club (renewal contract). */
  nextSeasonEnd: string;
  /** The human manager's Negotiation attribute (`achievements.md`). */
  negotiation?: number;
  /** The manager's fame from his belongings, 0..1 (8.9.39). */
  fame?: number;
}): PreContractAnswer {
  const { player, human, current, date } = args;
  // Personality (`personality.md`): coming from `current` (smaller-club premium / refusal).
  const ctx = { fromSquad: current, negotiation: args.negotiation, fame: args.fame, freeArrival: true };
  const demand = contractDemand(player, human, date, ctx);
  if (!preContractEligible(player, date)) return { accepted: false, reason: "notEligible", demand };
  const terms = evaluateContractOffer(args.offer, player, human, date, ctx);
  if (!terms.accepted) return { accepted: false, reason: terms.reason as "lowWage" | "tooManyYears" | "invalidYears" | "smallerClub" | "poorFacilities", demand: terms.demand };
  const ask = args.bonusAsk ?? 0;
  const bonus = args.offer.bonus ?? 0;
  if (bonus < ask) return { accepted: false, reason: "lowBonus", demand };
  const humanPref: PreferenceInput = {
    wage: args.offer.wage, demand, prestige: args.humanPrestige, starter: starterChance(player, human),
    facilitiesAppeal: facilitiesAppeal(human, player),
  };
  // Other clubs after a free player (4.47.9): he picks the best offer, bonus included.
  const rival = args.rivals?.length ? preferredRival({ human: { pref: humanPref, bonus }, rivals: args.rivals, ask }) : null;
  if (rival) return { accepted: false, reason: "prefersRival", demand, rival };
  const renewal = renewalContract(player, current, args.nextSeasonEnd, 1);
  const fin = aiClubFinance(current);
  const billWithout = squadWeeklyWages(current.players.filter((p) => p.id !== player.id), wageFactorOf(current));
  const aiRenews = aiShouldRenew(player, current, renewal.wage, billWithout, fin.maxWageBudget);
  const preference = {
    human: ask > 0 ? freeSigningScore(humanPref, bonus, ask) : preferenceScore(humanPref),
    current: (() => {
      const pref = { wage: renewal.wage, demand: contractDemand(player, current, date), prestige: args.currentPrestige, starter: starterChance(player, current) };
      // Staying, he signs no new bonus: his club's renewal counts as a bonus at the asked level.
      return ask > 0 ? freeSigningScore(pref, ask, ask) : preferenceScore(pref);
    })(),
  };
  if (aiRenews && preference.current >= preference.human) {
    return { accepted: false, reason: "prefersCurrent", demand, preference };
  }
  return { accepted: true, preference };
}
