// SQLite queries of friends and chat (`.claude/rules/social.md`). User ids stay inside the server:
// routes and the socket translate them to nicknames.
import { randomInt } from "crypto";
import { db } from "@/backend/db";
import { isSaveMember, listSaveMembers } from "@/backend/auth/saveOwnership";
import { messageCutoff } from "@/Domain/social/message";
import { SOCIAL } from "@/Domain/social/socialConfig";
import {
  generateFriendCode,
  normalizeFriendCode,
  normalizeNickname,
  validateNickname,
} from "@/Domain/social/nickname";
import type { Relation } from "@/types/socialTypes";

export interface SocialUser {
  id: string;
  nickname: string | null;
  friendCode: string | null;
  nicknameChangedAt: number | null;
}

export interface NamedUser {
  id: string;
  nickname: string;
}

export interface DatedUser extends NamedUser {
  at: number;
}

export function ordered(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ── Users ───────────────────────────────────────────────────────────────────

export function getSocialUser(userId: string): SocialUser | null {
  const row = db
    .prepare(
      "SELECT id, nickname, friend_code AS friendCode, nickname_changed_at AS nicknameChangedAt FROM users WHERE id = ?",
    )
    .get(userId) as SocialUser | undefined;
  return row ?? null;
}

export function findUserByNickname(nickname: string): NamedUser | null {
  const row = db
    .prepare("SELECT id, nickname FROM users WHERE nickname IS NOT NULL AND lower(nickname) = lower(?)")
    .get(normalizeNickname(nickname)) as NamedUser | undefined;
  return row ?? null;
}

export function findUserByFriendCode(raw: string): SocialUser | null {
  const code = normalizeFriendCode(raw);
  if (!code) return null;
  const row = db
    .prepare(
      "SELECT id, nickname, friend_code AS friendCode, nickname_changed_at AS nicknameChangedAt FROM users WHERE friend_code = ?",
    )
    .get(code) as SocialUser | undefined;
  return row ?? null;
}

/** The user's friend code, generated (and stored) the first time. */
export function ensureFriendCode(userId: string): string {
  const user = getSocialUser(userId);
  if (!user) throw new Error(`unknown user ${userId}`);
  if (user.friendCode) return user.friendCode;
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateFriendCode((n) => randomInt(0, n));
    try {
      db.prepare("UPDATE users SET friend_code = ? WHERE id = ? AND friend_code IS NULL").run(code, userId);
    } catch {
      continue; // another user already has this code (unique index): draw again
    }
    const after = getSocialUser(userId);
    if (after?.friendCode) return after.friendCode;
  }
  throw new Error("could not generate a unique friend code");
}

export type SetNicknameResult =
  | { ok: true; nickname: string }
  | { ok: false; error: "invalidNickname" | "nicknameTaken" | "nicknameLocked" };

/**
 * Sets the nickname once: after the first choice it is tied to the account for good (`nicknameLocked`). The same
 * name again is a no-op. A stored nickname that a later rule made invalid (e.g. one shaped like a friend code) can be
 * replaced once by a valid one.
 */
export function setNickname(userId: string, raw: string, now: number): SetNicknameResult {
  if (validateNickname(raw)) return { ok: false, error: "invalidNickname" };
  const nickname = normalizeNickname(raw);
  const user = getSocialUser(userId);
  if (!user) throw new Error(`unknown user ${userId}`);
  if (user.nickname === nickname) return { ok: true, nickname };
  const previous = user.nickname;
  if (previous !== null && validateNickname(previous) === null) return { ok: false, error: "nicknameLocked" };
  const owner = findUserByNickname(nickname);
  if (owner && owner.id !== userId) return { ok: false, error: "nicknameTaken" };
  try {
    const r = db
      .prepare("UPDATE users SET nickname = ?, nickname_changed_at = ? WHERE id = ? AND nickname IS ?")
      .run(nickname, now, userId, previous);
    if (r.changes === 0) return { ok: false, error: "nicknameLocked" }; // set by a concurrent request
  } catch {
    return { ok: false, error: "nicknameTaken" }; // lost a race on the unique index
  }
  return { ok: true, nickname };
}

// ── Relations ───────────────────────────────────────────────────────────────

export function areFriends(a: string, b: string): boolean {
  if (a === b) return false;
  const [x, y] = ordered(a, b);
  return !!db.prepare("SELECT 1 AS hit FROM friendships WHERE user_a = ? AND user_b = ?").get(x, y);
}

export function isBlocked(blocker: string, blocked: string): boolean {
  return !!db.prepare("SELECT 1 AS hit FROM blocks WHERE user_id = ? AND blocked_id = ?").get(blocker, blocked);
}

export function blockedEitherWay(a: string, b: string): boolean {
  return isBlocked(a, b) || isBlocked(b, a);
}

export function hasRequest(from: string, to: string): boolean {
  return !!db.prepare("SELECT 1 AS hit FROM friend_requests WHERE from_user = ? AND to_user = ?").get(from, to);
}

export function relationOf(me: string, other: string): Relation {
  if (areFriends(me, other)) return "friend";
  if (hasRequest(me, other)) return "pending_out";
  if (hasRequest(other, me)) return "pending_in";
  return "none";
}

/** Up to 20 nicknames starting with `query` (case-insensitive), never the searcher, nobody blocked either way. */
export function searchUsers(me: string, query: string): { nickname: string; relation: Relation }[] {
  const pattern = `${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = db
    .prepare(
      `SELECT u.id, u.nickname FROM users u
       WHERE u.nickname IS NOT NULL
         AND lower(u.nickname) LIKE lower(?) ESCAPE '\\'
         AND u.id != ?
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.user_id = ? AND b.blocked_id = u.id) OR (b.user_id = u.id AND b.blocked_id = ?)
         )
       ORDER BY lower(u.nickname)
       LIMIT ?`,
    )
    .all(pattern, me, me, me, SOCIAL.SEARCH_LIMIT) as NamedUser[];
  return rows.map((r) => ({ nickname: r.nickname, relation: relationOf(me, r.id) }));
}

// ── Requests and friendships ────────────────────────────────────────────────

export function friendCount(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM friendships WHERE user_a = ? OR user_b = ?")
    .get(userId, userId) as { n: number };
  return row.n;
}

export function pendingOutCount(userId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM friend_requests WHERE from_user = ?").get(userId) as { n: number };
  return row.n;
}

/** Makes two users friends (removing the requests between them). False when either is at the friend limit. */
export function befriend(a: string, b: string, now: number): boolean {
  if (friendCount(a) >= SOCIAL.MAX_FRIENDS || friendCount(b) >= SOCIAL.MAX_FRIENDS) return false;
  const [x, y] = ordered(a, b);
  db.transaction(() => {
    db.prepare(
      "DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)",
    ).run(a, b, b, a);
    db.prepare("INSERT OR IGNORE INTO friendships (user_a, user_b, since) VALUES (?, ?, ?)").run(x, y, now);
  })();
  return true;
}

export type RequestResult = "requested" | "befriended" | "alreadyFriends" | "limit" | "notFound";

/**
 * A request from `from` to `to`. A block either way answers notFound (the blocked never learns it). When `to`
 * already asked `from`, it becomes a friendship at once. Sending the same request again is a no-op.
 */
export function sendFriendRequest(from: string, to: string, now: number): RequestResult {
  if (from === to || blockedEitherWay(from, to)) return "notFound";
  if (areFriends(from, to)) return "alreadyFriends";
  if (hasRequest(to, from)) return befriend(from, to, now) ? "befriended" : "limit";
  if (hasRequest(from, to)) return "requested";
  if (friendCount(from) >= SOCIAL.MAX_FRIENDS || pendingOutCount(from) >= SOCIAL.MAX_PENDING_OUT) return "limit";
  db.prepare("INSERT INTO friend_requests (from_user, to_user, created_at) VALUES (?, ?, ?)").run(from, to, now);
  return "requested";
}

export type AcceptResult = "accepted" | "notFound" | "limit";

export function acceptRequest(me: string, from: string, now: number): AcceptResult {
  if (!hasRequest(from, me)) return "notFound";
  return befriend(me, from, now) ? "accepted" : "limit";
}

export function declineRequest(me: string, from: string): boolean {
  return db.prepare("DELETE FROM friend_requests WHERE from_user = ? AND to_user = ?").run(from, me).changes > 0;
}

export function cancelRequest(me: string, to: string): boolean {
  return db.prepare("DELETE FROM friend_requests WHERE from_user = ? AND to_user = ?").run(me, to).changes > 0;
}

export function removeFriend(a: string, b: string): boolean {
  const [x, y] = ordered(a, b);
  return db.prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ?").run(x, y).changes > 0;
}

export function listFriends(me: string): (NamedUser & { since: number })[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname, f.since FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
       WHERE (f.user_a = ? OR f.user_b = ?) AND u.nickname IS NOT NULL
       ORDER BY lower(u.nickname)`,
    )
    .all(me, me, me) as (NamedUser & { since: number })[];
}

export function friendIds(me: string): string[] {
  const rows = db
    .prepare(
      "SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS id FROM friendships WHERE user_a = ? OR user_b = ?",
    )
    .all(me, me, me) as { id: string }[];
  return rows.map((r) => r.id);
}

export function listIncoming(me: string): DatedUser[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.from_user
       WHERE r.to_user = ? AND u.nickname IS NOT NULL ORDER BY r.created_at DESC, lower(u.nickname)`,
    )
    .all(me) as DatedUser[];
}

export function listOutgoing(me: string): DatedUser[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname, r.created_at AS at FROM friend_requests r JOIN users u ON u.id = r.to_user
       WHERE r.from_user = ? AND u.nickname IS NOT NULL ORDER BY r.created_at DESC, lower(u.nickname)`,
    )
    .all(me) as DatedUser[];
}

// ── Blocks ──────────────────────────────────────────────────────────────────

/** Blocks `other`: undoes the friendship and cancels the requests between the two. */
export function blockUser(me: string, other: string, now: number): void {
  if (me === other) return;
  const [x, y] = ordered(me, other);
  db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)").run(me, other, now);
    db.prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ?").run(x, y);
    db.prepare(
      "DELETE FROM friend_requests WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)",
    ).run(me, other, other, me);
  })();
}

/** Unblocking never restores the friendship. */
export function unblockUser(me: string, other: string): boolean {
  return db.prepare("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?").run(me, other).changes > 0;
}

export function listBlocked(me: string): NamedUser[] {
  return db
    .prepare(
      `SELECT u.id, u.nickname FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.user_id = ? AND u.nickname IS NOT NULL ORDER BY lower(u.nickname)`,
    )
    .all(me) as NamedUser[];
}

// ── Worlds (multiplayer, part 2: `save_members`) ────────────────────────────

/** Owner or member of the world (`save_members`, one row per seat). */
export function isWorldMember(userId: string, saveId: string): boolean {
  return isSaveMember(saveId, userId);
}

export function worldMemberIds(saveId: string): string[] {
  return listSaveMembers(saveId).map((m) => m.userId);
}

/** Worlds of the user with at least two members (the only ones with a chat room). */
export function worldsOf(userId: string): string[] {
  const rows = db
    .prepare(
      `SELECT save_id AS saveId FROM save_members
       GROUP BY save_id
       HAVING COUNT(DISTINCT user_id) >= ? AND SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) > 0
       ORDER BY save_id`,
    )
    .all(SOCIAL.WORLD_MIN_MEMBERS, userId) as { saveId: string }[];
  return rows.map((r) => r.saveId);
}

// ── Messages ────────────────────────────────────────────────────────────────

export interface ChatMessageRow {
  id: number;
  room: string;
  fromUser: string;
  fromNickname: string | null;
  body: string;
  createdAt: number;
}

const BLOCKED_SENDER_SQL = "NOT EXISTS (SELECT 1 FROM blocks b WHERE b.user_id = ? AND b.blocked_id = m.from_user)";

export function insertMessage(room: string, fromUser: string, body: string, now: number): ChatMessageRow {
  const info = db
    .prepare("INSERT INTO chat_messages (room, from_user, body, created_at) VALUES (?, ?, ?, ?)")
    .run(room, fromUser, body, now);
  return {
    id: Number(info.lastInsertRowid),
    room,
    fromUser,
    fromNickname: getSocialUser(fromUser)?.nickname ?? null,
    body,
    createdAt: now,
  };
}

/** A page of history (newest `limit` before `before`), oldest first, without senders the viewer blocked. */
export function listMessages(
  room: string,
  viewerId: string,
  opts: { before?: number; limit: number },
): ChatMessageRow[] {
  const before = opts.before ?? null;
  const rows = db
    .prepare(
      `SELECT m.id, m.room, m.from_user AS fromUser, u.nickname AS fromNickname, m.body, m.created_at AS createdAt
       FROM chat_messages m LEFT JOIN users u ON u.id = m.from_user
       WHERE m.room = ? AND (? IS NULL OR m.id < ?) AND ${BLOCKED_SENDER_SQL}
       ORDER BY m.id DESC LIMIT ?`,
    )
    .all(room, before, before, viewerId, opts.limit) as ChatMessageRow[];
  return rows.reverse();
}

/** Marks read up to `lastReadId` (clamped to the room's newest id; never moves back). Returns the stored id. */
export function markRead(userId: string, room: string, lastReadId: number): number {
  const max = (db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM chat_messages WHERE room = ?").get(room) as { m: number }).m;
  const value = Math.max(0, Math.min(Math.floor(lastReadId), max));
  db.prepare(
    `INSERT INTO chat_reads (user_id, room, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, room) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
  ).run(userId, room, value);
  return (db.prepare("SELECT last_read_id AS v FROM chat_reads WHERE user_id = ? AND room = ?").get(userId, room) as {
    v: number;
  }).v;
}

export function unreadCount(userId: string, room: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_messages m
       WHERE m.room = ? AND m.from_user != ?
         AND m.id > COALESCE((SELECT last_read_id FROM chat_reads WHERE user_id = ? AND room = ?), 0)
         AND ${BLOCKED_SENDER_SQL}`,
    )
    .get(room, userId, userId, room, userId) as { n: number };
  return row.n;
}

/** Daily cleanup: deletes messages older than 90 days and read marks of rooms left empty. */
export function purgeOldMessages(now: number): number {
  const removed = db.prepare("DELETE FROM chat_messages WHERE created_at < ?").run(messageCutoff(now)).changes;
  db.prepare("DELETE FROM chat_reads WHERE NOT EXISTS (SELECT 1 FROM chat_messages m WHERE m.room = chat_reads.room)").run();
  return removed;
}
