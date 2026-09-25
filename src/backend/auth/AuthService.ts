import { randomInt, randomUUID } from "crypto";
import { db } from "@/backend/db";
import { sendEmail } from "@/backend/auth/sendEmail";
import { buildLoginCodeEmail } from "@/backend/auth/loginCodeEmail";

const CODE_TTL_MS    = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUser    { id: string; email: string; createdAt: number }
export interface AuthSession { token: string; userId: string; expiresAt: number }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestLoginCode(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const code = String(randomInt(100000, 1_000_000));
  const expiresAt = Date.now() + CODE_TTL_MS;
  db.prepare(
    "INSERT INTO magic_codes (email, code, expires_at, used) VALUES (?, ?, ?, 0)",
  ).run(normalized, code, expiresAt);

  const message = buildLoginCodeEmail(code, CODE_TTL_MS / 60_000);
  await sendEmail({ to: normalized, ...message });
}

function findOrCreateUser(normalizedEmail: string): AuthUser {
  let user = db
    .prepare("SELECT id, email, created_at AS createdAt FROM users WHERE email = ?")
    .get(normalizedEmail) as AuthUser | undefined;

  if (!user) {
    user = { id: randomUUID(), email: normalizedEmail, createdAt: Date.now() };
    db.prepare(
      "INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)",
    ).run(user.id, user.email, user.createdAt);
  }
  return user;
}

function createSession(userId: string): AuthSession {
  const token = `${randomUUID()}${randomUUID().replace(/-/g, "")}`;
  const session: AuthSession = {
    token,
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(session.token, session.userId, session.expiresAt);
  return session;
}

export function verifyLoginCode(
  email: string,
  code: string,
): { user: AuthUser; session: AuthSession } | null {
  const normalized = normalizeEmail(email);
  const trimmedCode = code.trim();

  const row = db
    .prepare(
      "SELECT rowid AS id FROM magic_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY rowid DESC LIMIT 1",
    )
    .get(normalized, trimmedCode, Date.now()) as { id: number } | undefined;
  if (!row) return null;

  db.prepare("UPDATE magic_codes SET used = 1 WHERE rowid = ?").run(row.id);

  const user = findOrCreateUser(normalized);
  const session = createSession(user.id);

  return { user, session };
}

/**
 * Dev-only auto login: finds or creates the given user and opens a session,
 * bypassing the magic-code flow entirely. Callers (the dev-login route) are
 * responsible for gating this to non-production, localhost-only use.
 */
export function devAutoLogin(email: string): { user: AuthUser; session: AuthSession } {
  const normalized = normalizeEmail(email);
  const user = findOrCreateUser(normalized);
  const session = createSession(user.id);
  return { user, session };
}

export function getSessionByToken(
  token: string,
): { user: AuthUser; session: AuthSession } | null {
  const row = db
    .prepare(
      `SELECT s.token, s.user_id AS userId, s.expires_at AS expiresAt,
              u.email, u.created_at AS createdAt
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, Date.now()) as
    | { token: string; userId: string; expiresAt: number; email: string; createdAt: number }
    | undefined;
  if (!row) return null;
  return {
    session: { token: row.token, userId: row.userId, expiresAt: row.expiresAt },
    user:    { id: row.userId, email: row.email, createdAt: row.createdAt },
  };
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
