import { afterAll, beforeAll, expect, test } from "bun:test";
import { db } from "@/backend/db";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { ensurePublicWorld, publicWorldId } from "@/backend/worlds/publicWorld";
import { listEditions } from "@/backend/worlds/publicStore";
import { setWorldCode, worldCodeOf } from "@/backend/worlds/worldStore";
import { dueSlot } from "@/Domain/multiplayer/publicWorld";

const NOW = Date.parse("2026-10-26T12:00:00.000Z");
const made: string[] = [];
beforeAll(() => db.prepare("DELETE FROM public_editions").run());
afterAll(async () => { for (const id of made) await saveService.deleteSave(id).catch(() => {}); });

/** A bare world on disk with a world code (what the clock and the sweep see). */
async function codedFake(kind: "public" | "friends", code: string): Promise<string> {
  const id = await fakeWorld({ seatIds: [], date: "2027-03-10", world: kind === "public" ? { kind, deadlineHours: null } : {} });
  setWorldCode(id, code);
  made.push(id);
  return id;
}

let a = "";

test("creates one public world per version, running, with no seat; concurrent calls share it", async () => {
  const [x, y] = await Promise.all([
    ensurePublicWorld({ version: "9.0.0", now: () => NOW }),
    ensurePublicWorld({ version: "9.0.0", now: () => NOW }),
  ]);
  a = x;
  made.push(a);
  expect(y).toBe(a);
  const meta = (await saveService.getMeta(a))!;
  expect(meta.mode).toBe("multi");
  expect(meta.world!.kind).toBe("public");
  expect(meta.world!.phase).toBe("running");
  expect(meta.world!.edition).toEqual({ version: "9.0.0", startedOn: "2026-10-26T12:00:00.000Z" });
  // The slot already passed is taken: a new world first steps at the next one.
  expect(meta.world!.advance).toMatchObject({ running: false, lastSlot: dueSlot(NOW, null) });
  expect(meta.presimulated).toBe(true);
  expect(await ensurePublicWorld({ version: "9.0.0" })).toBe(a);
  expect(publicWorldId("9.0.0")).toBe(a);
}, 300_000);

test("the sweep deletes any other public world save, never a world of friends", async () => {
  const orphan = await codedFake("public", "ORPHANAAAA");
  const friends = await codedFake("friends", "FRIENDSAAA");
  expect(await ensurePublicWorld({ version: "9.0.0" })).toBe(a);
  expect(await saveService.getMeta(orphan)).toBeNull();
  expect(worldCodeOf(orphan)).toBeNull();
  expect(await saveService.getMeta(friends)).not.toBeNull();
  expect(await saveService.getMeta(a)).not.toBeNull();
}, 60_000);

test("an edition whose save never finished its presimulation is deleted and recreated", async () => {
  await saveService.updateMeta(a, { presimulated: undefined });
  const b = await ensurePublicWorld({ version: "9.0.0" });
  made.push(b);
  expect(b).not.toBe(a);
  expect(await saveService.getMeta(a)).toBeNull();
  expect(publicWorldId("9.0.0")).toBe(b);
  a = b;
}, 300_000);

test("a new version closes the previous edition and deletes its save", async () => {
  const b = await ensurePublicWorld({ version: "9.1.0" });
  made.push(b);
  expect(b).not.toBe(a);
  expect(await saveService.getMeta(a)).toBeNull();
  const eds = listEditions();
  expect(eds.find((e) => e.version === "9.0.0")!.endedAt).not.toBeNull();
  expect(eds.find((e) => e.version === "9.1.0")!.endedAt).toBeNull();
}, 300_000);
