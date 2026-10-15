import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { isPresent, lastSeenAt, recordPresence, resetPresence, PRESENCE_WINDOW_MS } from "@/backend/presence";
import { canWrite, resolveRoom, roomParamFor, roomRecipients } from "@/backend/social/roomAccess";
import { addWorldMember, befriend, blockUser } from "@/backend/social/socialStore";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { dmRoomId, worldRoomId } from "@/Domain/social/rooms";

describe("resolveRoom", () => {
  test("a DM by the other's nickname, in any case, with the canonical name back", () => {
    const a = makeUser(uniqueNick("Mx"));
    const b = makeUser(uniqueNick("Ny"));
    const room = resolveRoom(a.id, `dm:${b.nickname!.toLowerCase()}`);
    expect(room).toEqual({
      kind: "dm",
      roomId: dmRoomId(a.id, b.id),
      param: `dm:${b.nickname}`,
      partner: { id: b.id, nickname: b.nickname! },
    });
  });

  test("unknown nickname, oneself and bad params are null", () => {
    const a = makeUser(uniqueNick());
    expect(resolveRoom(a.id, `dm:${uniqueNick()}`)).toBeNull();
    expect(resolveRoom(a.id, `dm:${a.nickname}`)).toBeNull();
    expect(resolveRoom(a.id, "dm:x")).toBeNull();
    expect(resolveRoom(a.id, "lobby")).toBeNull();
  });

  test("a world needs membership and two members", () => {
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    const c = makeUser(uniqueNick());
    const saveId = randomUUID();
    recordSaveOwnership(saveId, a.id);
    expect(resolveRoom(a.id, `world:${saveId}`)).toBeNull();
    addWorldMember(saveId, b.id, "member");
    expect(resolveRoom(a.id, `world:${saveId}`)).toEqual({
      kind: "world",
      roomId: worldRoomId(saveId),
      param: `world:${saveId}`,
      saveId,
    });
    expect(resolveRoom(c.id, `world:${saveId}`)).toBeNull();
    expect(roomRecipients(worldRoomId(saveId)).sort()).toEqual([a.id, b.id].sort());
  });
});

test("only friends with no block write a DM", () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  const room = resolveRoom(a.id, `dm:${b.nickname}`)!;
  expect(canWrite(a.id, room)).toBe(false);
  befriend(a.id, b.id, Date.now());
  expect(canWrite(a.id, room)).toBe(true);
  blockUser(b.id, a.id, Date.now());
  expect(canWrite(a.id, room)).toBe(false);
});

test("each side sees the DM under the other's nickname", () => {
  const a = makeUser(uniqueNick());
  const b = makeUser(uniqueNick());
  const id = dmRoomId(a.id, b.id);
  expect(roomParamFor(a.id, id)).toBe(`dm:${b.nickname}`);
  expect(roomParamFor(b.id, id)).toBe(`dm:${a.nickname}`);
  expect(roomParamFor(makeUser().id, id)).toBeNull();
  expect(roomRecipients(id).sort()).toEqual([a.id, b.id].sort());
});

test("presence: last seen and the 2.5-minute window", () => {
  resetPresence();
  expect(lastSeenAt("nobody")).toBeNull();
  recordPresence("u-x", 1_000);
  expect(lastSeenAt("u-x")).toBe(1_000);
  expect(isPresent("u-x", 1_000 + PRESENCE_WINDOW_MS)).toBe(true);
  expect(isPresent("u-x", 1_001 + PRESENCE_WINDOW_MS)).toBe(false);
});
