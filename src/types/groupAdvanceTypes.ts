import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";

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
  members: GroupMemberView[];
  me: {
    readyUntil: string | null;
    /** The seat's game today, still to decide or decided. */
    matchToday: { fixtureId: string; humanOpponent: boolean } | null;
    decision: MatchDecision | null;
  };
}
