export type InboxCategory = "development" | "transfer_in" | "transfer_out" | "season" | "cup";

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

/** End-of-season news for the human club: promotion, relegation, a league title or the fan base change. */
export interface SeasonInboxMessage extends InboxMessageBase {
  category:   "season";
  kind:       "promoted" | "relegated" | "champion" | "followers";
  /** Followers before / after the season reaction (kind "followers" only). */
  followersBefore?: number;
  followersAfter?:  number;
  /** League the message is about: the new league for promoted/relegated, the won league for champion. */
  leagueSlug: string;
  leagueName: string;
  /** League the club left (promoted/relegated only). */
  fromLeagueSlug?: string;
  /** Season year that just ended. */
  seasonYear: number;
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

export type InboxMessage =
  | DevelopmentInboxMessage
  | TransferInInboxMessage
  | TransferOutInboxMessage
  | SeasonInboxMessage
  | CupInboxMessage;
