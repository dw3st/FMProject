export type InboxCategory = "development" | "transfer_in" | "transfer_out";

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

export type InboxMessage =
  | DevelopmentInboxMessage
  | TransferInInboxMessage
  | TransferOutInboxMessage;
