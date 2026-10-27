import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "@/backend/db";
import { saveService } from "@/backend/SaveService";
import { defaultGroupDeps, setKickScheduler, waitWorld } from "@/backend/groupAdvance";
import { resetRealtime } from "@/backend/social/realtime";
import { makeUser, uniqueNick, type TestUser } from "@/backend/social/socialTestUtils";
import { ensurePublicWorld, publicSlotTick } from "@/backend/worlds/publicWorld";
import { listEditions } from "@/backend/worlds/publicStore";
import { worldCodeOf } from "@/backend/worlds/worldStore";
import { callApi, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";
import { GAME_VERSION } from "@/Domain/saveVersion";

beforeEach(() => resetRealtime());

describe("public world routes (part 5b)", () => {
  let saveId: string;
  let premier: string[];
  let championship: string;
  let a: TestUser;
  let aSeat: string;

  beforeAll(async () => {
    setKickScheduler(() => {});
    db.prepare("DELETE FROM public_editions").run();
    // The routes look up the edition of the running version.
    saveId = await ensurePublicWorld({ version: GAME_VERSION, now: () => Date.parse("2026-10-26T12:00:00.000Z"), sweep: false });
    const index = await saveService.getSquadIndex(saveId);
    premier = index.inLeague("premier_league").map((e) => e.squadId);
    championship = index.inLeague("of_championship")[0]!.squadId;
    a = makeUser(uniqueNick("pa"));
  }, 600_000);
  afterAll(async () => {
    setKickScheduler(null);
    await saveService.deleteSave(saveId).catch(() => {});
    db.prepare("DELETE FROM public_editions").run();
  }, 120_000);

  const join = (who: TestUser, clubId: string) =>
    callApi("POST", "/api/worlds/public/join", who.token, { body: { clubId, manager: TEST_MANAGER } });

  test("GET /api/worlds/public: the world for a stranger", async () => {
    const res = await callApi("GET", "/api/worlds/public", a.token);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ saveId, members: 0, max: 40, joined: false, takenClubs: [] });
    expect(res.json.edition.version).toBe(GAME_VERSION);
    expect(typeof res.json.nextSlotAt).toBe("string");
    expect((await callApi("GET", "/api/worlds/public", null)).status).toBe(401);
  });

  test("join: nickname required, only the 10 leagues, then in", async () => {
    expect(await join(makeUser(), premier[0]!)).toMatchObject({ status: 409, json: { error: "noNickname" } });
    expect(await join(a, championship)).toMatchObject({ status: 400, json: { error: "invalidClub" } });
    expect(await join(a, "nope")).toMatchObject({ status: 400, json: { error: "invalidClub" } });
    const res = await join(a, premier[0]!);
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ saveId, phase: "running" });
    aSeat = res.json.seatId;
    const info = await callApi("GET", "/api/worlds/public", a.token);
    expect(info.json).toMatchObject({ joined: true, members: 1, takenClubs: [premier[0]] });
  }, 300_000);

  test("join: taken club and a second seat are refused", async () => {
    const b = makeUser(uniqueNick("pb"));
    expect(await join(b, premier[0]!)).toMatchObject({ status: 409, json: { error: "clubTaken" } });
    expect(await join(a, premier[1]!)).toMatchObject({ status: 409, json: { error: "alreadyMember", saveId } });
  });

  test("owner actions answer 409 publicWorld", async () => {
    const p = { saveId };
    expect(await callApi("POST", "/api/worlds/:saveId/invite-code", a.token, { params: p })).toMatchObject({ status: 409, json: { error: "publicWorld" } });
    expect(await callApi("PUT", "/api/worlds/:saveId/settings", a.token, { params: p, body: { deadlineHours: 12 } }))
      .toMatchObject({ status: 409, json: { error: "publicWorld" } });
    expect(await callApi("POST", "/api/worlds/:saveId/invites", a.token, { params: p, body: { nickname: "x" } }))
      .toMatchObject({ status: 409, json: { error: "publicWorld" } });
    expect(await callApi("POST", "/api/worlds/:saveId/start", a.token, { params: p })).toMatchObject({ status: 409, json: { error: "publicWorld" } });
    expect(await callApi("POST", "/api/worlds/:saveId/owner", a.token, { params: p, body: { seatId: aSeat } }))
      .toMatchObject({ status: 409, json: { error: "publicWorld" } });
    expect(await callApi("POST", "/api/worlds/:saveId/members/:seatId/remove", a.token, { params: { saveId, seatId: aSeat } }))
      .toMatchObject({ status: 409, json: { error: "publicWorld" } });
  });

  test("the internal code never finds the public world", async () => {
    const code = worldCodeOf(saveId)!;
    expect(code).toBeTruthy();
    const b = makeUser(uniqueNick("pc"));
    expect(await callApi("GET", "/api/worlds/by-code/:code", b.token, { params: { code } })).toMatchObject({ status: 404, json: { error: "notFound" } });
    expect(await callApi("POST", "/api/worlds/join", b.token, { body: { code, clubId: premier[2], manager: TEST_MANAGER } }))
      .toMatchObject({ status: 404, json: { error: "notFound" } });
  });

  test("leave: the seat goes, the world stays", async () => {
    expect(await callApi("POST", "/api/worlds/:saveId/leave", a.token, { params: { saveId } })).toMatchObject({ status: 200, json: { ok: true } });
    expect(await saveService.getMeta(saveId)).not.toBeNull();
    expect((await callApi("GET", "/api/worlds/public", a.token)).json).toMatchObject({ members: 0, joined: false });
  }, 120_000);

  test("hall of fame: the open edition", async () => {
    const res = await callApi("GET", "/api/worlds/public/hall", a.token);
    expect(res.status).toBe(200);
    expect(res.json.editions).toHaveLength(1);
    expect(res.json.editions[0]).toMatchObject({ version: GAME_VERSION, standings: [], endedAt: null });
    expect(res.json.editions[0].saveId).toBeUndefined();
  });

  test("views: the world and the group advance say public; a step fills the hall", async () => {
    const c = makeUser(uniqueNick("pd"));
    expect((await join(c, premier[3]!)).status).toBe(201);
    const p = { saveId };
    const view = await callApi("GET", "/api/worlds/:saveId", c.token, { params: p });
    expect(view.status).toBe(200);
    expect(view.json).toMatchObject({ kind: "public", max: 40, owner: "", inviteCode: "", myRole: "member" });
    expect(Number.isNaN(Date.parse(view.json.nextSlotAt))).toBe(false);
    const adv = await callApi("GET", "/api/worlds/:saveId/advance", c.token, { params: p });
    expect(adv.status).toBe(200);
    expect(adv.json).toMatchObject({ kind: "public", deadlineAt: null });
    expect(Number.isNaN(Date.parse(adv.json.nextSlotAt))).toBe(false);

    // Created at 12:00 UTC: the 16:00 UTC slot is due.
    expect(await publicSlotTick(saveId, { ...defaultGroupDeps, now: () => Date.parse("2026-10-26T16:30:00.000Z") })).toBe(true);
    await waitWorld(saveId);
    const open = listEditions().find((e) => e.version === GAME_VERSION)!;
    expect(open.standings.map((e) => e.nickname)).toContain(c.nickname);
    expect(open.standings[0]!.rank).toBe(1);
  }, 900_000);
});
