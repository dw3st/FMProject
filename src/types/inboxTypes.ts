import type { ContinentalSlug, ContinentalStageName } from "@/types/calendarTypes";

export type InboxCategory =
  | "development"
  | "transfer_in"
  | "transfer_out"
  | "season"
  | "cup"
  | "continental"
  | "injury"
  | "contract";

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
 * change, the league merit prize (`league_prize` — ALWAYS fires once per rollover the club has a
 * final table position, independent of champion/promoted/relegated/followers, so a mid-table
 * finish still gets prize news; never doubles up with those — see `.claude/rules/game/finances.md`),
 * or (`negative_balance`, not tied to a season end — any day the ledger tips it below zero) the
 * cash extract going negative.
 */
export interface SeasonInboxMessage extends InboxMessageBase {
  category:   "season";
  kind:       "promoted" | "relegated" | "champion" | "followers" | "negative_balance" | "league_prize";
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
  /** League prize paid at this rollover (kind "league_prize" only), euros. */
  prize?: number;
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
  /** Prize paid THIS DAY for this event (champion, or the runner-up prize on a final loss), euros. */
  prize?:    number;
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
  /**
   * Prize paid THIS DAY for this event: champion (title), or reaching the round of 16 (the
   * "draw" message for stage "r16"). Never set on "eliminated" — the design table has no
   * continental runner-up/elimination payout (unlike cups' `cupRunnerUpPrize`); a final loss
   * earns nothing beyond the "final" prize already paid the day it reached the final.
   */
  prize?:      number;
}

/**
 * Injury news for the human club (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1):
 * a player got injured (in a match or heavy training), or a previously injured player returned.
 */
export interface InjuryInboxMessage extends InboxMessageBase {
  category:   "injury";
  kind:       "injured" | "returned";
  playerId:   string;
  playerName: string;
  /** Injured only. */
  severity?:   "light" | "medium" | "severe";
  /** Injured only: expected return date (ISO). */
  returnDate?: string;
}

/**
 * Contract news for the human club (`docs/superpowers/specs/2026-09-30-contracts-design.md` §2):
 * contracts about to end (90 days before the season's end), a renewal, or players who left free.
 */
export interface ContractInboxMessage extends InboxMessageBase {
  category: "contract";
  kind:     "expiring" | "renewed" | "released";
  players:  { id: string; name: string }[];
  /** Renewed only: new contract end (ISO). */
  until?:   string;
}

export type InboxMessage =
  | DevelopmentInboxMessage
  | TransferInInboxMessage
  | TransferOutInboxMessage
  | SeasonInboxMessage
  | CupInboxMessage
  | ContinentalInboxMessage
  | InjuryInboxMessage
  | ContractInboxMessage;
