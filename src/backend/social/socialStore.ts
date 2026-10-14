// SQLite queries of friends and chat (`.claude/rules/social.md`). User ids stay inside the server:
// routes and the socket translate them to nicknames.
import { randomInt } from "crypto";
import { db } from "@/backend/db";
import { SOCIAL } from "@/Domain/social/socialConfig";
import {
  generateFriendCode,
  nicknameChangeableAt,
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
  | { ok: false; error: "invalidNickname" | "nicknameTaken" | "tooSoon" };

/** Sets or changes the nickname. Every real change restarts the 30-day cooldown; the same name is a no-op. */
export function setNickname(userId: string, raw: string, now: number): SetNicknameResult {
  if (validateNickname(raw)) return { ok: false, error: "invalidNickname" };
  const nickname = normalizeNickname(raw);
  const user = getSocialUser(userId);
  if (!user) throw new Error(`unknown user ${userId}`);
  if (user.nickname === nickname) return { ok: true, nickname };
  const at = nicknameChangeableAt(user.nicknameChangedAt);
  if (user.nickname !== null && at !== null && now < at) return { ok: false, error: "tooSoon" };
  const owner = findUserByNickname(nickname);
  if (owner && owner.id !== userId) return { ok: false, error: "nicknameTaken" };
  try {
    db.prepare("UPDATE users SET nickname = ?, nickname_changed_at = ? WHERE id = ?").run(nickname, now, userId);
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
