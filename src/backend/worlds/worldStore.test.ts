import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import {
  addWorldInvite, deleteWorldCode, deleteWorldInvite, deleteWorldInvites, hasWorldInvite, listWorldCodeIds,
  listWorldInvitesFor, newWorldCode, pendingInviteCount, setWorldCode, worldCodeOf, worldIdByCode,
} from "@/backend/worlds/worldStore";

describe("world codes", () => {
  test("a world has one code; a new one replaces it; deleting forgets it", () => {
    const saveId = `w-${randomUUID()}`;
    const first = newWorldCode();
    setWorldCode(saveId, first);
    expect(worldIdByCode(first)).toBe(saveId);
    expect(worldCodeOf(saveId)).toBe(first);
    expect(listWorldCodeIds()).toContain(saveId);
    const second = newWorldCode();
    setWorldCode(saveId, second);
    expect(worldIdByCode(first)).toBeNull();
    expect(worldIdByCode(second)).toBe(saveId);
    deleteWorldCode(saveId);
    expect(worldCodeOf(saveId)).toBeNull();
  });

  test("newWorldCode never returns a code in use", () => {
    const saveId = `w-${randomUUID()}`;
    let calls = 0;
    // The first draw collides with an existing code, the second is free.
    setWorldCode(saveId, "2222222222");
    const code = newWorldCode(() => (calls++ < 10 ? 0 : 1));
    expect(code).toBe("3333333333");
    deleteWorldCode(saveId);
  });
});

describe("world invites", () => {
  test("add (replace), list, count, decline, delete the world's", () => {
    const saveId = `w-${randomUUID()}`;
    const u1 = `u-${randomUUID()}`;
    const u2 = `u-${randomUUID()}`;
    addWorldInvite(saveId, u1, "owner", 10);
    addWorldInvite(saveId, u1, "owner", 20);
    addWorldInvite(saveId, u2, "owner", 30);
    expect(pendingInviteCount(saveId)).toBe(2);
    expect(hasWorldInvite(saveId, u1)).toBe(true);
    expect(listWorldInvitesFor(u1)).toEqual([{ saveId, fromUser: "owner", createdAt: 20 }]);
    expect(deleteWorldInvite(saveId, u1)).toBe(true);
    expect(deleteWorldInvite(saveId, u1)).toBe(false);
    deleteWorldInvites(saveId);
    expect(pendingInviteCount(saveId)).toBe(0);
  });
});
