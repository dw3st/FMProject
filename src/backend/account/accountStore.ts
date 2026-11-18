// SQLite rows of the account profile (`docs/superpowers/specs/2026-11-18-account-profile-design.md`).
import { db } from "@/backend/db";
import type { AccountCareer, AccountTrackId, StoredCareer } from "@/types/accountTypes";

export function upsertCareer(userId: string, career: AccountCareer): void {
  db.prepare(
    `INSERT INTO account_careers (user_id, save_id, seat_id, data, updated_at, deleted) VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT (user_id, save_id, seat_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(userId, career.saveId, career.seatId, JSON.stringify(career), Date.now());
}

/** The save (or one seat of it) is gone: the careers stay, marked. */
export function markCareersDeleted(saveId: string, seatId?: string): void {
  if (seatId) db.prepare("UPDATE account_careers SET deleted = 1 WHERE save_id = ? AND seat_id = ?").run(saveId, seatId);
  else db.prepare("UPDATE account_careers SET deleted = 1 WHERE save_id = ?").run(saveId);
}

/** Careers of a user, the most recently updated first. A row that does not parse is skipped. */
export function listCareers(userId: string): StoredCareer[] {
  const rows = db
    .prepare("SELECT data, deleted FROM account_careers WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId) as { data: string; deleted: number }[];
  const out: StoredCareer[] = [];
  for (const r of rows) {
    try {
      out.push({ ...(JSON.parse(r.data) as AccountCareer), deleted: r.deleted === 1 });
    } catch {
      // A broken row never hides the others.
    }
  }
  return out;
}

export function getProfileRow(userId: string): { badges: AccountTrackId[]; backfilled: boolean } {
  const row = db.prepare("SELECT badges, backfilled FROM account_profile WHERE user_id = ?").get(userId) as
    | { badges: string; backfilled: number } | undefined;
  let badges: AccountTrackId[] = [];
  try {
    const parsed = row ? JSON.parse(row.badges) : [];
    if (Array.isArray(parsed)) badges = parsed.filter((b): b is AccountTrackId => typeof b === "string");
  } catch { /* empty */ }
  return { badges, backfilled: row?.backfilled === 1 };
}

export function setBadges(userId: string, badges: AccountTrackId[]): void {
  db.prepare(
    `INSERT INTO account_profile (user_id, badges) VALUES (?, ?)
     ON CONFLICT (user_id) DO UPDATE SET badges = excluded.badges`,
  ).run(userId, JSON.stringify(badges));
}

export function markBackfilled(userId: string): void {
  db.prepare(
    `INSERT INTO account_profile (user_id, backfilled) VALUES (?, 1)
     ON CONFLICT (user_id) DO UPDATE SET backfilled = 1`,
  ).run(userId);
}

export function userCreatedAt(userId: string): number | null {
  const row = db.prepare("SELECT created_at AS c FROM users WHERE id = ?").get(userId) as { c: number } | undefined;
  return row?.c ?? null;
}

/** A tactic the user keeps in his account (tactics library, tester report 2026-11-18): a saved line-up's code. */
export interface AccountTactic { id: string; name: string; code: string; savedAt: string }

export function listTactics(userId: string): AccountTactic[] {
  const rows = db.prepare("SELECT id, name, code, created_at FROM account_tactics WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as { id: string; name: string; code: string; created_at: number }[];
  return rows.map((r) => ({ id: r.id, name: r.name, code: r.code, savedAt: new Date(r.created_at).toISOString().slice(0, 10) }));
}

export function countTactics(userId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM account_tactics WHERE user_id = ?").get(userId) as { n: number }).n;
}

export function addTactic(userId: string, name: string, code: string): AccountTactic {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO account_tactics (id, user_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)").run(id, userId, name, code, now);
  return { id, name, code, savedAt: new Date(now).toISOString().slice(0, 10) };
}

export function deleteTactic(userId: string, id: string): boolean {
  return db.prepare("DELETE FROM account_tactics WHERE user_id = ? AND id = ?").run(userId, id).changes > 0;
}
