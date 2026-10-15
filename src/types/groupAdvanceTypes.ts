import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { AdvanceDayResponse } from "@/types/dayLogTypes";

/** The seat's own game of day `date` already settled (`.claude/rules/game/multiplayer.md`, part 3). */
export interface MatchDecision {
  date: string;
  fixtureId: string;
  mode: "live" | "simulate";
}

/** The world's group advance (`SaveMeta.world.advance`). */
export interface WorldAdvance {
  /** An executor is running days. */
  running: boolean;
  /** Real-time ISO of the stop the world is waiting on (the deadline counts from it); null while it runs. */
  waitingSince: string | null;
  /** The date the current/last advance aims at. */
  target: string | null;
  /** Last failed day (a fixed code, `DAY_FAILED`; the text only goes to the log), cleared by the next day that runs or the next stop. */
  error?: string | null;
  /** Real-time ISO of that failure; the deadline clock retries from it. */
  errorAt?: string | null;
  /** Failed runs in a row (the clock gives up after `GROUP_ADVANCE.MAX_ERROR_RETRIES`). */
  errorTries?: number;
}

/** `seats/{seatId}/liveRecording.json`: the seat's live match of `date`, kept until the executor runs that day. */
export interface LiveRecordingFile {
  date: string;
  fixtureId: string;
  recording: PlayedMatchRecording;
}

/** One day the executor ran while the seat was away (`seats/{seatId}/pendingSummary.json`). */
export interface PendingDay {
  /** The day that ran. */
  date: string;
  /** The world's date after it. */
  newDate: string;
  /** The seat's part of the day (`outcome.seats[seatId]`: seasonEnded, sacked, jobOffers...). */
  seat: Record<string, unknown>;
}

/** What happened to the seat while he was away (shown in the summary; a stop also cleared his "ready until"). */
export interface SummaryNotices {
  jobOffers: number;
  sacked: boolean;
  seasonEnded: boolean;
  pressInvite: boolean;
  /** A stop (offers, sacking, season end) cleared his "ready until". */
  readyCleared: boolean;
}

/** The pending days as one summary (`GET /api/worlds/:saveId/summary` → `aggregate`). */
export interface PendingSummaryAggregate {
  range: { from: string; to: string; days: number };
  /** The days merged into one day log: the club's games and transfers, the last day's training/rest. */
  log: AdvanceDayResponse;
  /** Date of the club's last game in the range (the "full match report" link), or null. */
  matchReportDate: string | null;
  notices: SummaryNotices;
}

export type MemberAdvanceStatus = "ready" | "match" | "late" | "no_club";

export interface GroupMemberView {
  seatId: string;
  nickname: string | null;
  managerName: string;
  clubName: string;
  status: MemberAdvanceStatus;
  readyUntil: string | null;
  me: boolean;
}

/** `GET /api/worlds/:saveId/advance`. */
export interface GroupAdvanceView {
  currentDate: string;
  target: string | null;
  running: boolean;
  deadlineHours: 12 | 24 | 48 | null;
  /** When the world goes on without the late ones (ISO), or null. */
  deadlineAt: string | null;
  /** Nicknames (or manager names) holding the world. */
  waitingFor: string[];
  /** The executor's last failure: a fixed code (`dayFailed`), never the error text; null when none. */
  error: string | null;
  /** Failed runs in a row (0 without an error, or after a manager's retry). */
  errorTries: number;
  /** When the deadline clock tries again (ISO), or null (no error, or it gave up). */
  nextRetryAt: string | null;
  /** The clock gave up (`MAX_ERROR_RETRIES`): only "Try again" (`POST .../advance/retry`) runs it. */
  gaveUp: boolean;
  members: GroupMemberView[];
  me: {
    readyUntil: string | null;
    /** The seat's game today, still to decide or decided. */
    matchToday: { fixtureId: string; humanOpponent: boolean } | null;
    decision: MatchDecision | null;
  };
}
