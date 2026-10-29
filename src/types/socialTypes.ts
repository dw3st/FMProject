// Shapes shared by the social routes, the socket and the screens. Nothing here carries an e-mail or a
// user id: the client only ever sees nicknames (`.claude/rules/social.md`).
import type { WatchCloseReason, WatchEventPayload, WatchFramePayload, WatchInfo, WatchStatePayload } from "@/types/watchTypes";
import type { KickOutcome, PenaltyChoice } from "@/Domain/penalty/penaltyKick";
import type { LiveScoreFrame, LiveScoreView, SeatResult, TauntMeta } from "@/types/rivalsTypes";
import type { H2HCloseReason, H2HCommand, H2HFrame, H2HRoomView, H2HSide, H2HWireState, H2HWireStats } from "@/types/h2hTypes";

export type FriendStatus = "online" | "offline" | "playing";

/** How a searched manager relates to the one searching. */
export type Relation = "friend" | "pending_out" | "pending_in" | "none";

export interface SocialMe {
  nickname: string | null;
  friendCode: string;
}

export interface FriendView {
  nickname: string;
  status: FriendStatus;
  /** Club of the save open right now, only with status "playing". */
  club: string | null;
  unread: number;
  since: number;
}

export interface RequestView {
  nickname: string;
  at: number;
}

export interface WorldRoomView {
  /** Room as the client names it: `world:<saveId>`. */
  room: string;
  saveId: string;
  /** Owner's nickname: the client shows "Emy's league", never the owner's club. */
  owner: string;
  /** The viewer's club in that world: tells apart two leagues of the same owner. */
  myClub: string;
  unread: number;
  /** The server's public world (multiplayer part 5b): no free text, only reactions. */
  public?: boolean;
}

export interface FriendsResponse {
  friends: FriendView[];
  incoming: RequestView[];
  outgoing: RequestView[];
  worlds: WorldRoomView[];
}

export interface SearchResult {
  nickname: string;
  relation: Relation;
}

export interface ChatMessageView {
  id: number;
  /** Sender's nickname. */
  from: string;
  mine: boolean;
  body: string;
  at: number;
  /** A taunt from the rivals (multiplayer part 6): the screens render it, `body` is the English fallback. */
  taunt?: TauntMeta;
}

export interface MessagesResponse {
  room: string;
  messages: ChatMessageView[];
  hasMore: boolean;
}

export type ClientEvent =
  | { type: "hello"; saveId: string | null; hidden?: boolean }
  | { type: "ping" }
  | { type: "typing"; room: string }
  | ({ type: "live_score" } & LiveScoreFrame)
  // Multiplayer part 7 (live match between two managers): the room of today's game against another seat.
  | { type: "h2h_join"; saveId: string; fixtureId: string }
  | { type: "h2h_ready"; penalty2d?: boolean }
  | { type: "h2h_cmd"; cmd: H2HCommand }
  | { type: "h2h_pause" }
  | { type: "h2h_resume" }
  | { type: "h2h_leave" }
  | { type: "h2h_penalty"; choice: PenaltyChoice }
  // Watching a friend's live match: the spectator joins and leaves; the friend's browser relays its match (only after
  // `watch_on`).
  | { type: "watch_join"; saveId: string; seatId: string }
  | { type: "watch_leave" }
  | ({ type: "relay_frame"; saveId: string; fixtureId: string } & WatchFramePayload)
  | ({ type: "relay_state"; saveId: string; fixtureId: string } & WatchStatePayload)
  | ({ type: "relay_event"; saveId: string; fixtureId: string } & WatchEventPayload);

export type ServerEvent =
  | { type: "message"; room: string; message: ChatMessageView }
  | { type: "presence"; nickname: string; status: FriendStatus; club: string | null }
  | { type: "friend_request"; from: string }
  | { type: "friend_update" }
  | { type: "read"; room: string; lastReadId: number }
  | { type: "typing"; room: string; from: string }
  | { type: "pong"; online: number }
  // Multiplayer part 2 (`.claude/rules/game/multiplayer.md`): only members of the world (or the invited user).
  | { type: "world_invite"; saveId: string; from: string; code: string }
  | { type: "world_started"; saveId: string }
  | { type: "world_removed"; saveId: string }
  | { type: "world_deleted"; saveId: string }
  | { type: "world_members"; saveId: string }
  // Multiplayer part 4: an offer between two seats changed (the seat re-reads its offers).
  | { type: "seat_offer"; saveId: string }
  // Multiplayer part 3 (group advance): the world's progress, for its members.
  | {
    type: "world_progress";
    saveId: string;
    /** The world's date now. */
    date: string;
    target: string | null;
    running: boolean;
    /** Nicknames (or manager names) holding the world. */
    waitingFor: string[];
    /** The executor's failure: a fixed code (`dayFailed`), never the error text. */
    error?: string;
  }
  // Multiplayer part 6 (rivals): the human clubs' games of the day, and a friend's live score.
  | { type: "world_results"; saveId: string; results: SeatResult[] }
  | { type: "friend_live"; saveId: string; seatId: string; live: LiveScoreView | null; goal?: true }
  // Multiplayer part 7 (live match between two managers). The room to both seats; the match to the room's sockets.
  | { type: "h2h_room"; room: H2HRoomView; mySide: H2HSide }
  | { type: "h2h_invite"; saveId: string; fixtureId: string; from: string }
  | ({ type: "h2h_frame"; saveId: string; fixtureId: string } & H2HFrame)
  | { type: "h2h_state"; saveId: string; fixtureId: string; state: H2HWireState; stats: H2HWireStats }
  | { type: "h2h_event"; saveId: string; fixtureId: string; name: string; payload: unknown }
  | { type: "h2h_paused"; saveId: string; fixtureId: string; by: H2HSide | null; until: number | null; left: Record<H2HSide, number> }
  | { type: "h2h_closed"; saveId: string; fixtureId: string; reason: H2HCloseReason }
  | { type: "h2h_done"; saveId: string; fixtureId: string }
  | { type: "h2h_penalty_result"; saveId: string; fixtureId: string; outcome: KickOutcome }
  // Watching a friend's live match. To who plays: someone watches (relay your match) / nobody any more.
  | { type: "watch_on"; saveId: string }
  | { type: "watch_off"; saveId: string }
  // To the spectator.
  | { type: "watch_info"; saveId: string; info: WatchInfo }
  | ({ type: "watch_frame"; saveId: string; seatId: string } & WatchFramePayload)
  | ({ type: "watch_state"; saveId: string; seatId: string } & WatchStatePayload)
  | ({ type: "watch_event"; saveId: string; seatId: string } & WatchEventPayload)
  | { type: "watch_closed"; saveId: string; seatId: string; reason: WatchCloseReason };

export type SocialErrorCode =
  | "invalidNickname"
  | "nicknameTaken"
  | "nicknameLocked"
  | "noNickname"
  | "invalidQuery"
  | "notFound"
  | "alreadyFriends"
  | "limit"
  | "invalidBody"
  | "noAccess"
  /** The public world's room takes reactions and phrases only (part 5b). */
  | "publicRoom"
  | "rateLimited"
  | "tooLarge"
  | "unauthorized"
  | "network";
