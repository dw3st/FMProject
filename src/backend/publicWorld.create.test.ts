import { afterAll, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { presimulateWorld } from "@/backend/advanceDay";

let saveId = "";
afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

test("createSave worldOnly: the whole world, no seat, no human club", async () => {
  const meta = await saveService.createSave({ worldOnly: true, leagueSlug: "premier_league" });
  saveId = meta.id;
  const world = await saveService.getMeta(saveId);
  expect(world!.seats).toEqual([]);
  expect(world!.currentDate).toBe(world!.activeLeagues!.find((l) => l.leagueSlug === "premier_league")!.start);
  expect((await saveService.humanClubIds(saveId)).size).toBe(0);
  const managers = await saveService.getManagers(saveId);
  expect(managers.some((m) => m.seatId)).toBe(false);
  expect(await saveService.getLeagueMeta(saveId, "ucl")).not.toBeNull();
  const r = await presimulateWorld(saveId, null);
  expect(r.reason).not.toBe("already presimulated");
}, 120_000);
