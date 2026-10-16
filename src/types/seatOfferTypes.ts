/** Offers between two human seats (multiplayer part 4, `.claude/rules/game/multiplayer.md`). */
export type SeatOfferKind = "transfer" | "loan";
export type SeatOfferSide = "seller" | "buyer";
export type SeatOfferAction = "offer" | "counter" | "accept" | "reject" | "withdraw" | "expired" | "closed";

export interface SeatOfferTerms {
  /** EUR; loan: the loan fee (can be 0). */
  fee: number;
  /** Transfer: sell-on clause for the seller (0/10/20/30). */
  sellOnPct?: number;
  /** Transfer: the player's contract, fixed at the offer. */
  wage?: number;
  years?: number;
  /** Loan: share of the wage the borrower pays (0..1, steps of 0.1) and the return date. */
  wageShare?: number;
  until?: string;
}

export interface SeatOfferParty { seatId: string; clubId: string; clubName: string }

export interface SeatOffer {
  id: string;
  kind: SeatOfferKind;
  playerId: string;
  playerName: string;
  seller: SeatOfferParty;
  buyer: SeatOfferParty;
  date: string;
  /** Last day it can be answered. */
  expires: string;
  turn: SeatOfferSide;
  counters: number;
  terms: SeatOfferTerms;
  history: { by: SeatOfferSide; action: SeatOfferAction; date: string; terms?: SeatOfferTerms }[];
}

/** An offer as one seat sees it. */
export interface SeatOfferView extends SeatOffer {
  side: SeatOfferSide;
  myTurn: boolean;
  /** The other seat's manager name. */
  otherManager: string;
}
