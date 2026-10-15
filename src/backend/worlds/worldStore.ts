import { randomInt } from "crypto";
import { db } from "@/backend/db";
import { generateWorldCode } from "@/Domain/multiplayer/worldCode";

// ── Codes (`world_codes`) ────────────────────────────────────────────────────

/** The world's code; a previous code of the same world stops working. */
export function setWorldCode(saveId: string, code: string): void {
  db.transaction(() => {
    db.prepare("DELETE FROM world_codes WHERE save_id = ?").run(saveId);
    db.prepare("INSERT INTO world_codes (code, save_id) VALUES (?, ?)").run(code, saveId);
  })();
}

export function worldIdByCode(code: string): string | null {
  const row = db.prepare("SELECT save_id AS saveId FROM world_codes WHERE code = ?").get(code) as { saveId: string } | null;
  return row?.saveId ?? null;
}

export function worldCodeOf(saveId: string): string | null {
  const row = db.prepare("SELECT code FROM world_codes WHERE save_id = ?").get(saveId) as { code: string } | null;
  return row?.code ?? null;
}

export function deleteWorldCode(saveId: string): void {
  db.prepare("DELETE FROM world_codes WHERE save_id = ?").run(saveId);
}

/** Every multiplayer world (the group advance's clock walks this list, part 3). */
export function listWorldCodeIds(): string[] {
  return (db.prepare("SELECT save_id AS saveId FROM world_codes ORDER BY save_id").all() as { saveId: string }[]).map((r) => r.saveId);
}

/** A code no world uses. */
export function newWorldCode(pick: (n: number) => number = (n) => randomInt(n)): string {
  for (let i = 0; i < 50; i++) {
    const code = generateWorldCode(pick);
    if (!worldIdByCode(code)) return code;
  }
  throw new Error("newWorldCode: no free code after 50 tries");
}

// ── Invites (`world_invites`) ────────────────────────────────────────────────

/** One pending invite per world and user; inviting again refreshes it. */
export function addWorldInvite(saveId: string, userId: string, fromUser: string, now: number): void {
  db.prepare(
    "INSERT OR REPLACE INTO world_invites (save_id, user_id, from_user, created_at) VALUES (?, ?, ?, ?)",
  ).run(saveId, userId, fromUser, now);
}

export function hasWorldInvite(saveId: string, userId: string): boolean {
  return db.prepare("SELECT 1 FROM world_invites WHERE save_id = ? AND user_id = ?").get(saveId, userId) != null;
}

export function pendingInviteCount(saveId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM world_invites WHERE save_id = ?").get(saveId) as { n: number }).n;
}

export function listWorldInvitesFor(userId: string): { saveId: string; fromUser: string; createdAt: number }[] {
  return db
    .prepare("SELECT save_id AS saveId, from_user AS fromUser, created_at AS createdAt FROM world_invites WHERE user_id = ? ORDER BY created_at DESC, save_id")
    .all(userId) as { saveId: string; fromUser: string; createdAt: number }[];
}

export function deleteWorldInvite(saveId: string, userId: string): boolean {
  return db.prepare("DELETE FROM world_invites WHERE save_id = ? AND user_id = ?").run(saveId, userId).changes > 0;
}

export function deleteWorldInvites(saveId: string): void {
  db.prepare("DELETE FROM world_invites WHERE save_id = ?").run(saveId);
}
