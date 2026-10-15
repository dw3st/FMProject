import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { befriend, blockUser, setNickname } from "@/backend/social/socialStore";
import { uniqueNick } from "@/backend/social/socialTestUtils";
import { addSeat } from "@/backend/seats";
import { addWorldInvite, deleteWorldInvites } from "@/backend/worlds/worldStore";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";
import type { ServerEvent } from "@/types/socialTypes";

type Login = ReturnType<typeof devAutoLogin>;

function listen(userId: string): ServerEvent[] {
  const events: ServerEvent[] = [];
  onSocketOpen({ data: { userId, session: "s", saveId: null, clubName: null }, send: (m: string) => events.push(JSON.parse(m)), close() {} } as SocialSocket);
  return events;
}

function nicked(email: string): { login: Login; nick: string } {
  const login = devAutoLogin(email);
  const nick = uniqueNick("rv");
  setNickname(login.user.id, nick, Date.now());
  return { login, nick };
}

beforeEach(() => resetRealtime());

describe("world routes review: invites, events, body limits", () => {
  let owner: Login;
  let saveId: string;
  let code: string;
  let premier: string[];

  beforeAll(async () => {
    owner = nicked("rv-owner@test.local").login;
    const res = await createMultiWorld(owner.session.token);
    saveId = res.json.id;
    code = res.json.world.inviteCode;
    premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");
  }, 300_000);
  afterAll(async () => { await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  const inviteOf = (token: string, nickname: string) =>
    callApi("POST", "/api/worlds/:saveId/invites", token, { params: { saveId }, body: { nickname } });

  test("invites: resend is silent, member 403, existing member 409, limit 409, dead invites are dropped", async () => {
    const f = nicked("rv-friend@test.local");
    befriend(owner.user.id, f.login.user.id, Date.now());
    const events = listen(f.login.user.id);
    expect((await inviteOf(owner.session.token, f.nick)).status).toBe(200);
    expect((await inviteOf(owner.session.token, f.nick)).status).toBe(200);
    expect(events.filter((e) => e.type === "world_invite")).toHaveLength(1);

    // A member cannot invite.
    const member = devAutoLogin("rv-member@test.local");
    await addSeat(saveId, { userId: member.user.id, clubId: premier[0]!, manager: TEST_MANAGER });
    expect((await inviteOf(member.session.token, f.nick)).status).toBe(403);

    // Inviting someone who already is a member (a friend of the owner).
    befriend(owner.user.id, member.user.id, Date.now());
    const memberNick = uniqueNick("rv");
    setNickname(member.user.id, memberNick, Date.now());
    expect(await inviteOf(owner.session.token, memberNick)).toMatchObject({ status: 409, json: { error: "alreadyMember" } });

    // The 20 pending invites cap (the friend already has one: a new friend is refused).
    const extras = Array.from({ length: 19 }, (_, i) => devAutoLogin(`rv-extra-${i}@test.local`).user.id);
    for (const id of extras) addWorldInvite(saveId, id, owner.user.id, Date.now());
    const g = nicked("rv-friend2@test.local");
    befriend(owner.user.id, g.login.user.id, Date.now());
    expect(await inviteOf(owner.session.token, g.nick)).toMatchObject({ status: 409, json: { error: "inviteLimit" } });
    deleteWorldInvites(saveId);

    // Dead invites: after a block the invite disappears from the list (and is deleted).
    expect((await inviteOf(owner.session.token, f.nick)).status).toBe(200);
    expect(((await callApi("GET", "/api/worlds/invites", f.login.session.token)).json.invites as unknown[]).length).toBe(1);
    blockUser(owner.user.id, f.login.user.id, Date.now());
    expect((await callApi("GET", "/api/worlds/invites", f.login.session.token)).json.invites).toEqual([]);
  }, 300_000);

  test("world_members on join, settings and owner; remove with a seat of another world is 404", async () => {
    const watcher = listen(owner.user.id);
    const joiner = devAutoLogin("rv-joiner@test.local");
    const joined = await callApi("POST", "/api/worlds/join", joiner.session.token, { body: { code, clubId: premier[1], manager: TEST_MANAGER } });
    expect(joined.status).toBe(201);
    expect(watcher.filter((e) => e.type === "world_members").length).toBeGreaterThanOrEqual(1);

    const before = watcher.length;
    await callApi("PUT", "/api/worlds/:saveId/settings", owner.session.token, { params: { saveId }, body: { deadlineHours: 12 } });
    expect(watcher.slice(before)).toContainEqual({ type: "world_members", saveId });

    const joinerEvents = listen(joiner.user.id);
    const ownerSeat = memberOf(saveId, owner.user.id)!.seatId;
    const give = await callApi("POST", "/api/worlds/:saveId/owner", owner.session.token, { params: { saveId }, body: { seatId: joined.json.seatId } });
    expect(give.status).toBe(200);
    expect(joinerEvents).toContainEqual({ type: "world_members", saveId });
    // Back to the first owner.
    expect((await callApi("POST", "/api/worlds/:saveId/owner", joiner.session.token, { params: { saveId }, body: { seatId: ownerSeat } })).status).toBe(200);

    // A seat that belongs to the other world is not a member here.
    const other = await createMultiWorld(devAutoLogin("rv-other@test.local").session.token);
    const foreignSeat = other.json.seats?.[0] ?? (await saveService.getMeta(other.json.id))!.seats[0]!;
    expect(await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", owner.session.token, { params: { saveId, seatId: foreignSeat } }))
      .toMatchObject({ status: 404, json: { error: "notMember" } });
    await saveService.deleteSave(other.json.id).catch(() => {});
  }, 600_000);

  test("bodies: over 8 KB is 413, a bad clubId or sackingEnabled or nickname is 400", async () => {
    const huge = { code, clubId: "x".repeat(9000), manager: TEST_MANAGER };
    expect(await callApi("POST", "/api/worlds/join", owner.session.token, { body: huge })).toMatchObject({ status: 413, json: { error: "tooLarge" } });
    const a = devAutoLogin("rv-body@test.local");
    const join = (body: Record<string, unknown>) => callApi("POST", "/api/worlds/join", a.session.token, { body: { code, manager: TEST_MANAGER, ...body } });
    expect((await join({ clubId: "c".repeat(65) })).status).toBe(400);
    expect((await join({ clubId: premier[2], sackingEnabled: "no" })).status).toBe(400);
    expect((await inviteOf(owner.session.token, "n".repeat(21))).status).toBe(400);
  }, 120_000);
});

describe("world routes review: start twice, owner alone vs a concurrent join, no nickname", () => {
  let owner: Login;
  let saveId: string;
  let code: string;
  let premier: string[];

  beforeAll(async () => {
    owner = devAutoLogin("rv2-owner@test.local");
    const res = await createMultiWorld(owner.session.token);
    saveId = res.json.id;
    code = res.json.world.inviteCode;
    premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");
  }, 300_000);
  afterAll(async () => { await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  test("inviting without a nickname is 409", async () => {
    const r = await callApi("POST", "/api/worlds/:saveId/invites", owner.session.token, { params: { saveId }, body: { nickname: "someone" } });
    expect(r).toMatchObject({ status: 409, json: { error: "noNickname" } });
  });

  test("two parallel starts run once", async () => {
    const p = { saveId };
    const [a, b] = await Promise.all([
      callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p }),
      callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await saveService.getMeta(saveId))?.world?.phase).toBe("running");
  }, 600_000);

  test("the owner alone leaving while someone joins: never a deleted world with a new member", async () => {
    const joiner = devAutoLogin("rv2-joiner@test.local");
    const [leave, join] = await Promise.all([
      callApi("POST", "/api/worlds/:saveId/leave", owner.session.token, { params: { saveId } }),
      callApi("POST", "/api/worlds/join", joiner.session.token, { body: { code, clubId: premier[0], manager: TEST_MANAGER } }),
    ]);
    if (leave.status === 200) {
      expect(leave.json.deleted).toBe(true);
      expect(await saveService.getMeta(saveId)).toBeNull();
      expect(join.status).not.toBe(201);
    } else {
      expect(leave.status).toBe(409);
      expect(leave.json.error).toBe("transferFirst");
      expect(join.status).toBe(201);
      expect(await saveService.getMeta(saveId)).not.toBeNull();
      expect(memberOf(saveId, joiner.user.id)).not.toBeNull();
    }
  }, 600_000);
});
