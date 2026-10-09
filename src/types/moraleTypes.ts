/**
 * Player morale and talks (`.claude/rules/game/morale.md`, Etapa 23). Only the human club stores
 * any of this; AI clubs store nothing and play at the neutral value.
 */

/** Role in the squad: sets the minutes the player expects per window of 5 official matches. */
export type SquadStatus = "key" | "starter" | "rotation" | "backup" | "youth";

export const SQUAD_STATUSES: readonly SquadStatus[] = ["key", "starter", "rotation", "backup", "youth"];

/** Morale band (display and effects). */
export type MoraleBand = "very_happy" | "content" | "neutral" | "unhappy" | "furious";

/** Why a player asked for a talk. */
export type TalkReason = "minutes" | "contract" | "wants_move" | "chance";

/** Answers to a talk. `praise` / `demand` are also the free talks (no request). */
export type TalkAnswer = "promise_minutes" | "promise_sale" | "promise_renewal" | "praise" | "demand" | "refuse";

/** Per-player morale bookkeeping (human club only). */
export interface PlayerMoraleLog {
  /** Minutes in the club's last official matches (newest last, at most 5); skips matches he was unavailable for. */
  minutes: number[];
  /** Minutes in the last youth-competition games (newest last, at most 5). */
  youthMinutes?: number[];
  /** Window entries added since the last Monday evaluation: no new match, no minutes delta. */
  newMatches?: number;
  /** Daily morale values (newest last, at most 8): the 7-day trend. */
  trend: number[];
  /** Last praise / demand talk (works once per `PRAISE_EVERY_DAYS`). */
  talkedOn?: string;
  /** Date of an open transfer request (he wants out). */
  transferRequest?: string;
  /** No new talk request from him before this date. */
  quietUntil?: string;
  /** Season award events already applied (`league:<slug>:<season>`, `world:<year>`; newest last, bounded). */
  awards?: string[];
}

/** A pending talk request (answered through `POST /api/saves/:id/talks/:playerId`). */
export interface TalkRequest {
  id: string;
  playerId: string;
  playerName: string;
  reason: TalkReason;
  date: string;
  /** Unanswered by this date = refused. */
  expires: string;
  /** wants_move: the club that bid for him. */
  clubName?: string;
}

/** A promise made in a talk, tracked until kept or broken. */
export interface PlayerPromise {
  id: string;
  playerId: string;
  playerName: string;
  kind: "minutes" | "sale" | "renewal";
  madeOn: string;
  /** minutes: play in `target` of the next `MINUTES_WINDOW` official matches. */
  target?: number;
  /** minutes: club matches counted since the promise, and how many he played. */
  matches?: number;
  played?: number;
  /** sale / renewal: deadline (ISO). */
  until?: string;
}

/** Club-level morale state of the human club (`Squad.moraleClub`). */
export interface ClubMoraleState {
  talks: TalkRequest[];
  promises: PlayerPromise[];
  /** Talk requests created this week (Monday start), any reason: at most `MAX_NEW_TALKS_PER_WEEK`. */
  week?: { start: string; count: number };
}
