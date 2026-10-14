import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import {
  addSaveMember, countOwnedSaves, deleteSaveMembers, isSaveMember, listMemberSaveIds, listSaveMembers, memberOf,
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
    expect(listMemberSaveIds(friend.id)).toContain(saveId);
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
    expect(listMemberSaveIds(a.id)).not.toContain(saveId);
  });
});
