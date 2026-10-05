import { stripPlayerMorale } from "@/Domain/morale/morale";
import { addDays, daysBetween } from "@/Domain/dates";
import { addYearsIso } from "@/Domain/contracts/contracts";
import { MIN_BY_ROLE, MAX_SQUAD, roleOf } from "@/Domain/contracts/freeAgents";
import { currentWage, wageFactorOf } from "@/Domain/finance/wages";
import { saleContext } from "@/Domain/transfer/transferAcceptance";
import { aiClubFinance, passesWageGate } from "@/Domain/aiFinance/aiClubFinance";
import { closePartialSeason } from "@/Domain/history/history";
import { roundFeeUp } from "@/Domain/negotiation/negotiation";
import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import type { PlayerLoan, RosterPlayer, Squad } from "@/types/playerTypes";
import type { ActiveLoan, MarketBid } from "@/types/transferMarketTypes";

const L = NEGOTIATION.LOAN;

/**
 * Return date of a loan starting on `date`: the end of the borrower's season, or of the next one
 * when fewer than `SHORT_SEASON_DAYS` remain (or the season is already over).
 */
export function loanUntil(date: string, seasonEnd: string): string {
  if (daysBetween(date, seasonEnd) < L.SHORT_SEASON_DAYS) {
    let end = addYearsIso(seasonEnd, 1);
    while (daysBetween(date, end) < L.SHORT_SEASON_DAYS) end = addYearsIso(end, 1);
    return end;
  }
  return seasonEnd;
}

/** Weeks a loan from `date` to `until` lasts (at least 1). */
export function loanWeeks(date: string, until: string): number {
  return Math.max(1, Math.round(daysBetween(date, until) / 7));
}

export type LoanBlock = "starter" | "notAvailable" | "onLoan" | "squadDepth";

/**
 * Whether an AI club lends this player (spec §4): never a starter of its automatic XI, never a
 * player already on loan; then he must be young (≤ 23), on its sell list, or surplus at his role
 * (more than the role minimum + 1 left after he goes).
 */
export function loanAvailability(
  player: RosterPlayer,
  parent: Squad,
  ctx: { starterIds: ReadonlySet<string>; listed: boolean },
): LoanBlock | null {
  if (player.loan) return "onLoan";
  if (ctx.starterIds.has(player.id)) return "starter";
  const role = roleOf(player);
  const inRole = parent.players.filter((p) => roleOf(p) === role).length;
  if (inRole - 1 < MIN_BY_ROLE[role] || parent.players.length <= 15) return "squadDepth";
  const surplus = inRole - 1 > MIN_BY_ROLE[role] + 1;
  if (player.age <= L.YOUNG_AGE || ctx.listed || surplus) return null;
  return "notAvailable";
}

/**
 * The least the parent club wants from a loan, in the same unit as `WAGE_WEIGHT × wage paid + fee`:
 * a share of the wage that grows with the player's importance, plus — above the squad average —
 * part of his value per season.
 */
export function loanMinimum(player: RosterPlayer, parent: Squad, weeks: number): number {
  const ctx = saleContext(player, parent);
  const share = Math.min(L.SHARE_MAX, Math.max(L.SHARE_MIN, L.SHARE_BASE + L.SHARE_SLOPE * ctx.relativeStrength));
  const wageTotal = currentWage(player, wageFactorOf(parent)) * weeks;
  const valuePart = ctx.value * L.FEE_PER_STRENGTH * Math.max(0, ctx.relativeStrength) * (weeks / L.SEASON_WEEKS);
  return L.WAGE_WEIGHT * share * wageTotal + valuePart;
}

export type LoanResponse =
  | { kind: "accept" }
  | { kind: "counter"; wageShare: number; fee: number }
  | { kind: "reject"; reason: LoanBlock };

/**
 * The parent club answers a loan request: `WAGE_WEIGHT × wage paid + loan fee ≥ loanMinimum`
 * accepts; otherwise it counters with the wage share that gets there (rounded up to 10%), or 100%
 * plus a loan fee.
 */
export function respondToLoanRequest(args: {
  player: RosterPlayer;
  parent: Squad;
  wageShare: number;
  fee: number;
  weeks: number;
  starterIds: ReadonlySet<string>;
  listed: boolean;
}): LoanResponse {
  const block = loanAvailability(args.player, args.parent, { starterIds: args.starterIds, listed: args.listed });
  if (block) return { kind: "reject", reason: block };
  const wageTotal = currentWage(args.player, wageFactorOf(args.parent)) * args.weeks;
  const min = loanMinimum(args.player, args.parent, args.weeks);
  const paid = L.WAGE_WEIGHT * args.wageShare * wageTotal + args.fee;
  if (paid >= min) return { kind: "accept" };
  const perShare = L.WAGE_WEIGHT * wageTotal;
  const share = perShare > 0 ? (min - args.fee) / perShare : Infinity;
  if (share <= 1) {
    return { kind: "counter", wageShare: Math.min(1, Math.ceil(share * 10 - 1e-9) / 10), fee: args.fee };
  }
  return { kind: "counter", wageShare: 1, fee: roundFeeUp(Math.max(args.fee, min - perShare)) };
}

/**
 * An AI club's loan bid for one of the human's loan-listed players: the club must need his role
 * (`cover_need`), have room in the squad and the wage gate for its share.
 */
export function buildAiLoanBid(args: {
  id: string;
  player: RosterPlayer;
  playerWage: number;
  buyer: Squad;
  date: string;
  seasonEnd: string;
  rng: () => number;
}): MarketBid | null {
  const { player, buyer } = args;
  if (buyer.players.length >= MAX_SQUAD) return null;
  const steps = Math.round((1 - L.BID_MIN_SHARE) * 10);
  const wageShare = Math.round((L.BID_MIN_SHARE + Math.floor(args.rng() * (steps + 1)) / 10) * 10) / 10;
  if (!passesWageGate(aiClubFinance(buyer), Math.round(args.playerWage * wageShare), 0)) return null;
  return {
    id: args.id,
    kind: "loan",
    playerId: player.id,
    playerName: player.name,
    clubId: buyer.id,
    clubName: buyer.name,
    date: args.date,
    expires: addDays(args.date, NEGOTIATION.BID.VALID_DAYS),
    fee: 0,
    wageShare,
    until: loanUntil(args.date, args.seasonEnd),
  };
}

/**
 * Moves a player on loan from `parent` to `borrower`. His stint at the parent closes as a partial
 * history row (when `from` is known); the contract stays the parent's.
 */
export function squadsAfterLoanStart(
  player: RosterPlayer,
  parent: Squad,
  borrower: Squad,
  loan: PlayerLoan,
  from?: { league: string; season: string } | null,
): { parent: Squad; borrower: Squad } {
  const closed = from
    ? closePartialSeason(player, { squadId: parent.id, clubName: parent.name, league: from.league }, from.season)
    : player;
  // Morale stays with the human club (`.claude/rules/game/morale.md`): the borrower starts fresh.
  const moved: RosterPlayer = { ...stripPlayerMorale(closed), squadId: borrower.id, loan };
  return {
    parent: { ...parent, players: parent.players.filter((p) => p.id !== player.id) },
    borrower: { ...borrower, players: [...borrower.players, moved] },
  };
}

/** The loan is over: the player goes back to `parent`, his stint at the borrower a loan row. */
export function squadsAfterLoanEnd(
  player: RosterPlayer,
  borrower: Squad,
  parent: Squad,
  from?: { league: string; season: string } | null,
): { borrower: Squad; parent: Squad } {
  const closed = from
    ? closePartialSeason(player, { squadId: borrower.id, clubName: borrower.name, league: from.league }, from.season, { loan: true })
    : player;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { loan: _loan, ...rest } = closed;
  const back: RosterPlayer = { ...stripPlayerMorale(rest), squadId: parent.id };
  return {
    borrower: { ...borrower, players: borrower.players.filter((p) => p.id !== player.id) },
    parent: { ...parent, players: [...parent.players.filter((p) => p.id !== player.id), back] },
  };
}

/** Loans due back on `date` (`graceDays` ahead for the rollover). */
export function dueLoans(loans: ActiveLoan[] | undefined, date: string, graceDays = 0): ActiveLoan[] {
  const limit = addDays(date, graceDays);
  return (loans ?? []).filter((l) => l.until <= limit);
}

/** Players of `clubId` out on loan: they still count toward its 30-player cap. */
export function outgoingLoanCount(loans: ActiveLoan[] | undefined, clubId: string): number {
  return (loans ?? []).filter((l) => l.fromClubId === clubId).length;
}

/** Weekly wage the PARENT club still pays for its players out on loan. */
export function parentLoanWages(loans: ActiveLoan[] | undefined, clubId: string): number {
  return (loans ?? [])
    .filter((l) => l.fromClubId === clubId)
    .reduce((s, l) => s + Math.round(l.wage * (1 - l.wageShare)), 0);
}
