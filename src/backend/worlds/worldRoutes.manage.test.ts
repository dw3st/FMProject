import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { befriend, setNickname } from "@/backend/social/socialStore";
import { uniqueNick } from "@/backend/social/socialTestUtils";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";
import type { ServerEvent } from "@/types/socialTypes";

type Login = ReturnType<typeof devAutoLogin>;

function listen(userId: string): ServerEvent[] {
  const events: ServerEvent[] = [];
  onSocketOpen({ data: { userId, session: "s", saveId: null, clubName: null }, send: (m: string) => events.push(JSON.parse(m)), close() {} } as SocialSocket);
  return events;
}

beforeEach(() => resetRealtime());

describe("world routes: invites, start, remove, leave, owner", () => {
  let owner: Login;
  let saveId: string;
  let premier: string[];

  beforeAll(async () => {
    owner = devAutoLogin("wm-owner@test.local");
    setNickname(owner.user.id, uniqueNick("own"), Date.now());
    saveId = (await createMultiWorld(owner.session.token)).json.id;
    premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");
  }, 300_000);
  afterAll(async () => { await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  test("invite: friends only (404 otherwise), event to the invited, listed and declined", async () => {
    const friend = devAutoLogin("wm-friend@test.local");
    const friendNick = uniqueNick("fr");
    setNickname(friend.user.id, friendNick, Date.now());
    const stranger = devAutoLogin("wm-stranger@test.local");
    const strangerNick = uniqueNick("st");
    setNickname(stranger.user.id, strangerNick, Date.now());
    befriend(owner.user.id, friend.user.id, Date.now());

    const p = { saveId };
    expect((await callApi("POST", "/api/worlds/:saveId/invites", owner.session.token, { params: p, body: { nickname: strangerNick } })).status).toBe(404);
    const events = listen(friend.user.id);
    expect((await callApi("POST", "/api/worlds/:saveId/invites", owner.session.token, { params: p, body: { nickname: friendNick } })).status).toBe(200);
    expect(events).toContainEqual(expect.objectContaining({ type: "world_invite", saveId }));

    const mine = await callApi("GET", "/api/worlds/invites", friend.session.token);
    expect(mine.json.invites).toEqual([expect.objectContaining({ saveId, code: expect.any(String) })]);
    expect((await callApi("DELETE", "/api/worlds/invites/:saveId", friend.session.token, { params: p })).status).toBe(200);
    expect((await callApi("GET", "/api/worlds/invites", friend.session.token)).json.invites).toEqual([]);
  });

  test("start: owner only, once, world_started to the members", async () => {
    const member = devAutoLogin("wm-member@test.local");
    await addSeat(saveId, { userId: member.user.id, clubId: premier[0]!, manager: TEST_MANAGER });
    const p = { saveId };
    expect((await callApi("POST", "/api/worlds/:saveId/start", member.session.token, { params: p })).status).toBe(403);
    const events = listen(member.user.id);
    const started = await callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p });
    expect(started).toMatchObject({ status: 200, json: { phase: "running" } });
    expect(events).toContainEqual({ type: "world_started", saveId });
    const meta = (await saveService.getMeta(saveId))!;
    expect(meta.world?.phase).toBe("running");
    expect(meta.presimulated).toBe(true);
    expect(await callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p }))
      .toMatchObject({ status: 409, json: { error: "alreadyStarted" } });
  }, 600_000);

  test("remove: owner only, not himself; the removed gets world_removed and his club goes to the AI", async () => {
    const victim = devAutoLogin("wm-victim@test.local");
    const seat = await addSeat(saveId, { userId: victim.user.id, clubId: premier[1]!, manager: TEST_MANAGER });
    const p = { saveId, seatId: seat.seatId };
    const ownerSeat = memberOf(saveId, owner.user.id)!.seatId;
    expect((await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", victim.session.token, { params: p })).status).toBe(403);
    expect(await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", owner.session.token, { params: { saveId, seatId: ownerSeat } }))
      .toMatchObject({ status: 400, json: { error: "useLeave" } });
    const events = listen(victim.user.id);
    expect((await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", owner.session.token, { params: p })).status).toBe(200);
    expect(events).toContainEqual({ type: "world_removed", saveId });
    expect(memberOf(saveId, victim.user.id)).toBeNull();
    expect((await saveService.humanClubIds(saveId)).has(premier[1]!)).toBe(false);
    expect((await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", owner.session.token, { params: p })).status).toBe(404);
  }, 600_000);

  test("owner: transfer, then the old owner leaves; the last member leaving deletes the world", async () => {
    const p = { saveId };
    expect(await callApi("POST", "/api/worlds/:saveId/leave", owner.session.token, { params: p }))
      .toMatchObject({ status: 409, json: { error: "transferFirst" } });
    const member = devAutoLogin("wm-member@test.local");
    const memberSeat = memberOf(saveId, member.user.id)!.seatId;
    expect((await callApi("POST", "/api/worlds/:saveId/owner", member.session.token, { params: p, body: { seatId: memberSeat } })).status).toBe(403);
    expect((await callApi("POST", "/api/worlds/:saveId/owner", owner.session.token, { params: p, body: { seatId: memberSeat } })).status).toBe(200);
    expect(memberOf(saveId, member.user.id)?.role).toBe("owner");
    expect(memberOf(saveId, owner.user.id)?.role).toBe("member");

    expect((await callApi("POST", "/api/worlds/:saveId/leave", owner.session.token, { params: p })).status).toBe(200);
    expect(memberOf(saveId, owner.user.id)).toBeNull();
    expect((await saveService.humanClubIds(saveId)).has("33")).toBe(false);

    const last = await callApi("POST", "/api/worlds/:saveId/leave", member.session.token, { params: p });
    expect(last).toMatchObject({ status: 200, json: { deleted: true } });
    expect(await saveService.getMeta(saveId)).toBeNull();
  }, 600_000);
});
