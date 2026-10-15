import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import {
  addSaveMember, countOwnedSaves, deleteSaveMembers, isSaveMember, listUserSaveIds, listSaveMembers, memberOf,
  memberBySeat, removeSaveMember, transferOwnership,
} from "@/backend/auth/saveOwnership";

describe("save_members", () => {
  test("owner and member of a world, each with one seat", () => {
    const saveId = `w-${randomUUID()}`;
    const owner = devAutoLogin(`owner-${randomUUID()}@test.local`).user;
    const friend = devAutoLogin(`friend-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, owner.id, "seat-a", "owner");
    addSaveMember(saveId, friend.id, "seat-b", "member");

    expect(memberOf(saveId, owner.id)).toMatchObject({ seatId: "seat-a", role: "owner" });
    expect(memberOf(saveId, friend.id)).toMatchObject({ seatId: "seat-b", role: "member" });
    expect(isSaveMember(saveId, friend.id)).toBe(true);
    expect(listSaveMembers(saveId).map((m) => m.seatId).sort()).toEqual(["seat-a", "seat-b"]);
    expect(listUserSaveIds(friend.id)).toContain(saveId);
    expect(countOwnedSaves(owner.id)).toBe(1);
    expect(countOwnedSaves(friend.id)).toBe(0);
  });

  test("one seat per user per world, one user per seat", () => {
    const saveId = `w-${randomUUID()}`;
    const a = devAutoLogin(`a-${randomUUID()}@test.local`).user;
    const b = devAutoLogin(`b-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    expect(() => addSaveMember(saveId, a.id, "seat-z", "member")).toThrow();
    expect(() => addSaveMember(saveId, b.id, "seat-a", "member")).toThrow();
  });

  test("deleting a world removes every member; a non-member gets null", () => {
    const saveId = `w-${randomUUID()}`;
    const a = devAutoLogin(`a-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    deleteSaveMembers(saveId);
    expect(memberOf(saveId, a.id)).toBeNull();
    expect(isSaveMember(saveId, a.id)).toBe(false);
    expect(listUserSaveIds(a.id)).not.toContain(saveId);
  });

  test("member by seat, removal and ownership transfer", () => {
    const saveId = `w-${randomUUID()}`;
    const a = devAutoLogin(`a-${randomUUID()}@test.local`).user;
    const b = devAutoLogin(`b-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    addSaveMember(saveId, b.id, "seat-b", "member");
    expect(memberBySeat(saveId, "seat-b")).toMatchObject({ userId: b.id, role: "member" });
    expect(memberBySeat(saveId, "seat-z")).toBeNull();

    transferOwnership(saveId, a.id, b.id);
    expect(memberOf(saveId, a.id)?.role).toBe("member");
    expect(memberOf(saveId, b.id)?.role).toBe("owner");
    expect(countOwnedSaves(a.id)).toBe(0);

    removeSaveMember(saveId, "seat-a");
    expect(memberOf(saveId, a.id)).toBeNull();
    expect(listSaveMembers(saveId).map((m) => m.seatId)).toEqual(["seat-b"]);
  });

  test("transferOwnership rejects the same user and a non-member, leaving the owner", () => {
    const saveId = `w-${randomUUID()}`;
    const a = devAutoLogin(`a-${randomUUID()}@test.local`).user;
    const outsider = devAutoLogin(`o-${randomUUID()}@test.local`).user;
    addSaveMember(saveId, a.id, "seat-a", "owner");
    expect(() => transferOwnership(saveId, a.id, a.id)).toThrow();
    expect(() => transferOwnership(saveId, a.id, outsider.id)).toThrow();
    expect(memberOf(saveId, a.id)?.role).toBe("owner");
  });
});
