import { afterAll, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { presimulateWorld, runBufferedDay } from "@/backend/advanceDay";

let saveId = "";
afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

test("a world with no seat advances days (league rounds included)", async () => {
  saveId = (await saveService.createSave({ worldOnly: true, leagueSlug: "premier_league" })).id;
  await saveService.updateMeta(saveId, { mode: "multi" });
  await presimulateWorld(saveId, null);
  const start = (await saveService.getMeta(saveId))!.currentDate!;
  for (let i = 0; i < 4; i++) {
    const out = await runBufferedDay(saveId, {});
    expect(out.ok).toBe(true);
  }
  const meta = (await saveService.getMeta(saveId))!;
  expect(meta.currentDate! > start).toBe(true);
  const played = (await saveService.getAllFixturesForLeague(saveId, "premier_league")).filter((f) => f.played);
  expect(played.length).toBeGreaterThan(0);
}, 300_000);
