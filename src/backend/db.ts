import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";

mkdirSync(RUNTIME_DATA_DIR, { recursive: true });

export const db = new Database(`${RUNTIME_DATA_DIR}/fmproject.db`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS magic_codes (
    email      TEXT NOT NULL,
    code       TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_magic_codes_email_code ON magic_codes(email, code);

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS saves (
    save_id    TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_saves_user ON saves(user_id);

  CREATE TABLE IF NOT EXISTS save_members (
    save_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id),
    seat_id    TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (save_id, user_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_save_members_seat ON save_members(save_id, seat_id);
  CREATE INDEX IF NOT EXISTS idx_save_members_user ON save_members(user_id);
`);
