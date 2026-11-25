import { addDays, daysBetween } from "@/Domain/dates";
import { addYearsIso } from "@/Domain/contracts/contracts";
import { roleOf } from "@/Domain/contracts/freeAgents";
import { aiClubFinance, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";
import { currentWage } from "@/Domain/finance/wages";
import { loanReport } from "@/Domain/negotiation/loanReport";
import { loanWeeks, respondToLoanRequest } from "@/Domain/negotiation/loans";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { ActiveLoan, LoanRenewalOffer, SquadMarketProfile } from "@/types/transferMarketTypes";

/**
 * Renewing a loan for one more season (12.29, `.claude/rules/game/negotiation.md` → "Renovação de empréstimo"). Pure:
 * when an offer is due, the new return date and the terms. The world I/O is `backend/loanRenewalWorld.ts`.
 */
const R = NEGOTIATION.LOAN_RENEWAL;

/** The offer is due: within LEAD_DAYS of the return date, before it, and not offered yet for this loan. */
export function renewalDue(loan: Pick<ActiveLoan, "until" | "renewalOffered">, date: string): boolean {
  if (loan.renewalOffered || !date || date >= loan.until) return false;
  return daysBetween(date, loan.until) <= R.LEAD_DAYS;
}

/** New return date: one season later, never past the contract; null when the contract does not cover another season. */
export function renewedUntil(
  loan: Pick<ActiveLoan, "until">,
  contractUntil: string | undefined,
  /** The parent is an AI club: it renews the contract to cover the new season (`contractCoveringLoan`). */
  parentRenews = false,
): string | null {
  if (parentRenews) return addYearsIso(loan.until, 1);
  if (!contractUntil || daysBetween(loan.until, contractUntil) < R.MIN_CONTRACT_EXTRA_DAYS) return null;
  const next = addYearsIso(loan.until, 1);
  return contractUntil < next ? contractUntil : next;
}

/**
 * A player on loan AT the human club: the terms his AI parent offers for one more season, or null when it would not
 * lend him again (`loanAvailability`: a starter it needs back, its role minimums). The old terms when they still meet
 * the parent's minimum for the new season, else what the parent accepts (`respondToLoanRequest`'s counter).
 */
export function inboundRenewalTerms(args: {
  player: RosterPlayer;
  parent: Squad;
  loan: Pick<ActiveLoan, "until" | "wageShare" | "fee">;
  until: string;
  starterIds: ReadonlySet<string>;
  listed: boolean;
}): { wageShare: number; fee: number } | null {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { loan: _l, ...free } = args.player;
  const parent = { ...args.parent, players: [...args.parent.players.filter((p) => p.id !== free.id), free] };
  const r = respondToLoanRequest({
    player: free, parent, wageShare: args.loan.wageShare, fee: args.loan.fee,
    weeks: loanWeeks(args.loan.until, args.until), starterIds: args.starterIds, listed: args.listed,
  });
  if (r.kind === "reject") return null;
  if (r.kind === "accept") return { wageShare: args.loan.wageShare, fee: args.loan.fee };
  return { wageShare: r.wageShare, fee: r.fee };
}

/**
 * One of the human's players out on loan at an AI club: the borrower asks to keep him when he did well there (a starter
 * of its automatic XI, MIN_APPS_SHARE of its matches, or a rating of MIN_RATING over MIN_RATED_APPS), it still has a
 * `cover_need` in his line and its wage cap fits its share. Same wage share, no fee.
 */
export function outboundRenewalWanted(args: {
  player: RosterPlayer;
  borrower: Squad;
  loan: Pick<ActiveLoan, "toClubId" | "toClubName" | "startOverall" | "startStats" | "wageShare">;
  profile: SquadMarketProfile | undefined;
  starterIds: ReadonlySet<string>;
  parentWageFactor: number;
}): boolean {
  const { player, borrower } = args;
  const line = roleOf(player);
  if (!args.profile?.needs?.some((n) => n.intentType === "cover_need" && n.position === line)) return false;
  const rep = loanReport(player, args.loan);
  const clubMatches = Math.max(0, ...borrower.players.map((p) => p.seasonLog?.appearances ?? 0));
  const played = clubMatches > 0 && rep.apps >= R.MIN_APPS_SHARE * clubMatches;
  const rated = rep.apps >= R.MIN_RATED_APPS && (rep.avgRating ?? 0) >= R.MIN_RATING;
  if (!args.starterIds.has(player.id) && !played && !rated) return false;
  // Its share of the wage is already in the bill: the bill without him must still take it.
  const share = Math.round(currentWage(player, args.parentWageFactor) * args.loan.wageShare);
  const without = { ...borrower, players: borrower.players.filter((p) => p.id !== player.id) };
  return passesWageGate(aiClubFinance(without), share, 0);
}

/** The offer record (`expires` = the day before the loan ends). */
export function loanRenewalOffer(args: {
  id: string; direction: "in" | "out"; player: Pick<RosterPlayer, "id" | "name" | "contract">; club: Pick<Squad, "id" | "name">;
  date: string; loanUntil: string; until: string; wageShare: number; fee: number;
}): LoanRenewalOffer {
  const lastDay = addDays(args.loanUntil, -1);
  return {
    id: args.id, direction: args.direction, playerId: args.player.id, playerName: args.player.name,
    clubId: args.club.id, clubName: args.club.name, date: args.date,
    expires: lastDay < args.date ? args.date : lastDay, until: args.until, wageShare: args.wageShare, fee: args.fee,
    ...(args.player.contract?.wage ? { wage: args.player.contract.wage } : {}),
  };
}

/** Offers still open on `date` for loans still running. */
export function liveLoanRenewals(offers: LoanRenewalOffer[] | undefined, loans: ActiveLoan[] | undefined, date: string): LoanRenewalOffer[] {
  const running = new Set((loans ?? []).map((l) => l.playerId));
  return (offers ?? []).filter((o) => o.expires >= date && running.has(o.playerId));
}

/** The loan and the player's loan mark after an accepted renewal. */
export function renewedLoan<L extends Pick<ActiveLoan, "until" | "wageShare" | "fee">>(loan: L, offer: LoanRenewalOffer): L {
  return { ...loan, until: offer.until, wageShare: offer.wageShare, fee: offer.fee };
}
