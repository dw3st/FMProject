import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { kickWorld, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addDays } from "@/Domain/dates";
import type { ServerEvent } from "@/types/socialTypes";
import type { Fixture } from "@/types/calendarTypes";

const D = "2027-03-10";
const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const created: string[] = [];
afterAll(async () => { for (const id of created) await saveService.deleteSave(id); }, 60_000);

function stubDeps(over: Partial<GroupAdvanceDeps> = {}): GroupAdvanceDeps & { days: string[]; events: ServerEvent[] } {
  const days: string[] = [];
  const events: ServerEvent[] = [];
  return {
    service: saveService,
    now: () => NOW,
    notify: (_userId, e) => events.push(e),
    matchDates: async () => [],
    matchOn: async () => null,
    runDay: async (saveId) => {
      const date = (await saveService.getMeta(saveId))!.currentDate!;
      days.push(date);
      const next = addDays(date, 1);
      await saveService.updateMeta(saveId, { currentDate: next });
      return { ok: true, payload: { newDate: next }, seats: {} };
    },
    days, events,
    ...over,
  };
}

async function world(seats: Record<string, Record<string, unknown>>, w: Record<string, unknown> = {}) {
  const id = await fakeWorld({ seatIds: Object.keys(seats), date: D, world: w, seats });
  created.push(id);
  return id;
}

describe("group advance executor", () => {
  test("runs to the smallest ready date and waits there for everybody", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13" }, b: { readyUntil: "2027-03-15" } });
    const deps = stubDeps();
    const r = await kickWorld(id, deps);
    expect(deps.days).toEqual(["2027-03-10", "2027-03-11", "2027-03-12"]);
    expect(r).toMatchObject({ days: 3, date: "2027-03-13", target: "2027-03-13", waitingFor: ["a"] });
    const adv = (await saveService.getMeta(id))!.world!.advance!;
    expect(adv.running).toBe(false);
    expect(adv.waitingSince).toBe(new Date(NOW).toISOString());
  });

  test("stops ON an undecided game and goes on once it is decided", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" }, b: { readyUntil: "2027-03-15" } });
    const game = { id: "fx", date: "2027-03-12" } as Fixture;
    const deps = stubDeps({
      matchDates: async (_s, _id, seatId, from) => (seatId === "a" && from <= "2027-03-12" ? ["2027-03-12"] : []),
      matchOn: async (_s, _id, seatId, date) => (seatId === "a" && date === "2027-03-12" ? game : null),
    });
    const first = await kickWorld(id, deps);
    expect(first.date).toBe("2027-03-12");
    expect(first.waitingFor).toEqual(["a"]);
    await saveService.updateSeat(id, "a", { matchDecision: { date: "2027-03-12", fixtureId: "fx", mode: "simulate" } });
    const r = await kickWorld(id, deps);
    expect(r.date).toBe("2027-03-15");
    expect((await saveService.getSeat(id, "a"))!.matchDecision).toBeUndefined();
  });

  test("a stop of the day (job offer) unmarks the seat", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" }, b: { readyUntil: "2027-03-15" } });
    const deps = stubDeps();
    const base = deps.runDay;
    deps.runDay = async (saveId, recs) => {
      const out = await base(saveId, recs);
      return out.ok ? { ...out, seats: { a: { jobOffers: 1 } } } : out;
    };
    const r = await kickWorld(id, deps);
    expect(r.days).toBe(1);
    expect((await saveService.getSeat(id, "a"))!.readyUntil).toBeNull();
    expect((await saveService.getPendingSummary(id, "a"))[0]).toEqual({ date: D, newDate: "2027-03-11", seat: { jobOffers: 1 } });
  });

  test("an error stops and frees the world", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" } });
    const deps = stubDeps({ runDay: async () => ({ ok: false, status: 500, error: "boom" }) });
    const r = await kickWorld(id, deps);
    expect(r.error).toBe("boom");
    const meta = (await saveService.getMeta(id))!;
    expect(meta.currentDate).toBe(D);
    expect(meta.world!.advance!.running).toBe(false);
  });

  test("a refused live recording is simulated instead of locking the world", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" } });
    const recording = { fixtureId: "fx" } as never;
    await saveService.updateSeat(id, "a", { matchDecision: { date: D, fixtureId: "fx", mode: "live" } });
    await saveService.writeLiveRecording(id, "a", { date: D, fixtureId: "fx", recording });
    const calls: number[] = [];
    const deps = stubDeps();
    const base = deps.runDay;
    deps.runDay = async (saveId, recs) => {
      calls.push(Object.keys(recs).length);
      if (Object.keys(recs).length > 0) return { ok: false, status: 400, error: "unregistered player in recording" };
      return base(saveId, recs);
    };
    deps.matchDates = async (_s, _id, seatId, from) => (seatId === "a" && from <= D ? [D] : []);
    const r = await kickWorld(id, deps);
    expect(calls.slice(0, 2)).toEqual([1, 0]);
    expect(r.error).toBeUndefined();
    expect(r.date).toBe("2027-03-12");
    expect(await saveService.getLiveRecording(id, "a")).toBeNull();
  });

  test("two kicks run one executor", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" } });
    const deps = stubDeps();
    const [p1, p2] = [kickWorld(id, deps), kickWorld(id, deps)];
    expect(p1).toBe(p2);
    await p1;
    expect(deps.days).toEqual(["2027-03-10", "2027-03-11"]);
  });

  test("deadline passed: the assistant takes the late seat to the others' stop", async () => {
    const since = new Date(NOW - 25 * 3_600_000).toISOString();
    const id = await world(
      { a: { readyUntil: "2027-03-13" }, late: {} },
      { deadlineHours: 24, advance: { running: false, waitingSince: since, target: D } },
    );
    const deps = stubDeps();
    const r = await kickWorld(id, deps);
    expect(r.date).toBe("2027-03-13");
    const inbox = await saveService.getInbox(id, "late");
    expect(inbox.some((m) => m.category === "world" && (m as { kind?: string }).kind === "auto_advanced")).toBe(true);
  });

  test("deadline passed with a game of the late seat: the assistant simulates it", async () => {
    const since = new Date(NOW - 25 * 3_600_000).toISOString();
    const id = await world(
      { a: { readyUntil: "2027-03-13" }, late: {} },
      { deadlineHours: 24, advance: { running: false, waitingSince: since, target: D } },
    );
    const game = { id: "fx", date: "2027-03-11" } as Fixture;
    const decisions: (string | undefined)[] = [];
    const deps = stubDeps({
      matchDates: async (_s, _id, seatId, from) => (seatId === "late" && from <= "2027-03-11" ? ["2027-03-11"] : []),
      matchOn: async (_s, _id, seatId, date) => (seatId === "late" && date === "2027-03-11" ? game : null),
    });
    const base = deps.runDay;
    deps.runDay = async (saveId, recs) => {
      decisions.push((await saveService.getSeat(saveId, "late"))!.matchDecision?.mode);
      return base(saveId, recs);
    };
    const r = await kickWorld(id, deps);
    expect(r.date).toBe("2027-03-13");
    expect(decisions).toEqual(["simulate", "simulate", undefined]);
  });

  test("deadline not passed, or no deadline: nothing runs", async () => {
    const since = new Date(NOW - 3_600_000).toISOString();
    for (const hours of [24, null]) {
      const id = await world({ a: { readyUntil: "2027-03-13" }, late: {} }, { deadlineHours: hours, advance: { running: false, waitingSince: since, target: D } });
      const deps = stubDeps();
      expect((await kickWorld(id, deps)).days).toBe(0);
      expect((await saveService.getMeta(id))!.world!.advance!.waitingSince).toBe(since);
    }
  });

  test("a world in the lobby never advances", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13" } }, { phase: "lobby" });
    expect((await kickWorld(id, stubDeps())).days).toBe(0);
  });
});
