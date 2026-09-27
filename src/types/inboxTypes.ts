import type { ContinentalSlug, ContinentalStageName } from "@/types/calendarTypes";

export type InboxCategory = "development" | "transfer_in" | "transfer_out" | "season" | "cup" | "continental";

export interface InboxMessageBase {
  id:        string;
  date:      string;
  createdAt: string;
  read:      boolean;
  category:  InboxCategory;
  subject:   string;
  preview:   string;
}

export interface DevelopmentInboxChange {
  attribute: string;
  from:      number;
  to:        number;
}

export interface DevelopmentInboxMessage extends InboxMessageBase {
  category:   "development";
  playerId:   string;
  playerName: string;
  changes:    DevelopmentInboxChange[];
}

export interface TransferInInboxMessage extends InboxMessageBase {
  category:   "transfer_in";
  transferId: string;
  playerId:   string;
  playerName: string;
  fromClub:   string;
  feeEuros:   number;
}

export interface TransferOutInboxMessage extends InboxMessageBase {
  category:   "transfer_out";
  transferId: string;
  playerId:   string;
  playerName: string;
  toClub:     string;
  feeEuros:   number;
}

/**
 * End-of-season news for the human club: promotion, relegation, a league title, the fan base
 * change, or (`negative_balance`, not tied to a season end — any day the ledger tips it below
 * zero, see `.claude/rules/game/finances.md`) the cash extract going negative.
 */
export interface SeasonInboxMessage extends InboxMessageBase {
  category:   "season";
  kind:       "promoted" | "relegated" | "champion" | "followers" | "negative_balance";
  /** Followers before / after the season reaction (kind "followers" only). */
  followersBefore?: number;
  followersAfter?:  number;
  /** League the message is about: the new league for promoted/relegated, the won league for champion. */
  leagueSlug: string;
  leagueName: string;
  /** League the club left (promoted/relegated only). */
  fromLeagueSlug?: string;
  /** Season year that just ended (or, for negative_balance, the ledger's current season). */
  seasonYear: number;
  /** Club budget on the day it crossed negative (kind "negative_balance" only). */
  balance?: number;
}

/** National-cup news for the human club. */
export interface CupInboxMessage extends InboxMessageBase {
  category:  "cup";
  kind:      "draw" | "eliminated" | "champion";
  cupSlug:   string;
  cupName:   string;
  /** Stage key (CupStageName) of the draw / elimination / final. */
  stage:     string;
  /** Opponent (draw: next opponent; eliminated: who knocked us out). */
  opponentName?: string;
  /** Draw only: the tie's date and whether we are at home ("neutral" for the final). */
  tieDate?:  string;
  venue?:    "home" | "away" | "neutral";
}

/** Continental-competition (UCL/UEL/Lib/Sud) news for the human club. */
export interface ContinentalInboxMessage extends InboxMessageBase {
  category:    "continental";
  kind:        "qualified" | "group" | "draw" | "eliminated" | "champion";
  competition: ContinentalSlug;
  /** English fallback name, shown only until the league catalog loads (mirrors CupInboxMessage.cupName). */
  competitionName: string;
  /** Stage key of the draw / elimination / final. "group" for qualified/group. */
  stage:       ContinentalStageName;
  /** Qualified / group only: the group letter. */
  group?:      string;
  /** Group only: the other clubs in the group, for the message body. */
  opponentNames?: string[];
  /** Draw / eliminated only: the opponent (eliminated: absent for a group-stage 3rd/4th finish). */
  opponentName?: string;
  /** Draw only: the tie's first-leg date. */
  firstLegDate?: string;
  /** Draw only: whether we are at home ("neutral" for the final). */
  venue?:      "home" | "away" | "neutral";
}

export type InboxMessage =
  | DevelopmentInboxMessage
  | TransferInInboxMessage
  | TransferOutInboxMessage
  | SeasonInboxMessage
  | CupInboxMessage
  | ContinentalInboxMessage;
