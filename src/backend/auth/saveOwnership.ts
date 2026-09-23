import { db } from "@/backend/db";

export function recordSaveOwnership(saveId: string, userId: string): void {
  db.prepare(
    "INSERT INTO saves (save_id, user_id, created_at) VALUES (?, ?, ?)",
  ).run(saveId, userId, Date.now());
}

export function deleteSaveOwnership(saveId: string): void {
  db.prepare("DELETE FROM saves WHERE save_id = ?").run(saveId);
}

export function isSaveOwner(saveId: string, userId: string): boolean {
  const row = db
    .prepare("SELECT 1 AS hit FROM saves WHERE save_id = ? AND user_id = ?")
    .get(saveId, userId);
  return !!row;
}

export function listUserSaveIds(userId: string): string[] {
  const rows = db
    .prepare(
      "SELECT save_id AS saveId FROM saves WHERE user_id = ? ORDER BY created_at DESC",
    )
    .all(userId) as { saveId: string }[];
  return rows.map((r) => r.saveId);
}
