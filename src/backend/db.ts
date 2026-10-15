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

migrateSaveMembersSchema(db);

/**
 * `save_members` (`.claude/rules/game/multiplayer.md`): one row per user in a world, with his seat. One schema,
 * created here only. A database from 4.24 (friends and chat) may already have the table without `created_at`
 * (and with `seat_id` nullable): the column is added, nothing is dropped.
 */
export function migrateSaveMembersSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS save_members (
      save_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL REFERENCES users(id),
      seat_id    TEXT NOT NULL,
      role       TEXT NOT NULL CHECK (role IN ('owner', 'member')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY (save_id, user_id)
    );
  `);
  addColumnIfMissing(database, "save_members", "created_at", "INTEGER NOT NULL DEFAULT 0");
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_save_members_seat ON save_members(save_id, seat_id);
    CREATE INDEX IF NOT EXISTS idx_save_members_user ON save_members(user_id);
  `);
}

function addColumnIfMissing(database: Database, table: string, column: string, decl: string): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

/**
 * Friends and chat (`.claude/rules/social.md`). Only adds: the production database already has users, so
 * nothing is dropped or rewritten. SQLite cannot ADD COLUMN ... UNIQUE, so uniqueness lives in partial indexes.
 * The world room reads `save_members` (`migrateSaveMembersSchema`, the multiplayer's table).
 */
export function migrateSocialSchema(database: Database): void {
  addColumnIfMissing(database, "users", "nickname", "TEXT");
  addColumnIfMissing(database, "users", "nickname_changed_at", "INTEGER");
  addColumnIfMissing(database, "users", "friend_code", "TEXT");
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(lower(nickname)) WHERE nickname IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_friend_code ON users(friend_code) WHERE friend_code IS NOT NULL;

    CREATE TABLE IF NOT EXISTS friend_requests (
      from_user  TEXT NOT NULL,
      to_user    TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (from_user, to_user)
    );
    CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_user);

    CREATE TABLE IF NOT EXISTS friendships (
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      since  INTEGER NOT NULL,
      PRIMARY KEY (user_a, user_b),
      CHECK (user_a < user_b)
    );
    CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b);

    CREATE TABLE IF NOT EXISTS blocks (
      user_id    TEXT NOT NULL,
      blocked_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      room       TEXT NOT NULL,
      from_user  TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room, id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id      TEXT NOT NULL,
      room         TEXT NOT NULL,
      last_read_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, room)
    );
  `);
  migrateSaveMembersSchema(database);
}

/**
 * Multiplayer part 2 (`.claude/rules/game/multiplayer.md`): the invite code of each world (one per world, found
 * without opening metas) and the invites sent through the friends list. Only adds.
 */
export function migrateWorldSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS world_codes (
      code    TEXT PRIMARY KEY,
      save_id TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_world_codes_save ON world_codes(save_id);

    CREATE TABLE IF NOT EXISTS world_invites (
      save_id    TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      from_user  TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (save_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_world_invites_user ON world_invites(user_id);
  `);
}

migrateSocialSchema(db);
migrateWorldSchema(db);
