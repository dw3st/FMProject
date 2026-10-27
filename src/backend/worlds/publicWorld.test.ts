import { afterAll, beforeEach, expect, test } from "bun:test";
import { db } from "@/backend/db";
import { saveService } from "@/backend/SaveService";
import { ensurePublicWorld, publicWorldId } from "@/backend/worlds/publicWorld";
import { listEditions } from "@/backend/worlds/publicStore";

const made: string[] = [];
beforeEach(() => db.prepare("DELETE FROM public_editions").run());
afterAll(async () => { for (const id of made) await saveService.deleteSave(id).catch(() => {}); });

test("creates one public world per version, running, with no seat", async () => {
  const a = await ensurePublicWorld({ version: "9.0.0", now: () => Date.parse("2026-10-26T12:00:00.000Z") });
  made.push(a);
  const meta = (await saveService.getMeta(a))!;
  expect(meta.mode).toBe("multi");
  expect(meta.world!.kind).toBe("public");
  expect(meta.world!.phase).toBe("running");
  expect(meta.world!.edition).toEqual({ version: "9.0.0", startedOn: "2026-10-26T12:00:00.000Z" });
  expect(meta.presimulated).toBe(true);
  expect(await ensurePublicWorld({ version: "9.0.0" })).toBe(a);
  expect(publicWorldId("9.0.0")).toBe(a);
}, 300_000);

test("a new version closes the previous edition and deletes its save", async () => {
  const a = await ensurePublicWorld({ version: "9.0.0" });
  made.push(a);
  const b = await ensurePublicWorld({ version: "9.1.0" });
  made.push(b);
  expect(b).not.toBe(a);
  expect(await saveService.getMeta(a)).toBeNull();
  const eds = listEditions();
  expect(eds.find((e) => e.version === "9.0.0")!.endedAt).not.toBeNull();
  expect(eds.find((e) => e.version === "9.1.0")!.endedAt).toBeNull();
}, 600_000);
