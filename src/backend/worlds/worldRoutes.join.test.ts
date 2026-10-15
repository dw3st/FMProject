import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { memberOf } from "@/backend/auth/saveOwnership";
import { resetRealtime } from "@/backend/social/realtime";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";

type Login = ReturnType<typeof devAutoLogin>;

beforeEach(() => resetRealtime());

describe("world routes: view, by-code, join, code, settings", () => {
  let owner: Login;
  let saveId: string;
  let code: string;
  let premier: string[];

  beforeAll(async () => {
    owner = devAutoLogin("wr-owner@test.local");
    const res = await createMultiWorld(owner.session.token);
    saveId = res.json.id;
    code = res.json.world.inviteCode;
    premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");
  }, 300_000);
  afterAll(async () => { await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  test("by-code: 404 with a bad code, the world for a stranger, 409 alreadyMember for the owner", async () => {
    const stranger = devAutoLogin("wr-stranger@test.local");
    expect((await callApi("GET", "/api/worlds/by-code/:code", stranger.session.token, { params: { code: "ZZZZZZZZZZ" } })).status).toBe(404);
    expect((await callApi("GET", "/api/worlds/by-code/:code", stranger.session.token, { params: { code: "%E0%A4%A" } })).status).toBe(404);
    const found = await callApi("GET", "/api/worlds/by-code/:code", stranger.session.token, { params: { code: code.toLowerCase() } });
    expect(found.status).toBe(200);
    expect(found.json).toMatchObject({ saveId, members: 1, max: 8, phase: "lobby", takenClubs: ["33"], leagueSlug: "premier_league", leagueName: "Premier League" });
    expect(JSON.stringify(found.json)).not.toContain("wr-owner@test.local");
    expect(await callApi("GET", "/api/worlds/by-code/:code", owner.session.token, { params: { code } }))
      .toMatchObject({ status: 409, json: { error: "alreadyMember", saveId } });
    expect((await callApi("GET", "/api/worlds/by-code/:code", null, { params: { code } })).status).toBe(401);
  });

  test("join: invalid manager, unknown club, taken club, then in; the race on one club", async () => {
    const a = devAutoLogin("wr-a@test.local");
    const join = (who: Login, body: Record<string, unknown>) => callApi("POST", "/api/worlds/join", who.session.token, { body });
    expect(await join(a, { code, clubId: premier[0], manager: { ...TEST_MANAGER, name: "x" } })).toMatchObject({ status: 400, json: { error: "invalidManager" } });
    expect(await join(a, { code, clubId: "nope", manager: TEST_MANAGER })).toMatchObject({ status: 400, json: { error: "invalidClub" } });
    expect(await join(a, { code, clubId: "33", manager: TEST_MANAGER })).toMatchObject({ status: 409, json: { error: "clubTaken" } });
    expect(await join(a, { code: "ZZZZZZZZZZ", clubId: premier[0], manager: TEST_MANAGER })).toMatchObject({ status: 404 });

    const b = devAutoLogin("wr-b@test.local");
    const [ra, rb] = await Promise.all([
      join(a, { code, clubId: premier[0], manager: TEST_MANAGER }),
      join(b, { code, clubId: premier[0], manager: TEST_MANAGER }),
    ]);
    expect([ra.status, rb.status].sort()).toEqual([201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.json.error).toBe("clubTaken");
    const winner = ra.status === 201 ? ra : rb;
    expect(winner.json).toMatchObject({ saveId, phase: "lobby" });
    expect(await join(ra.status === 201 ? a : b, { code, clubId: premier[1], manager: TEST_MANAGER }))
      .toMatchObject({ status: 409, json: { error: "alreadyMember", saveId } });
  }, 600_000);

  test("view: members only; owner changes the code (old link 404) and the deadline", async () => {
    const view = await callApi("GET", "/api/worlds/:saveId", owner.session.token, { params: { saveId } });
    expect(view.json).toMatchObject({ saveId, phase: "lobby", myRole: "owner", deadlineHours: 24 });
    expect((await callApi("GET", "/api/worlds/:saveId", devAutoLogin("wr-nobody@test.local").session.token, { params: { saveId } })).status).toBe(404);

    // The member is whoever won the race of the previous test.
    const memberLogin = ["wr-a@test.local", "wr-b@test.local"].map((e) => devAutoLogin(e)).find((l) => memberOf(saveId, l.user.id))!;
    expect((await callApi("POST", "/api/worlds/:saveId/invite-code", memberLogin.session.token, { params: { saveId } })).status).toBe(403);
    expect((await callApi("PUT", "/api/worlds/:saveId/settings", memberLogin.session.token, { params: { saveId }, body: { deadlineHours: 12 } })).status).toBe(403);

    const fresh = await callApi("POST", "/api/worlds/:saveId/invite-code", owner.session.token, { params: { saveId } });
    expect(fresh.json.inviteCode).not.toBe(code);
    expect((await callApi("GET", "/api/worlds/by-code/:code", devAutoLogin("wr-late@test.local").session.token, { params: { code } })).status).toBe(404);
    code = fresh.json.inviteCode;

    expect((await callApi("PUT", "/api/worlds/:saveId/settings", owner.session.token, { params: { saveId }, body: { deadlineHours: 36 } })).status).toBe(400);
    expect(await callApi("PUT", "/api/worlds/:saveId/settings", owner.session.token, { params: { saveId }, body: { deadlineHours: null } }))
      .toMatchObject({ status: 200, json: { deadlineHours: null } });
    expect((await saveService.getMeta(saveId))?.world?.deadlineHours).toBeNull();
  });

  test("full: 409 on by-code and on join", async () => {
    const seats = (await saveService.getMeta(saveId))!.seats.length;
    for (let i = seats; i < 8; i++) {
      await addSeat(saveId, { userId: devAutoLogin(`wr-fill-${i}@test.local`).user.id, clubId: premier[i + 1]!, manager: TEST_MANAGER });
    }
    const late = devAutoLogin("wr-full@test.local");
    expect(await callApi("GET", "/api/worlds/by-code/:code", late.session.token, { params: { code } })).toMatchObject({ status: 409, json: { error: "full" } });
    expect(await callApi("POST", "/api/worlds/join", late.session.token, { body: { code, clubId: premier[12], manager: TEST_MANAGER } }))
      .toMatchObject({ status: 409, json: { error: "full" } });
  }, 900_000);
});
