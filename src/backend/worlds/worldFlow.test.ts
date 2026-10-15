import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { resetRealtime } from "@/backend/social/realtime";
import { setKickScheduler } from "@/backend/groupAdvance";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";

describe("world of friends: the whole flow", () => {
  let saveId = "";
  const kicks: string[] = [];
  setKickScheduler((id) => kicks.push(id));
  afterAll(async () => { setKickScheduler(null); if (saveId) await saveService.deleteSave(saveId).catch(() => {}); }, 120_000);

  test("owner creates, two friends join, owner starts, one leaves, another takes the freed club", async () => {
    resetRealtime();
    const owner = devAutoLogin("flow-owner@test.local");
    const created = await createMultiWorld(owner.session.token);
    saveId = created.json.id;
    const code = created.json.world.inviteCode as string;
    const premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId).filter((id) => id !== "33");

    const a = devAutoLogin("flow-a@test.local");
    const b = devAutoLogin("flow-b@test.local");
    const join = (token: string, clubId: string) => callApi("POST", "/api/worlds/join", token, { body: { code, clubId, manager: TEST_MANAGER } });
    expect((await join(a.session.token, premier[0]!)).status).toBe(201);
    expect((await join(b.session.token, premier[1]!)).status).toBe(201);
    expect(kicks).toEqual([saveId, saveId]);
    kicks.length = 0;

    const p = { saveId };
    expect((await callApi("POST", "/api/worlds/:saveId/start", owner.session.token, { params: p })).json.phase).toBe("running");
    expect((await saveService.getMeta(saveId))?.seats).toHaveLength(3);
    expect(kicks).toEqual([saveId]);
    kicks.length = 0;

    expect((await callApi("POST", "/api/worlds/:saveId/leave", a.session.token, { params: p })).status).toBe(200);
    expect(kicks).toEqual([saveId]);
    const view = await callApi("GET", "/api/worlds/:saveId", owner.session.token, { params: p });
    expect(view.json.members).toHaveLength(2);
    const ownerInbox = await saveService.getInbox(saveId, view.json.mySeatId);
    expect(ownerInbox.filter((m) => m.category === "world").map((m) => m.kind).sort()).toEqual(["member_joined", "member_joined", "member_left"]);

    const c = devAutoLogin("flow-c@test.local");
    const byCode = await callApi("GET", "/api/worlds/by-code/:code", c.session.token, { params: { code } });
    expect(byCode.json.takenClubs).not.toContain(premier[0]);
    const joined = await join(c.session.token, premier[0]!);
    expect(joined).toMatchObject({ status: 201, json: { phase: "running" } });
    const managers = await saveService.getManagers(saveId);
    expect(managers.filter((m) => m.squadId === premier[0]).map((m) => m.seatId)).toEqual([joined.json.seatId]);
    expect((await saveService.getMeta(saveId))?.managerVacancies?.[premier[0]!]).toBeUndefined();
  }, 1_200_000);
});
