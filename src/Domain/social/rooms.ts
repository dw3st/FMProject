import { SOCIAL } from "@/Domain/social/socialConfig";

// Internal room ids (stored in chat_messages): `dm:<userA>:<userB>` (ids in order) and `world:<saveId>`.
// The client never sees user ids: in URLs and events a DM is `dm:<other's nickname>`.

export type ParsedRoomId = { kind: "dm"; a: string; b: string } | { kind: "world"; saveId: string };
export type RoomParam = { kind: "dm"; nickname: string } | { kind: "world"; saveId: string };

const SAVE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NICK_PARAM_RE = new RegExp(`^[A-Za-z0-9_.-]{${SOCIAL.NICKNAME_MIN},${SOCIAL.NICKNAME_MAX}}$`);

export function isSaveIdShape(s: string): boolean {
  return SAVE_ID_RE.test(s);
}

export function dmRoomId(a: string, b: string): string {
  if (a === b) throw new Error("a direct message needs two different users");
  return a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`;
}

export function worldRoomId(saveId: string): string {
  return `world:${saveId}`;
}

export function parseRoomId(id: string): ParsedRoomId | null {
  if (id.startsWith("dm:")) {
    const parts = id.slice(3).split(":");
    if (parts.length !== 2) return null;
    const [a, b] = parts as [string, string];
    if (!a || !b || a >= b) return null;
    return { kind: "dm", a, b };
  }
  if (id.startsWith("world:")) {
    const saveId = id.slice(6);
    return isSaveIdShape(saveId) ? { kind: "world", saveId } : null;
  }
  return null;
}

export function dmRoomParam(nickname: string): string {
  return `dm:${nickname}`;
}

export function worldRoomParam(saveId: string): string {
  return `world:${saveId}`;
}

export function parseRoomParam(raw: string): RoomParam | null {
  if (raw.startsWith("dm:")) {
    const nickname = raw.slice(3);
    return NICK_PARAM_RE.test(nickname) ? { kind: "dm", nickname } : null;
  }
  if (raw.startsWith("world:")) {
    const saveId = raw.slice(6);
    return isSaveIdShape(saveId) ? { kind: "world", saveId } : null;
  }
  return null;
}

/** The other side of a DM for `me`, or null when `me` is not in it (or it is a world room). */
export function dmPartner(room: ParsedRoomId, me: string): string | null {
  if (room.kind !== "dm") return null;
  if (room.a === me) return room.b;
  if (room.b === me) return room.a;
  return null;
}

/** With the friendship undone or a block either way, nobody writes. */
export function canWriteDm(r: { friends: boolean; blocked: boolean }): boolean {
  return r.friends && !r.blocked;
}

/** A world room exists only for members of a world with more than one member. */
export function canUseWorld(r: { member: boolean; memberCount: number }): boolean {
  return r.member && r.memberCount >= SOCIAL.WORLD_MIN_MEMBERS;
}
