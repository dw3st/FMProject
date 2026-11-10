export type BetSide = "home" | "draw" | "away";

export type BetPick =
  | { market: "result"; side: BetSide }
  | { market: "score"; home: number; away: number }
  | { market: "scorer"; playerId: string; playerName: string };

export interface Bet {
  id: string;
  placedOn: string;
  competition: string;
  fixtureId: string;
  date: string;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  pick: BetPick;
  stake: number;
  odds: number;
  status?: "won" | "lost" | "refunded";
  settledOn?: string;
  payout?: number;
}

export interface BetsState {
  open: Bet[];
  /** Newest first, capped (`BETS.MAX_SETTLED`). */
  settled: Bet[];
}

export interface BetMarkets {
  result: { side: BetSide; odds: number }[];
  scores: { home: number; away: number; odds: number }[];
  scorers: { playerId: string; playerName: string; side: "home" | "away"; odds: number }[];
}

export interface BetGame {
  competition: string;
  fixtureId: string;
  date: string;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  /** The side of the manager's own club in this game. */
  own: "home" | "away" | null;
  markets: BetMarkets;
}

export interface BetsView {
  wallet: number;
  openTotal: number;
  betNet: number;
  maxStake: number;
  open: Bet[];
  settled: Bet[];
  games: BetGame[];
}
