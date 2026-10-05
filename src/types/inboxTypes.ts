import type { ContinentalSlug, ContinentalStageName } from "@/types/calendarTypes";
import type { BoardMessageKind, SackReason, SeasonObjective } from "@/types/boardTypes";
import type { JobOffer } from "@/types/jobTypes";
import type { ClubRecordBroken } from "@/types/clubHistoryTypes";

export type InboxCategory =
  | "development"
  | "transfer_in"
  | "transfer_out"
  | "season"
  | "cup"
  | "continental"
  | "injury"
  | "contract"
  | "youth"
  | "retirement"
  | "board"
  | "job"
  | "club_record"
  | "transfer"
  | "player";

interface InboxMessageBase {
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
 * `suspended` (Etapa 12, `.claude/rules/game/discipline.md`): a player was banned by his cards.
 */
export interface InjuryInboxMessage extends InboxMessageBase {
  category:   "injury";
  kind:       "injured" | "returned" | "suspended";
  playerId:   string;
  playerName: string;
  /** Injured only. */
  severity?:   "light" | "medium" | "severe";
  /** Injured only: expected return date (ISO). */
  returnDate?: string;
  /** Suspended only: matches still to serve. */
  matches?: number;
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

/**
 * Academy news for the human club (`.claude/rules/game/youth.md`): the new intake at the rollover,
 * or players released for reaching the age limit.
 */
export interface YouthInboxMessage extends InboxMessageBase {
  category: "youth";
  kind:     "intake" | "released";
  /** Intake only. */
  year?:    number;
  count?:   number;
  /** Intake only: the standout of the class. */
  best?:    { id: string; name: string; position: string };
  /** Released only. */
  players?: { id: string; name: string }[];
}

/**
 * Retirement news for the human club (`.claude/rules/game/retirement.md`): a player retired at the
 * rollover, or a world-class retiree offers to be reborn in the academy (`kind: "reborn"`, answered
 * through `POST /api/saves/:id/reborn/:retiredId`).
 */
export interface RetirementInboxMessage extends InboxMessageBase {
  category:     "retirement";
  kind:         "retired" | "reborn";
  /** Id of the retired player (the reborn route key). */
  retiredId:    string;
  playerName:   string;
  position:     string;
  age:          number;
  appearances:  number;
  goals:        number;
}

/**
 * Board news for the human club (`.claude/rules/game/board-fans.md`): the season objective, a
 * warning, an ultimatum (and meeting it), praise, the end-of-season bonus, the sacking.
 */
export interface BoardInboxMessage extends InboxMessageBase {
  category: "board";
  kind: BoardMessageKind;
  /** objective */
  objective?: SeasonObjective;
  /** League name (English fallback; the screen uses `competitionName`). */
  leagueName?: string;
  /** Board confidence on the day (0..100). */
  board?: number;
  /** ultimatum: points demanded over the next league matches. */
  ultimatum?: { matches: number; points: number };
  /** bonus: euros credited to the budget. */
  bonus?: number;
  /** sacked */
  reason?: SackReason;
}

/**
 * Job news for the human manager (`.claude/rules/game/jobs.md`): a club's offer (answered through
 * `POST /api/saves/:id/jobs/:offerId` while it is still in `SaveMeta.jobOffers`), or the
 * confirmation that he took over a club.
 */
export interface JobInboxMessage extends InboxMessageBase {
  category: "job";
  kind: "offer" | "hired";
  squadId: string;
  clubName: string;
  leagueSlug: string;
  /** English fallback; the screen uses `competitionName`. */
  leagueName: string;
  /** offer: the offer as it arrived. */
  offer?: JobOffer;
}

/** A record of the human club fell (`.claude/rules/game/club-history.md`). */
export interface ClubRecordInboxMessage extends InboxMessageBase {
  category: "club_record";
  record: ClubRecordBroken;
}

/**
 * Negotiation news (`.claude/rules/game/negotiation.md`): an AI bid for one of the human's players
 * (`bid`, `loan_bid` — answered through `POST /api/saves/:id/bids/:bidId` while the bid is still
 * pending), a loan that ended (`loan_back`: a borrowed player went back; `loan_home`: one of yours
 * came back), or sell-on money received (`sell_on`).
 */
export interface TransferInboxMessage extends InboxMessageBase {
  category: "transfer";
  kind: "bid" | "loan_bid" | "loan_back" | "loan_home" | "sell_on";
  playerId: string;
  playerName: string;
  /** The other club (bidder, parent, borrower or the buying club). */
  clubName: string;
  bidId?: string;
  /** bid: fee offered; sell_on: amount received; loan_bid: loan fee. EUR. */
  fee?: number;
  sellOnPct?: number;
  /** loan_bid: share of the wage the borrower pays (0..1) and the return date. */
  wageShare?: number;
  until?: string;
  /** bid / loan_bid: last day to answer. */
  expires?: string;
}

/**
 * Player talks and promises (`.claude/rules/game/morale.md`): a talk request (`talk`, answered
 * through `POST /api/saves/:id/talks/:playerId` while it is still open in `Squad.moraleClub.talks`),
 * a promise kept or broken, a transfer request.
 */
export interface PlayerInboxMessage extends InboxMessageBase {
  category: "player";
  kind: "talk" | "promise_kept" | "promise_broken" | "transfer_request";
  playerId: string;
  playerName: string;
  /** talk: why he asked. */
  reason?: "minutes" | "contract" | "wants_move" | "chance";
  talkId?: string;
  /** promise_kept / promise_broken. */
  promiseKind?: "minutes" | "sale" | "renewal";
  /** wants_move: the club that bid for him. */
  clubName?: string;
}

export type InboxMessage =
  | DevelopmentInboxMessage
  | TransferInInboxMessage
  | TransferOutInboxMessage
  | SeasonInboxMessage
  | CupInboxMessage
  | ContinentalInboxMessage
  | InjuryInboxMessage
  | ContractInboxMessage
  | YouthInboxMessage
  | RetirementInboxMessage
  | BoardInboxMessage
  | JobInboxMessage
  | ClubRecordInboxMessage
  | TransferInboxMessage
  | PlayerInboxMessage;
