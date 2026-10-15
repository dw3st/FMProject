import { db } from "@/backend/db";
import type { MemberRole } from "@/types/seatTypes";

/** A user's seat in a world (`.claude/rules/game/multiplayer.md`). */
export interface SaveMember {
  saveId: string;
  userId: string;
  seatId: string;
  role: MemberRole;
  createdAt: number;
}

type MemberRow = { saveId: string; userId: string; seatId: string; role: MemberRole; createdAt: number };
const MEMBER_COLUMNS = "save_id AS saveId, user_id AS userId, seat_id AS seatId, role, created_at AS createdAt";

/** Adds a user to a world with his seat. Throws when he already has a seat there or the seat is taken. */
export function addSaveMember(saveId: string, userId: string, seatId: string, role: MemberRole): void {
  db.prepare(
    "INSERT INTO save_members (save_id, user_id, seat_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(saveId, userId, seatId, role, Date.now());
}

export function memberOf(saveId: string, userId: string): SaveMember | null {
  const row = db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM save_members WHERE save_id = ? AND user_id = ?`)
    .get(saveId, userId) as MemberRow | null;
  return row ?? null;
}

export function isSaveMember(saveId: string, userId: string): boolean {
  return memberOf(saveId, userId) !== null;
}

export function listSaveMembers(saveId: string): SaveMember[] {
  return db
    .prepare(`SELECT ${MEMBER_COLUMNS} FROM save_members WHERE save_id = ? ORDER BY created_at`)
    .all(saveId) as MemberRow[];
}

/** Worlds the user takes part in (owner or member), newest first. */
export function listUserSaveIds(userId: string): string[] {
  const rows = db
    .prepare("SELECT save_id AS saveId FROM save_members WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as { saveId: string }[];
  return rows.map((r) => r.saveId);
}

/** Worlds the user owns (the per-user save limit counts only these). */
export function countOwnedSaves(userId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM save_members WHERE user_id = ? AND role = 'owner'")
    .get(userId) as { n: number };
  return row.n;
}

export function deleteSaveMembers(saveId: string): void {
  db.prepare("DELETE FROM save_members WHERE save_id = ?").run(saveId);
}
