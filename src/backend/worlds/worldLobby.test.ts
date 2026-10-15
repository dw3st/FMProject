import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { callApi, createMultiWorld } from "@/backend/worlds/worldTestUtils";

describe("a world in the lobby does not move", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await saveService.deleteSave(id).catch(() => {}); }, 120_000);

  test("advance-day, advance-until and presimulate answer 409", async () => {
    const owner = devAutoLogin("lobby-owner@test.local");
    const saveId = (await createMultiWorld(owner.session.token)).json.id as string;
    created.push(saveId);
    const p = { saveId };
    const day = await callApi("POST", "/api/advance-day/:saveId", owner.session.token, { params: p });
    expect(day).toMatchObject({ status: 409, json: { error: "lobby" } });
    const until = await callApi("POST", "/api/saves/:saveId/advance-until", owner.session.token, { params: p });
    expect(until).toMatchObject({ status: 409, json: { error: "lobby" } });
    const pre = await callApi("POST", "/api/saves/:saveId/presimulate", owner.session.token, { params: p });
    expect(pre).toMatchObject({ status: 409, json: { error: "useWorldStart" } });
    expect((await saveService.getMeta(saveId))?.currentDate).toBeDefined();
  }, 300_000);
});
