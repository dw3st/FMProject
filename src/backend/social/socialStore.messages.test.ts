import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { DAY_MS } from "@/Domain/social/socialConfig";
import { dmRoomId, worldRoomId } from "@/Domain/social/rooms";
import {
  addWorldMember,
  blockUser,
  insertMessage,
  isWorldMember,
  listMessages,
  markRead,
  purgeOldMessages,
  unreadCount,
  worldMemberIds,
  worldsOf,
} from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";

const NOW = 1_800_000_000_000;

describe("worlds", () => {
  test("owner counts as member; a world shows up only with two members", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const saveId = randomUUID();
    recordSaveOwnership(saveId, a.id);
    expect(isWorldMember(a.id, saveId)).toBe(true);
    expect(worldsOf(a.id)).not.toContain(saveId);
    addWorldMember(saveId, b.id, "member");
    expect(worldMemberIds(saveId).sort()).toEqual([a.id, b.id].sort());
    expect(worldsOf(a.id)).toContain(saveId);
    expect(worldsOf(b.id)).toContain(saveId);
    expect(isWorldMember(c.id, saveId)).toBe(false);
    expect(worldsOf(c.id)).not.toContain(saveId);
  });
});

describe("messages", () => {
  test("history is paginated newest first, returned oldest first", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = dmRoomId(a.id, b.id);
    for (let i = 0; i < 60; i++) insertMessage(room, i % 2 ? a.id : b.id, `m${i}`, NOW + i);
    const page = listMessages(room, a.id, { limit: 50 });
    expect(page).toHaveLength(50);
    expect(page[0]!.body).toBe("m10");
    expect(page[49]!.body).toBe("m59");
    expect(page[49]!.fromNickname).toBe(a.nickname);
    const older = listMessages(room, a.id, { before: page[0]!.id, limit: 50 });
    expect(older.map((m) => m.body)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`));
  });

  test("a blocked sender's messages disappear for whoever blocked", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = worldRoomId(randomUUID());
    insertMessage(room, a.id, "from a", NOW);
    insertMessage(room, b.id, "from b", NOW + 1);
    blockUser(a.id, b.id, NOW + 2);
    expect(listMessages(room, a.id, { limit: 50 }).map((m) => m.body)).toEqual(["from a"]);
    expect(listMessages(room, b.id, { limit: 50 }).map((m) => m.body)).toEqual(["from a", "from b"]);
  });

  test("unread counts others' messages after the last read; read only moves forward and is clamped", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = dmRoomId(a.id, b.id);
    const m1 = insertMessage(room, b.id, "1", NOW);
    insertMessage(room, a.id, "mine", NOW + 1);
    const m3 = insertMessage(room, b.id, "3", NOW + 2);
    expect(unreadCount(a.id, room)).toBe(2);
    expect(markRead(a.id, room, m1.id)).toBe(m1.id);
    expect(unreadCount(a.id, room)).toBe(1);
    expect(markRead(a.id, room, 0)).toBe(m1.id);
    expect(markRead(a.id, room, m3.id + 1000)).toBe(m3.id);
    expect(unreadCount(a.id, room)).toBe(0);
  });

  test("unread ignores blocked senders", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const room = worldRoomId(randomUUID());
    insertMessage(room, b.id, "x", NOW);
    blockUser(a.id, b.id, NOW);
    expect(unreadCount(a.id, room)).toBe(0);
  });

  test("messages older than 90 days are purged", () => {
    const a = makeUser(uniqueNick());
    const room = worldRoomId(randomUUID());
    insertMessage(room, a.id, "old", NOW - 91 * DAY_MS);
    insertMessage(room, a.id, "new", NOW);
    expect(purgeOldMessages(NOW)).toBeGreaterThanOrEqual(1);
    expect(listMessages(room, a.id, { limit: 50 }).map((m) => m.body)).toEqual(["new"]);
  });
});
