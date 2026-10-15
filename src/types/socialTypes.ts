// Shapes shared by the social routes, the socket and the screens. Nothing here carries an e-mail or a
// user id: the client only ever sees nicknames (`.claude/rules/social.md`).

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
  name: string;
  unread: number;
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
}

export interface MessagesResponse {
  room: string;
  messages: ChatMessageView[];
  hasMore: boolean;
}

export type ClientEvent =
  | { type: "hello"; saveId: string | null; hidden?: boolean }
  | { type: "ping" }
  | { type: "typing"; room: string };

export type ServerEvent =
  | { type: "message"; room: string; message: ChatMessageView }
  | { type: "presence"; nickname: string; status: FriendStatus; club: string | null }
  | { type: "friend_request"; from: string }
  | { type: "friend_update" }
  | { type: "read"; room: string; lastReadId: number }
  | { type: "typing"; room: string; from: string }
  | { type: "pong"; online: number }
  // Multiplayer part 2 (`.claude/rules/game/multiplayer.md`): only members of the world (or the invited user).
  | { type: "world_invite"; saveId: string; name: string; from: string; code: string }
  | { type: "world_started"; saveId: string }
  | { type: "world_removed"; saveId: string }
  | { type: "world_deleted"; saveId: string }
  | { type: "world_members"; saveId: string }
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
  };

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
  | "rateLimited"
  | "tooLarge"
  | "unauthorized"
  | "network";
