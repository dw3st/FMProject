import { afterAll, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { defaultGroupDeps, waitWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { ensurePublicWorld, publicSlotTick } from "@/backend/worlds/publicWorld";
import { markSeen } from "@/backend/worlds/publicSeen";
import { addSeat } from "@/backend/seats";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { addDays } from "@/Domain/dates";

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

test("everyone active ready: the step starts before the slot, 20 minutes apart", async () => {
  const id = await ensurePublicWorld({ version: "9.9.1", now: () => Date.parse("2026-10-26T12:00:00.000Z"), sweep: false });
  try {
    let now = Date.parse("2026-10-26T13:30:00.000Z"); // 10:30 Brasília: no slot due (09:00 taken at creation)
    const deps: GroupAdvanceDeps = { ...defaultGroupDeps, now: () => now };
    // No seat: nobody to be ready, the world waits for the slot.
    expect(await publicSlotTick(id, deps)).toBe(false);
    const user = devAutoLogin("early-step@test.local").user;
    const { seatId } = await addSeat(id, { userId: user.id, clubId: "33", manager: { name: "Early", nationalityIso: "br", backgroundId: "former-player" } });
    markSeen(id, seatId, now);
    // Active but not ready.
    expect(await publicSlotTick(id, deps)).toBe(false);
    const start = (await saveService.getMeta(id))!.currentDate!;
    await saveService.updateSeat(id, seatId, { readyUntil: addDays(start, 60) });
    const games = await defaultGroupDeps.matchDates(saveService, id, seatId, start, addDays(start, 60));
    if (games[0] === start) await saveService.updateSeat(id, seatId, { matchDecision: { date: start, fixtureId: "x", mode: "simulate" } });
    expect(await publicSlotTick(id, deps)).toBe(true);
    await waitWorld(id);
    const after = (await saveService.getMeta(id))!;
    expect(after.currentDate! > start).toBe(true);
    // The slot clock is untouched; a second early step waits 20 minutes.
    expect(after.world!.advance!.lastSlot).toBe("2026-10-26T12:00:00.000Z");
    const fresh = (await saveService.getSeat(id, seatId))!;
    if (fresh.matchDecision?.date !== after.currentDate) {
      await saveService.updateSeat(id, seatId, { matchDecision: { date: after.currentDate!, fixtureId: "x", mode: "simulate" } });
    }
    now += 10 * 60_000;
    expect(await publicSlotTick(id, deps)).toBe(false);
    now += 11 * 60_000;
    expect(await publicSlotTick(id, deps)).toBe(true);
    await waitWorld(id);
  } finally {
    await saveService.deleteSave(id).catch(() => {});
  }
}, 600_000);
