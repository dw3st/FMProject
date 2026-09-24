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
`);
