import { afterAll, beforeAll, expect, test } from "bun:test";
import { db } from "@/backend/db";
import { saveService } from "@/backend/SaveService";
import { setKickScheduler } from "@/backend/groupAdvance";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { markSeen } from "@/backend/worlds/publicSeen";
import { ensurePublicWorld, flushSeen, inactivityPass } from "@/backend/worlds/publicWorld";
import { callApi, TEST_MANAGER } from "@/backend/worlds/worldTestUtils";
import { GAME_VERSION } from "@/Domain/saveVersion";

const DAY = 86_400_000;
let saveId = "";
let seatA = "";
let seatB = "";
let clubB = "";

beforeAll(async () => {
  setKickScheduler(() => {});
  db.prepare("DELETE FROM public_editions").run();
  saveId = await ensurePublicWorld({ version: GAME_VERSION, sweep: false });
  const premier = (await saveService.getSquadIndex(saveId)).inLeague("premier_league").map((e) => e.squadId);
  const join = async (clubId: string) => {
    const res = await callApi("POST", "/api/worlds/public/join", makeUser(uniqueNick("pi")).token, { body: { clubId, manager: TEST_MANAGER } });
    expect(res.status).toBe(201);
    return res.json.seatId as string;
  };
  seatA = await join(premier[0]!);
  clubB = premier[1]!;
  seatB = await join(clubB);
}, 600_000);

afterAll(async () => {
  setKickScheduler(null);
  await saveService.deleteSave(saveId).catch(() => {});
  db.prepare("DELETE FROM public_editions").run();
}, 120_000);

const seat = async (id: string) => (await saveService.getSeat(saveId, id))!;

test("last seen is written at most hourly", async () => {
  const t0 = Date.parse("2030-01-01T10:00:00.000Z");
  markSeen(saveId, seatA, t0);
  await flushSeen(saveId, t0);
  expect((await seat(seatA)).lastSeenAt).toBe(new Date(t0).toISOString());
  markSeen(saveId, seatA, t0 + 10 * 60_000);
  await flushSeen(saveId, t0 + 10 * 60_000);
  expect((await seat(seatA)).lastSeenAt).toBe(new Date(t0).toISOString());
});

test("5 days away warns once; 7 days removes the seat and frees the club", async () => {
  const now = Date.parse("2030-01-10T10:00:00.000Z");
  await saveService.updateSeat(saveId, seatA, { lastSeenAt: new Date(now - DAY).toISOString() });
  await saveService.updateSeat(saveId, seatB, { lastSeenAt: new Date(now - 5.5 * DAY).toISOString() });
  await inactivityPass(saveId, now);
  const warnings = async () => (await saveService.getInbox(saveId, seatB)).filter((m) => m.category === "world" && m.kind === "inactive_warning");
  expect((await warnings()).length).toBe(1);
  expect((await seat(seatB)).inactiveWarnedAt).toBe(new Date(now).toISOString());
  expect((await saveService.getInbox(saveId, seatA)).some((m) => m.category === "world" && m.kind === "inactive_warning")).toBe(false);

  await inactivityPass(saveId, now + 60_000);
  expect((await warnings()).length).toBe(1);

  await saveService.updateSeat(saveId, seatB, { lastSeenAt: new Date(now - 7.5 * DAY).toISOString() });
  await inactivityPass(saveId, now);
  const meta = (await saveService.getMeta(saveId))!;
  expect(meta.seats).not.toContain(seatB);
  expect(meta.seats).toContain(seatA);
  expect((await saveService.humanClubIds(saveId)).has(clubB)).toBe(false);
}, 300_000);
