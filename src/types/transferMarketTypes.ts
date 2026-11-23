import type { MainRole } from "@/Domain/roles";

export type TransferBudgetTier = "low" | "mid" | "high";

type TransferIntentType =
  | "cover_need"
  | "future_investment"
  | "improvement";

export interface TransferNeed {
  position: MainRole;
  targetMin: number;
  targetMax: number;
  urgency: number;
  budgetTier: TransferBudgetTier;
  intentType: TransferIntentType;
}

export interface SellCandidate {
  playerId: string;
  /** 0–1: how willing the club is to sell this player. Higher = easier to buy. */
  priority: number;
  /** Human list only: he asked to leave (transfer request, `.claude/rules/game/morale.md`). */
  requested?: true;
  /** Human list only: asking price set by the manager, EUR (#88). Absent = his market value. */
  askingPrice?: number;
}

export interface SquadMarketProfile {
  squadId: string;
  needs: TransferNeed[];
  sellList: SellCandidate[];
  lastUpdateDay: string;
}

export interface MarketState {
  shuffledTeamIds: string[];
  rotationIndex: number;
  profiles: Record<string, SquadMarketProfile>;
  /** Human-managed sell list — persisted separately from AI profiles. */
  playerSellList: SellCandidate[];
  /** Human players offered on loan (`.claude/rules/game/negotiation.md`). */
  playerLoanList?: string[];
  /** AI bids (transfer and loan) for the human's players, answered from the inbox. */
  pendingBids?: MarketBid[];
  /** Negotiation state per `<kind>:<playerId>` (rounds of the day, closed talks, last counter). */
  talks?: Record<string, NegotiationTalk>;
  /** Active loans involving the human club (in or out), for returns, wages and the UI. */
  loans?: ActiveLoan[];
  /** Sell-on clauses the human club holds on players it sold (removed once paid). */
  sellOnHeld?: SellOnHeld[];
  /** AI rivals bidding for a player the human negotiates (`.claude/rules/game/negotiation.md`, Etapa 25). */
  rivalBids?: RivalBid[];
  /** Pre-contracts signed by the human with AI players whose contract ends (Etapa 25). */
  preContracts?: PreContract[];
  /** Fee transfers agreed with the window closed: the player joins when it opens (tester report 0a35192c). */
  deferredTransfers?: DeferredTransfer[];
  /** Offers to renew a loan of the human club for one more season (12.29), answered from the inbox. */
  loanRenewals?: LoanRenewalOffer[];
  /** Players the human lost to a rival (kept for the talk screen, pruned after a week). */
  lostTargets?: { playerId: string; clubName: string; fee: number; date: string }[];
}

/** The world's part of `market.json`: the AI rotation and profiles (`saves/{id}/market.json`). */
export type WorldMarketState = Pick<MarketState, "shuffledTeamIds" | "rotationIndex" | "profiles">;

/** A seat's part of the market (`seats/{seatId}/market.json`): lists, bids, talks, loans, clauses of its club. */
export type SeatMarketState = Omit<MarketState, keyof WorldMarketState>;

/** An AI club competing with the human for the same AI player (Etapa 25). */
export interface RivalBid {
  playerId: string;
  playerName: string;
  /** The selling club. */
  fromClubId: string;
  clubId: string;
  clubName: string;
  /** Fee offered to the seller, EUR. */
  fee: number;
  /** Weekly wage offered to the player, EUR. */
  wage: number;
  date: string;
  /** If the human has not taken the player by then, the seller sells to this club. */
  deadline: string;
  /** The seller would accept this fee (the human's floor is fee × FLOOR_MULT). */
  sellerAccepts: boolean;
}

/** The human signed an AI player for free, effective at the rollover of his club's country. */
export interface PreContract {
  playerId: string;
  playerName: string;
  fromClubId: string;
  fromClubName: string;
  /** The human club that signed him (a pre-contract falls through if the manager changed club). */
  toClubId: string;
  /** Weekly wage and seasons agreed. */
  wage: number;
  years: number;
  date: string;
  /** Signing bonus agreed, EUR, paid on arrival (4.47.9). */
  bonus?: number;
  /** Only in the `/negotiation` response (4.47.21): his natural position and nationality, read from his club today. */
  position?: string;
  nationality?: string;
}

/**
 * A fee transfer agreed with the buyer's window closed: the fee is paid at once, the player stays
 * at his club and joins the human club on `joinsOn` (the next opening of the buyer's window).
 */
export interface DeferredTransfer {
  playerId: string;
  playerName: string;
  fromClubId: string;
  fromClubName: string;
  /** The human club that bought him. */
  toClubId: string;
  /** Cash paid at agreement, EUR (never negative). */
  fee: number;
  /** Swap (12.14.1): one of the human club's players goes the other way on the same day. He stays
   * at the human club until then (`RosterPlayer.deferredTo` = the seller). */
  swap?: { playerId: string; playerName: string; value: number };
  /** Cash the selling club pays the human club on the day (a swap worth more than the target). */
  cashIn?: number;
  /** Weekly wage and seasons agreed. */
  wage: number;
  years: number;
  /** Sell-on clause left to the seller, percent. */
  sellOnPct?: number;
  /** Bought by paying the release clause. */
  clause?: boolean;
  agreedOn: string;
  joinsOn: string;
  /** Only in the `/negotiation` response: his natural position and nationality, read from his club today. */
  position?: string;
  nationality?: string;
}

export interface SellOnHeld {
  playerId: string;
  playerName: string;
  pct: number;
  /** Club the player was sold to, and when. */
  toClubName: string;
  date: string;
}

/** An AI club's bid for one of the human's players. */
export interface MarketBid {
  id: string;
  kind: "transfer" | "loan";
  playerId: string;
  playerName: string;
  clubId: string;
  clubName: string;
  date: string;
  /** Last day the bid can be answered. */
  expires: string;
  /** Transfer fee (loan: the loan fee, usually 0), EUR. */
  fee: number;
  /** Transfer only: the most the club pays without a sell-on clause. */
  maxFee?: number;
  /** Transfer only: sell-on % the club gives the human club with this fee (0/10/20/30). */
  sellOnPct?: number;
  /** Loan only: share of the wage the borrower pays (0..1) and the return date. */
  wageShare?: number;
  until?: string;
  /** The club already answered one human counter with its maximum. */
  countered?: boolean;
}

export interface NegotiationRound {
  by: "you" | "club";
  fee?: number;
  sellOnPct?: number;
  wageShare?: number;
  outcome: "offer" | "accepted" | "counter" | "rejected" | "insulted" | "prefers_rival" | "lost";
}

export interface NegotiationTalk {
  playerId: string;
  kind: "transfer" | "loan";
  /** Day of `rounds` (resets on a new day). */
  date: string;
  rounds: number;
  /** Talks closed until this date (inclusive) after a lowball. */
  closedUntil?: string;
  /** Last counter of the club (valid on `date`). */
  counter?: { fee: number; sellOnPct?: number; wageShare?: number };
  history: NegotiationRound[];
}

export interface ActiveLoan {
  playerId: string;
  playerName: string;
  fromClubId: string;
  fromClubName: string;
  toClubId: string;
  toClubName: string;
  until: string;
  /** Share of the wage the borrower pays, 0..1. */
  wageShare: number;
  /** Weekly wage of the contract. */
  wage: number;
  fee: number;
  start: string;
  /** The parent club can call him back (agreed for a lower wage share). */
  recall?: true;
  /** Level when the loan started, for the report (absent on older loans). */
  startOverall?: number;
  startStats?: import("@/types/playerTypes").PlayerStatsRecord;
  /** A renewal for one more season was already offered (once per loan, 12.29). */
  renewalOffered?: true;
}

/**
 * An offer to keep a loan going one more season (12.29): `in` = the AI parent of a player on loan AT the human club
 * offers to extend; `out` = the AI borrower of one of the human's players asks to keep him.
 */
export interface LoanRenewalOffer {
  id: string;
  direction: "in" | "out";
  playerId: string;
  playerName: string;
  /** The AI club (the parent for `in`, the borrower for `out`). */
  clubId: string;
  clubName: string;
  date: string;
  /** Last day to answer (the day before the loan ends). */
  expires: string;
  /** New return date. */
  until: string;
  /** Share of the wage the borrower pays (0..1) and the loan fee the borrower pays, EUR. */
  wageShare: number;
  fee: number;
}
