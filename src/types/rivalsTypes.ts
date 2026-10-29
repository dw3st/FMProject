// Rivals in a friends' league (multiplayer part 6). Nicknames only: never an e-mail or a user id.
import type { ManagerFace } from "@/Domain/faces/managerFace";

export type ResultSituation =
  | "win" | "draw" | "loss"
  | "big_win" | "big_loss" | "home_loss" | "away_win"
  | "comeback_win" | "blown_lead" | "late_equalizer" | "late_winner"
  | "shootout_win" | "shootout_loss";

export type LiveSituation = "live_goal_for" | "live_goal_against";
export type TauntGroup = ResultSituation | LiveSituation;

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
}

/** One line of a friend's live game ("últimos lances"): the server keeps the last `RIVALS.LIVE_MOMENTS_MAX`. */
export interface LiveMoment {
  minute: number;
  kind: "goal" | "disallowed" | "red" | "yellow" | "sub" | "half" | "end";
  side?: "for" | "against";
  player?: string | null;
  /** `sub`: the player coming on. */
  playerIn?: string | null;
}

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
  /** Two-legged tie: first-leg goals from this seat's side (absent in a single game). */
  aggregate?: { for: number; against: number };
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
export type TauntTarget = { result: string } | { live: string };

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
}

export interface RivalNextMatch {
  date: string;
  opponentId: string;
  opponentName: string;
  home: boolean;
  competition: string;
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
  leagueSlug: string;
  leaguePosition: number | null;
  form: ("W" | "D" | "L")[];
  last: SeatResult | null;
  next: RivalNextMatch | null;
  friendsRank: number;
  friendsTotal: number;
  live: LiveScoreView | null;
  me: boolean;
}

export interface RivalsView { rows: RivalRow[] }
export interface ResultsPage { results: SeatResult[]; hasMore: boolean }
