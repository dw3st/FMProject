import type { MainRole } from "@/Domain/roles";

export type TransferBudgetTier = "low" | "mid" | "high";

export type TransferIntentType =
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
  outcome: "offer" | "accepted" | "counter" | "rejected" | "insulted";
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
}
