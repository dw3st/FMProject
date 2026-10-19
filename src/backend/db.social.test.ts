import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrateSocialSchema } from "@/backend/db";

function oldDatabase(): Database {
  const d = new Database(":memory:");
  d.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL)");
  d.exec("CREATE TABLE saves (save_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL)");
  d.prepare("INSERT INTO users (id, email, created_at) VALUES ('u1', 'a@b.c', 1)").run();
  d.prepare("INSERT INTO users (id, email, created_at) VALUES ('u2', 'd@e.f', 2)").run();
  return d;
}

test("adds the social columns and tables, keeps the users, and runs twice", () => {
  const d = oldDatabase();
  migrateSocialSchema(d);
  migrateSocialSchema(d);
  const cols = (d.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  expect(cols).toEqual(expect.arrayContaining(["id", "email", "created_at", "nickname", "nickname_changed_at", "friend_code"]));
  expect(d.prepare("SELECT email FROM users WHERE id = 'u1'").get()).toEqual({ email: "a@b.c" });
  const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
  expect(tables).toEqual(
    expect.arrayContaining(["friend_requests", "friendships", "blocks", "chat_messages", "chat_reads", "save_members"]),
  );
});

test("nicknames are unique ignoring case, friend codes are unique", () => {
  const d = oldDatabase();
  migrateSocialSchema(d);
  d.prepare("UPDATE users SET nickname = 'Ana', friend_code = 'FM-AAAA-AAAA' WHERE id = 'u1'").run();
  expect(() => d.prepare("UPDATE users SET nickname = 'ana' WHERE id = 'u2'").run()).toThrow();
  expect(() => d.prepare("UPDATE users SET friend_code = 'FM-AAAA-AAAA' WHERE id = 'u2'").run()).toThrow();
  d.prepare("UPDATE users SET nickname = 'Bia' WHERE id = 'u2'").run();
});

test("a friendship row must be stored in order", () => {
  const d = oldDatabase();
  migrateSocialSchema(d);
  d.prepare("INSERT INTO friendships (user_a, user_b, since) VALUES ('u1', 'u2', 1)").run();
  expect(() => d.prepare("INSERT INTO friendships (user_a, user_b, since) VALUES ('u2', 'u1', 1)").run()).toThrow();
});

test("a 4.24 save_members (no created_at) gets the column; nothing is dropped", () => {
  const d = oldDatabase();
  d.exec(
    "CREATE TABLE save_members (save_id TEXT NOT NULL, user_id TEXT NOT NULL, seat_id TEXT, role TEXT NOT NULL DEFAULT 'member', PRIMARY KEY (save_id, user_id))",
  );
  d.prepare("INSERT INTO save_members (save_id, user_id, seat_id, role) VALUES ('w', 'u1', NULL, 'owner')").run();
  migrateSocialSchema(d);
  migrateSocialSchema(d);
  const cols = (d.prepare("PRAGMA table_info(save_members)").all() as { name: string }[]).map((c) => c.name);
  expect(cols).toEqual(expect.arrayContaining(["save_id", "user_id", "seat_id", "role", "created_at"]));
  expect(d.prepare("SELECT user_id AS u, created_at AS c FROM save_members").get()).toEqual({ u: "u1", c: 0 });
  d.prepare("INSERT INTO save_members (save_id, user_id, seat_id, role, created_at) VALUES ('w', 'u2', 's2', 'member', 5)").run();
  expect(() =>
    d.prepare("INSERT INTO save_members (save_id, user_id, seat_id, role, created_at) VALUES ('w', 'u3', 's2', 'member', 6)").run(),
  ).toThrow();
});

test("chat_messages gets a meta column (additive, twice is fine)", () => {
  const d = oldDatabase();
  migrateSocialSchema(d);
  migrateSocialSchema(d);
  const cols = (d.prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[]).map((c) => c.name);
  expect(cols).toContain("meta");
});
