// Multiplayer part 2: the world of friends (`.claude/rules/game/multiplayer.md`). Nothing here carries an e-mail or
// a user id: the client only sees nicknames and manager names.
import type { WorldAdvance } from "@/types/groupAdvanceTypes";
import type { MemberRole } from "@/types/seatTypes";
import type { ManagerFace } from "@/Domain/faces/managerFace";

export type WorldPhase = "lobby" | "running";
/** Real hours each manager has at a stop of the group advance (part 3); null = no deadline. */
export type WorldDeadline = 12 | 24 | 48 | null;

/** `SaveMeta.world` (only in `mode: "multi"`). */
export interface WorldState {
  phase: WorldPhase;
  /** 10 characters of base32 without 0/1/I/O, unique among the worlds (`world_codes`). */
  inviteCode: string;
  deadlineHours: WorldDeadline;
  /** userId of the creator (audit only; ownership lives in `save_members`). */
  createdBy: string;
  /** Group advance (part 3). Absent until the first stop. */
  advance?: WorldAdvance;
}

export interface WorldMemberView {
  seatId: string;
  role: MemberRole;
  nickname: string | null;
  managerName: string;
  face: ManagerFace | null;
  nationalityIso: string | null;
  clubId: string;
  clubName: string;
  clubColors: [string, string];
  leagueSlug: string;
  leagueName: string;
  unemployed: boolean;
}

/** `GET /api/worlds/:saveId`. */
export interface WorldView {
  saveId: string;
  name: string;
  phase: WorldPhase;
  inviteCode: string;
  deadlineHours: WorldDeadline;
  max: number;
  currentDate: string | null;
  myRole: MemberRole;
  mySeatId: string;
  members: WorldMemberView[];
}

/** `GET /api/worlds/by-code/:code`. */
export interface WorldByCode {
  saveId: string;
  name: string;
  /** The owner's league (the entry screen shows it). */
  leagueSlug: string;
  leagueName: string;
  /** Owner's nickname, or his manager's name. */
  owner: string;
  members: number;
  max: number;
  phase: WorldPhase;
  /** Clubs with a human manager: not pickable. */
  takenClubs: string[];
}

/** An invite through the friends list (`GET /api/worlds/invites`, socket `world_invite`). */
export interface WorldInviteView {
  saveId: string;
  name: string;
  /** Owner's nickname. */
  from: string;
  code: string;
}

export type WorldErrorCode =
  | "notFound" | "full" | "alreadyMember" | "clubTaken" | "invalidManager" | "invalidClub" | "invalidBody"
  | "ownerOnly" | "transferFirst" | "alreadyStarted" | "notMulti" | "inviteLimit" | "noNickname" | "useLeave"
  | "notMember" | "tooLarge" | "ownerLimit" | "generic" | "lobby" | "self" | "invalidTaunt" | "rateLimited";
