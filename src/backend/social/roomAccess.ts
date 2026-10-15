// Rooms as the client names them (`dm:<nickname>`, `world:<saveId>`) ↔ internal room ids (`dm:<idA>:<idB>`).
import {
  canUseWorld,
  canWriteDm,
  dmRoomId,
  dmRoomParam,
  parseRoomId,
  parseRoomParam,
  worldRoomId,
  worldRoomParam,
} from "@/Domain/social/rooms";
import {
  areFriends,
  blockedEitherWay,
  findUserByNickname,
  getSocialUser,
  isWorldMember,
  worldMemberIds,
  type NamedUser,
} from "@/backend/social/socialStore";

export type ResolvedRoom =
  | { kind: "dm"; roomId: string; param: string; partner: NamedUser }
  | { kind: "world"; roomId: string; param: string; saveId: string };

/** The room `me` asked for, or null when it does not exist for them (unknown nickname, oneself, not a member). */
export function resolveRoom(me: string, rawParam: string): ResolvedRoom | null {
  const p = parseRoomParam(rawParam);
  if (!p) return null;
  if (p.kind === "dm") {
    const partner = findUserByNickname(p.nickname);
    if (!partner || partner.id === me) return null;
    return { kind: "dm", roomId: dmRoomId(me, partner.id), param: dmRoomParam(partner.nickname), partner };
  }
  const member = isWorldMember(me, p.saveId);
  if (!canUseWorld({ member, memberCount: worldMemberIds(p.saveId).length })) return null;
  return { kind: "world", roomId: worldRoomId(p.saveId), param: worldRoomParam(p.saveId), saveId: p.saveId };
}

/**
 * A DM's history and read mark are closed while there is a block either way (the blocked one cannot read it nor
 * probe it); without a friendship and without a block the old history stays readable. World rooms: members.
 */
export function canRead(me: string, room: ResolvedRoom): boolean {
  return room.kind === "world" || !blockedEitherWay(me, room.partner.id);
}

/** A world room is open to its members; a DM only between friends with no block either way. */
export function canWrite(me: string, room: ResolvedRoom): boolean {
  if (room.kind === "world") return true;
  return canWriteDm({ friends: areFriends(me, room.partner.id), blocked: blockedEitherWay(me, room.partner.id) });
}

/** How `viewerId` names an internal room: the other's nickname for a DM. Null when the viewer is outside it. */
export function roomParamFor(viewerId: string, roomId: string): string | null {
  const parsed = parseRoomId(roomId);
  if (!parsed) return null;
  if (parsed.kind === "world") return worldRoomParam(parsed.saveId);
  const other = parsed.a === viewerId ? parsed.b : parsed.b === viewerId ? parsed.a : null;
  if (!other) return null;
  const nickname = getSocialUser(other)?.nickname;
  return nickname ? dmRoomParam(nickname) : null;
}

/** Everyone in a room (the sender included). */
export function roomRecipients(roomId: string): string[] {
  const parsed = parseRoomId(roomId);
  if (!parsed) return [];
  return parsed.kind === "dm" ? [parsed.a, parsed.b] : worldMemberIds(parsed.saveId);
}
