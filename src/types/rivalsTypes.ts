// Rivals in a friends' league (multiplayer part 6). Nicknames only: never an e-mail or a user id.
import type { ManagerFace } from "@/Domain/faces/managerFace";
import type { Bet, BetPick } from "@/types/betTypes";

export type ResultSituation =
  | "win" | "draw" | "loss"
  | "big_win" | "big_loss" | "home_loss" | "away_win"
  | "comeback_win" | "blown_lead" | "late_equalizer" | "late_winner"
  | "shootout_win" | "shootout_loss";

export type LiveSituation = "live_goal_for" | "live_goal_against";
/** A friend's settled bet (8.9.7). */
export type BetSituation = "bet_won" | "bet_lost";
export type TauntGroup = ResultSituation | LiveSituation | BetSituation;

export interface SeatResultGoal {
  minute: number;
  side: "for" | "against";
  scorer: string;
}

/** One game of a human club (one per side when two seats meet). Score from the club's side. */
export interface SeatResult {
  /** `<date>:<competition>:<fixtureId>:<seatId>`. */
  id: string;
  date: string;
  seatId: string;
  nickname: string;
  clubId: string;
  clubName: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  competition: string;
  score: { for: number; against: number };
  decider?: { penalties: { for: number; against: number } };
  goals: SeatResultGoal[];
  situations: ResultSituation[];
}

/**
 * `minute`: the clock moved on (every `RIVALS.LIVE_MINUTE_STEP` minutes of play), the score unchanged.
 * `disallowed`: the VAR took a goal back (the score drops by one on one side).
 */
export type LivePhase = "start" | "goal" | "disallowed" | "red" | "yellow" | "sub" | "half" | "minute" | "end";
export type LiveStatus = "live" | "half" | "ended" | "stale";

/** `live_score` from the browser of who plays (score from his club's side). */
export interface LiveScoreFrame {
  saveId: string;
  fixtureId: string;
  phase: LivePhase;
  minute: number;
  score: { for: number; against: number };
  /** The scorer (`goal`) or the player sent off (`red`): only kept when he is in one of the two squads. */
  scorer?: string;
  /** `red` / `yellow` / `sub`: which side (his club's side = "for"). */
  side?: "for" | "against";
  /** `sub`: the player coming on (`scorer` is the one going off). */
  playerIn?: string;
  /** `red` / `yellow`: the card went to the manager, not to a player. */
  manager?: true;
}

/** One line of a friend's live game ("últimos lances"): the server keeps the last `RIVALS.LIVE_MOMENTS_MAX`. */
export interface LiveMoment {
  minute: number;
  kind: "goal" | "disallowed" | "red" | "yellow" | "sub" | "half" | "end";
  side?: "for" | "against";
  player?: string | null;
  /** `sub`: the player coming on. */
  playerIn?: string | null;
  /** `red` / `yellow`: shown to the manager. */
  manager?: true;
}

/** Where a live game stands in its competition (`liveStageOf`). */
export type LiveStage =
  | { kind: "round"; round: number }
  | { kind: "group"; group: string; round: number }
  | { kind: "cup"; stage: string }
  | { kind: "continental"; stage: string; leg?: number };

/** The fixed part of a live game (who, against whom, which fixture). */
export interface LiveBase {
  seatId: string;
  nickname: string;
  clubId: string;
  clubName: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  fixtureId: string;
  date: string;
  /** Slug of the competition (liga, copa, continental). */
  competition?: string;
  /** Where the game stands in it: round, group, stage, leg. */
  stage?: LiveStage;
  /** Two-legged tie: first-leg goals from this seat's side (absent in a single game). */
  aggregate?: { for: number; against: number };
  /** A game of the national team he coaches (10.7): `clubId` / `opponentId` are `nat_…` ids, the names are nations. */
  national?: true;
}

export interface LiveScoreView extends LiveBase {
  status: LiveStatus;
  minute: number;
  score: { for: number; against: number };
  lastGoal: { minute: number; side: "for" | "against"; scorer: string | null } | null;
  /** The game's moments, oldest first (goals, VAR, red cards, half-time, full time). */
  moments: LiveMoment[];
  events: number;
  updatedAt: number;
}

export type ReactionId = "applause" | "fire" | "laugh" | "sorry";
export type TauntKind = "reaction" | "phrase";
/** `bet` = `<seatId>:<betId>` of a settled bet. */
export type TauntTarget = { result: string } | { live: string } | { bet: string };

/** Stored in `chat_messages.meta` as `{ taunt }`: ids and the real score only. */
export interface TauntMeta {
  kind: TauntKind;
  id: string;
  /** Nickname of the friend taunted. */
  target: string;
  clubId: string;
  clubName: string;
  opponentName: string;
  home: boolean;
  score: { for: number; against: number };
  live?: true;
  minute?: number;
  /** A taunt on a settled bet: the pick and the money (the score fields are unused). */
  bet?: TauntBet;
}

export interface TauntBet {
  pick: BetPick;
  homeName: string;
  awayName: string;
  stake: number;
  odds: number;
  payout: number;
  won: boolean;
}

/** A friend's bets, seen by the league (8.9.7). */
export interface FriendBetsView {
  seatId: string;
  open: Bet[];
  /** Won and lost, newest first (refunds left out). */
  settled: Bet[];
  net: number;
}

/** A settled bet in the results feed. */
export interface FeedBet {
  /** `<seatId>:<betId>`. */
  id: string;
  seatId: string;
  nickname: string;
  bet: Bet;
}

export interface RivalNextMatch {
  date: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  competition: string;
  /** A game of the national team he coaches: his nation (data spelling); the opponent's name is a nation too. */
  national?: string;
}

export interface RivalRow {
  seatId: string;
  nickname: string | null;
  managerName: string;
  face: ManagerFace | null;
  nationalityIso: string | null;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  /** The national team he also coaches (nation, data spelling), or null. */
  nationalTeam?: string | null;
  leagueSlug: string;
  leaguePosition: number | null;
  form: ("W" | "D" | "L")[];
  last: SeatResult | null;
  next: RivalNextMatch | null;
  friendsRank: number;
  friendsTotal: number;
  live: LiveScoreView | null;
  /** Open bets now and the career result of his bets. */
  bets: { open: number; net: number };
  /** Where his club stands in each competition: league, cup, continental (8.9.9). */
  comps?: RivalComp[];
  /** Five rows of his league table around him (8.9.9). */
  table?: RivalTableRow[];
  me: boolean;
}

/** A friend's club in one competition (8.9.9). League: position of size and points; knockout: stage and state. */
export interface RivalComp {
  slug: string;
  kind: "league" | "cup" | "continental";
  position?: number;
  size?: number;
  points?: number;
  stage?: string;
  group?: string;
  state?: "alive" | "out" | "champion";
  firstLeg?: { for: number; against: number };
  nextDate?: string;
}

export interface RivalTableRow { position: number; squadId: string; name: string; points: number }

export interface RivalsView { rows: RivalRow[] }
export interface ResultsPage { results: SeatResult[]; hasMore: boolean }
