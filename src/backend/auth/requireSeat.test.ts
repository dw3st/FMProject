import { describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { requireSeat } from "@/backend/auth/middleware";

const req = (token?: string) => new Request("http://localhost/x", { headers: token ? { cookie: `fs_session=${token}` } : {} });

describe("requireSeat", () => {
  test("a member gets his seat and role; a stranger gets 404; no session gets 401", () => {
    const saveId = `w-${randomUUID()}`;
    const owner = devAutoLogin(`o-${randomUUID()}@test.local`);
    const friend = devAutoLogin(`f-${randomUUID()}@test.local`);
    const stranger = devAutoLogin(`s-${randomUUID()}@test.local`);
    addSaveMember(saveId, owner.user.id, "seat-a", "owner");
    addSaveMember(saveId, friend.user.id, "seat-b", "member");

    const a = requireSeat(req(owner.session.token), saveId);
    expect(a instanceof Response).toBe(false);
    expect(a).toMatchObject({ seatId: "seat-a", role: "owner", userId: owner.user.id });
    expect(requireSeat(req(friend.session.token), saveId)).toMatchObject({ seatId: "seat-b", role: "member" });

    const s = requireSeat(req(stranger.session.token), saveId);
    expect(s instanceof Response && s.status).toBe(404);
    const anon = requireSeat(req(), saveId);
    expect(anon instanceof Response && anon.status).toBe(401);
  });
});
