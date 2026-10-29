// Watching a friend's live match (spec 2026-10-29-friend-match-broadcast-design). The friend's browser runs the match and
// relays it through the server only while someone watches; a live match between two managers is relayed by the server.
import type { H2HFrame, H2HWireState } from "@/types/h2hTypes";
import type { GoalLogEntry, TeamStats } from "@/GameEngine/Domain/Statistics";
import type { LiveScoreView } from "@/types/rivalsTypes";
import type { TeamId } from "@/GameEngine/types";

/** The numbers the watch screen shows: no stats snapshot (nothing is recorded from a watched match). */
export interface WatchStats {
  teams: { A: TeamStats; B: TeamStats };
  goals: GoalLogEntry[];
  ratings: [number, number][];
}

export interface WatchTeam {
  id: string;
  name: string;
  colors: [string, string];
}

/** What the spectator needs before the first frame: who is who and how to draw it. */
export interface WatchInfo {
  /** The friend watched. */
  seatId: string;
  nickname: string;
  live: LiveScoreView;
  /** Engine teams: in a solo match A is the friend's club; in a match between two managers A is the home side. */
  teams: Record<TeamId, WatchTeam>;
  /** Engine team of the friend. */
  friendSide: TeamId;
  /** Draw turned 180° so the home side is on the left (the friend away in a solo match). */
  mirror: boolean;
  /** "h2h" = a live match between two managers (the server runs it). */
  kind: "solo" | "h2h";
}

export type WatchCloseReason = "ended" | "gone" | "full" | "refused";

export type WatchFramePayload = H2HFrame;
/**
 * How the friend's pitch is drawn (the `PixiPitch` props of his match screen), so the broadcast looks the same: kits,
 * faces, stadium and crowd, turf, light, officials, managers. Only URLs of the game's own face / art / logo routes are
 * kept by the spectator (`sanitizeWatchLook`).
 */
export interface WatchLook {
  teamAColor: string;
  teamBColor: string;
  teamAColor2?: string;
  teamBColor2?: string;
  faceUrls?: Partial<Record<TeamId, Record<string, string>>>;
  /** `PitchStadium` without the LED goal text (each spectator writes it in his own language). */
  stadium?: Record<string, unknown> | null;
  pitch?: Record<string, unknown> | null;
  lighting?: Record<string, unknown> | null;
  officials?: boolean | { refereeFace?: string; assistantFaces?: [string | undefined, string | undefined] };
  coaches?: Partial<Record<TeamId, { color: string; faceUrl?: string }>>;
}

export interface WatchStatePayload { state: H2HWireState; stats: WatchStats; look?: WatchLook }
export interface WatchEventPayload { name: string; payload: unknown }
