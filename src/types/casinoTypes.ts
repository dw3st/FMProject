import type { BlackjackOutcome, BlackjackRound } from "@/Domain/casino/blackjack";
import type { Card } from "@/Domain/casino/cards";
import type { BingoCardResult } from "@/Domain/casino/bingo";
import type { PokerTable, PokerTableView } from "@/Domain/casino/poker";
import type { RaceCard, RaceKind } from "@/Domain/casino/race";

/** The manager's casino (`.claude/rules/game/casino.md`). */
export type SlotMachine = "classic" | "stadium";
export type CasinoGame = SlotMachine | "crash" | "race" | "blackjack" | "bingo" | "poker";

export interface CasinoResult {
  id: string;
  game: CasinoGame;
  /** Game date. */
  date: string;
  stake: number;
  /** What came back (0 when lost). */
  payout: number;
  multiplier: number;
  /** Crash point of a crash round. */
  crash?: number;
}

export interface CrashRound {
  id: string;
  stake: number;
  /** Server clock (ms) when the plane took off. */
  startedAt: number;
  /** Secret until the round ends. */
  crash: number;
  auto: number | null;
  date: string;
}

/** `seats/{seatId}/casino.json`: never sent as is (the salt and an open crash point stay on the server). */
export interface CasinoState {
  /** Per-seat secret mixed into every draw. */
  salt: string;
  nonce: number;
  /** Game date of the counters below. */
  day: string;
  /** Wallet when he first played that day. */
  startWallet: number;
  /** Payout minus stake of the day (negative = loss). */
  dayNet: number;
  rounds: number;
  open?: CrashRound;
  /** Race card on offer (the next one is drawn after a bet). */
  raceNo?: number;
  /** An open blackjack hand (the shoe and the dealer's hole card stay on the server). */
  blackjack?: BlackjackRound;
  /** The poker table he is sitting at. */
  poker?: PokerTable;
  history: CasinoResult[];
}

export interface CasinoLimits {
  minStake: number;
  maxStake: number;
  lossCap: number;
  /** Net loss so far today (0 when ahead). */
  lost: number;
  rounds: number;
  maxRounds: number;
  maxAutoSpins: number;
}

export interface CasinoView {
  wallet: number;
  casinoNet: number;
  limits: CasinoLimits;
  history: CasinoResult[];
  /** Crash points of the last finished rounds, newest first. */
  crashHistory: number[];
  /** An open crash round (without its crash point). */
  open: { roundId: string; startedAt: number; stake: number; auto: number | null } | null;
  /** Server clock, for the client's offset. */
  now: number;
  growth: number;
  race: RaceCard;
  blackjack: BlackjackView | null;
  poker: PokerTableView | null;
}

export interface BlackjackView {
  roundId: string;
  /** The dealer's up card; his hole card shows only when the round is over. */
  dealer: Card[];
  dealerTotal: number | null;
  hands: { cards: Card[]; stake: number; total: number; soft: boolean; done: boolean; doubled: boolean }[];
  active: number;
  actions: ("hit" | "stand" | "double" | "split")[];
  /** Set when the round is over. */
  result: { payout: number; staked: number; outcomes: BlackjackOutcome[] } | null;
}

export interface RaceResultView {
  order: number[];
  car: number;
  kind: RaceKind;
  multiplier: number;
  payout: number;
  /** The card that was run (the view already carries the next one). */
  card: RaceCard;
}

export interface BingoResultView {
  cards: BingoCardResult[];
  balls: number[];
  payout: number;
}

export interface SlotSpinView {
  stops: number[];
  multiplier: number;
  payout: number;
  /** Stadium machine: the winning lines. */
  wins?: { line: number; count: number; symbol: string; pay: number }[];
}

export type CasinoError = "invalidStake" | "stakeTooHigh" | "dailyLossCap" | "roundsCap" | "noMoney" | "roundOpen" | "invalidMachine" | "invalidAuto" | "noRound" | "noClub"
  | "invalidBet" | "invalidAction" | "noHand" | "handOpen" | "invalidBuyIn" | "notYourTurn" | "seated";
