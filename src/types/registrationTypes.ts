/**
 * Competition registration (`.claude/rules/game/registration.md`): one list of registered players per club and
 * competition (league, national cup, continental). Youth competitions never have a list.
 */

/** How a rule decides who is foreign: the nationality alone, or outside the EU/EEA (with exemptions). */
export type ForeignKind = "nationality" | "nonEU";
export type NationGroup = "EU" | "ibero" | "acp";
export type Confed = "UEFA" | "CONMEBOL" | "CONCACAF" | "CAF" | "AFC" | "OFC";

export interface RegistrationRule {
  id: string;
  /** Counted places (free players excluded). null = the whole squad. */
  maxList: number | null;
  /** Players up to `maxAge` (and formed, when `formedOnly`) are always registered and take no place. */
  free?: { maxAge: number; formedOnly: boolean };
  /** A lack of formed players reduces the places: non-formed counted ≤ maxList − minFormed. */
  minFormed?: number;
  /** Foreign players on the list (free players included). */
  maxForeign?: number;
  /** Foreign players named for one match (XI + bench). Does not act on the list. */
  maxForeignMatchday?: number;
  foreign: ForeignKind;
  /** Nation groups that do not count as foreign under `nonEU`. */
  exempt?: NationGroup[];
  /** Nations counted as domestic beyond the club's country. */
  domestic?: string[];
  /** MLS: a foreign player with a green card (`hasGreenCard`) counts as domestic. */
  greenCard?: true;
}

export interface RegistrationList {
  /** Season label of the competition (league: seasonLabel; cup/continental: year of the meta). */
  season: string;
  /** Registered players (counted and not counted; free players need not be here). */
  ids: string[];
  updatedOn: string;
  /** Signature of the squad ids when the list was made (AI: rebuilt when it changes). */
  sig: string;
  /** Human club: edited by hand (no longer rebuilt as a whole). */
  manual?: true;
  /** Human club: removed by hand (the automatic fill never puts them back). */
  out?: string[];
  /** Human club: players already told they are out (did not fit / must wait); never told twice. */
  notified?: string[];
  /** Human club: arrivals told to wait for the deadline — tried (with new arrivals) when it opens. */
  waiting?: string[];
  /** Completed by the 18-player floor, ignoring the limits. */
  exception?: true;
}

export type RegistrationCompKind = "league" | "cup" | "continental";

export interface RegistrationStatus {
  open: boolean;
  until?: string;
  opensOn?: string;
  /** Closed because the continental stage already started (not the window). */
  stageStarted?: boolean;
}

export type ReplacementReason = "injured" | "suspended" | "unregistered" | "foreignLimit";

export type RegViolationKind = "listFull" | "foreign" | "formed";

export interface RegCounts {
  counted: number;
  max: number | null;
  foreign: number;
  maxForeign: number | null;
  formed: number;
  minFormed: number;
  /** Places lost by the lack of formed players. */
  lostSlots: number;
  free: number;
}

/** Something the human club is told about its lists (turned into a `registration` inbox message). */
export interface RegistrationNotice {
  kind: "auto_list" | "not_fit" | "waiting" | "closing" | "exception";
  competition: string;
  season: string;
  playerIds?: string[];
  opensOn?: string;
  until?: string;
  counts?: RegCounts;
}

/** One player of a competition list on the Registration screen. */
export interface RegistrationRowView {
  id: string;
  name: string;
  age: number;
  nationality: string | null;
  /** Natural detailed position. */
  role: string;
  overall: number;
  registered: boolean;
  foreign: boolean;
  /** Foreign by nationality, but domestic under the rule's green card (MLS). */
  greenCard: boolean;
  clubTrained: boolean;
  nationTrained: boolean;
  free: boolean;
  /** Not registered: can he be added now (deadline aside)? */
  canAdd: boolean;
  reason?: RegViolationKind;
}

/** One competition of the human club (`GET /api/saves/:id/registration`). */
export interface RegistrationCompView {
  slug: string;
  kind: RegistrationCompKind;
  season: string;
  rule: RegistrationRule;
  status: RegistrationStatus;
  manual: boolean;
  exception: boolean;
  counts: RegCounts;
  rows: RegistrationRowView[];
}
