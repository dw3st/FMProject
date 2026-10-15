import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrateWorldSchema } from "@/backend/db";

test("world_codes and world_invites are created and the migration runs twice", () => {
  const d = new Database(":memory:");
  migrateWorldSchema(d);
  migrateWorldSchema(d);
  const tables = (d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
  expect(tables).toEqual(expect.arrayContaining(["world_codes", "world_invites"]));
  d.prepare("INSERT INTO world_codes (code, save_id) VALUES ('AAAAAAAAAA', 's1')").run();
  expect(() => d.prepare("INSERT INTO world_codes (code, save_id) VALUES ('AAAAAAAAAA', 's2')").run()).toThrow();
  expect(() => d.prepare("INSERT INTO world_codes (code, save_id) VALUES ('BBBBBBBBBB', 's1')").run()).toThrow();
  d.prepare("INSERT INTO world_invites (save_id, user_id, from_user, created_at) VALUES ('s1', 'u1', 'u0', 1)").run();
  expect(() => d.prepare("INSERT INTO world_invites (save_id, user_id, from_user, created_at) VALUES ('s1', 'u1', 'u0', 2)").run()).toThrow();
});
