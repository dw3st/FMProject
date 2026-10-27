import { afterAll, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { defaultGroupDeps, waitWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { ensurePublicWorld, publicSlotTick } from "@/backend/worlds/publicWorld";

let saveId = "";
afterAll(async () => { if (saveId) await saveService.deleteSave(saveId).catch(() => {}); });

test("a due slot runs the world to the next round day, once", async () => {
  saveId = await ensurePublicWorld({ version: "9.9.0", now: () => Date.parse("2026-10-26T12:00:00.000Z"), sweep: false });
  const start = (await saveService.getMeta(saveId))!.currentDate!;
  let now = Date.parse("2026-10-26T16:30:00.000Z");
  const deps: GroupAdvanceDeps = { ...defaultGroupDeps, now: () => now };
  expect(await publicSlotTick(saveId, deps)).toBe(true);
  await waitWorld(saveId);
  const after = (await saveService.getMeta(saveId))!;
  expect(after.currentDate! > start).toBe(true);
  expect(after.world!.advance!.lastSlot).toBe("2026-10-26T16:00:00.000Z");
  // The step reached its target: the clock's target is cleared and nothing is running.
  expect(after.world!.advance!.slotTarget ?? null).toBeNull();
  expect(after.world!.advance!.running).toBe(false);
  expect(await publicSlotTick(saveId, deps)).toBe(false);
  now = Date.parse("2026-10-26T21:05:00.000Z");
  expect(await publicSlotTick(saveId, deps)).toBe(true);
  await waitWorld(saveId);
  const later = (await saveService.getMeta(saveId))!;
  expect(later.currentDate! > after.currentDate!).toBe(true);
  expect(later.world!.advance!.lastSlot).toBe("2026-10-26T21:00:00.000Z");
}, 600_000);
