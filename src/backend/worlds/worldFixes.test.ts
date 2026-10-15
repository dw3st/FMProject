import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addSaveMember, deleteSaveMembers, memberOf } from "@/backend/auth/saveOwnership";
import { addSeat } from "@/backend/seats";
import { callApi, createMultiWorld, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";

describe("review fixes of the world of friends", () => {
  const created: string[] = [];
  const fakes: string[] = [];
  afterAll(async () => {
    for (const id of fakes) deleteSaveMembers(id);
    for (const id of created) await saveService.deleteSave(id).catch(() => {});
  }, 120_000);

  test("createdBy never leaves the server and a lobby refuses game writes", async () => {
    const owner = devAutoLogin("wf-owner@test.local");
    const made = await createMultiWorld(owner.session.token);
    const saveId = made.json.id as string;
    created.push(saveId);
    const token = owner.session.token;
    expect(made.json.world.createdBy).toBeUndefined();
    const list = await callApi("GET", "/api/saves", token);
    expect(list.json.find((s: { id: string }) => s.id === saveId).world.createdBy).toBeUndefined();
    const one = await callApi("GET", "/api/saves/:id", token, { params: { id: saveId } });
    expect(one.json.world.createdBy).toBeUndefined();
    const put = await callApi("PUT", "/api/saves/:id", token, { params: { id: saveId }, body: { formation: "4-3-3" } });
    expect(put.status).toBe(200);
    expect(put.json.world).toBeDefined();
    expect(put.json.world.createdBy).toBeUndefined();

    const buy = await callApi("POST", "/api/saves/:saveId/transfers", token, {
      params: { saveId }, body: { playerId: "x", fromSquadId: "1", fee: 1, wage: 1, years: 1 },
    });
    expect(buy).toMatchObject({ status: 409, json: { error: "lobby" } });
    const hire = await callApi("POST", "/api/saves/:saveId/staff/hire", token, { params: { saveId }, body: { memberId: "x", years: 1 } });
    expect(hire).toMatchObject({ status: 409, json: { error: "lobby" } });
    // Reads and tactics stay free; a stranger still sees a 404.
    expect((await callApi("GET", "/api/saves/:saveId/staff", token, { params: { saveId } })).status).toBe(200);
    const stranger = devAutoLogin("wf-stranger@test.local");
    expect((await callApi("POST", "/api/saves/:saveId/transfers", stranger.session.token, { params: { saveId }, body: {} })).status).toBe(404);
  }, 300_000);

  test("owner transfer: 409 ownerLimit when the receiver already owns 5 worlds", async () => {
    const owner = devAutoLogin("wf-own2@test.local");
    const saveId = (await createMultiWorld(owner.session.token)).json.id as string;
    created.push(saveId);
    const guest = devAutoLogin("wf-guest@test.local");
    const clubB = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").find((e) => e.squadId !== "33")!.squadId;
    const { seatId } = await addSeat(saveId, { userId: guest.user.id, clubId: clubB, manager: TEST_MANAGER });
    for (let i = 0; i < 5; i++) { const f = `wf-fake-${i}`; fakes.push(f); addSaveMember(f, guest.user.id, "seat_fake", "owner"); }
    const r = await callApi("POST", "/api/worlds/:saveId/owner", owner.session.token, { params: { saveId }, body: { seatId } });
    expect(r).toMatchObject({ status: 409, json: { error: "ownerLimit" } });
    expect(memberOf(saveId, guest.user.id)?.role).toBe("member");
  }, 300_000);
});
