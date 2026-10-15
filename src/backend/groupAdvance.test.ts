import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { kickWorld, resumeWorlds, waitWorld, worldClockTick, type GroupAdvanceDeps } from "@/backend/groupAdvance";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { addDays } from "@/Domain/dates";
import type { ServerEvent } from "@/types/socialTypes";
import type { Fixture } from "@/types/calendarTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";

const D = "2027-03-10";
const NOW = Date.parse("2026-10-15T12:00:00.000Z");
const MIN = 60_000;
const created: string[] = [];
afterAll(async () => {
  for (const id of created) {
    await waitWorld(id);
    deleteSaveMembers(id);
    await saveService.deleteSave(id);
  }
}, 60_000);

type Stub = GroupAdvanceDeps & {
  days: string[];
  events: { userId: string; event: ServerEvent }[];
  untils: string[];
};

/** A fake day: moves the date of `onlyId` (other worlds the clock or a resume may kick are left alone). */
function stubDeps(onlyId: string, over: Partial<GroupAdvanceDeps> = {}): Stub {
  const days: string[] = [];
  const events: { userId: string; event: ServerEvent }[] = [];
  const untils: string[] = [];
  return {
    service: saveService,
    now: () => NOW,
    notify: (userId, event) => events.push({ userId, event }),
    matchDates: async (_s, _id, _seat, _from, until) => { untils.push(until); return []; },
    matchOn: async () => null,
    runDay: async (saveId) => {
      if (saveId !== onlyId) return { ok: false, status: 500, error: "not this test" };
      const date = (await saveService.getMeta(saveId))!.currentDate!;
      days.push(date);
      const next = addDays(date, 1);
      await saveService.updateMeta(saveId, { currentDate: next });
      return { ok: true, payload: { newDate: next }, seats: {} };
    },
    days, events, untils,
    ...over,
  };
}

async function world(seats: Record<string, Record<string, unknown>>, w: Record<string, unknown> = {}) {
  const id = await fakeWorld({ seatIds: Object.keys(seats), date: D, world: w, seats });
  created.push(id);
  return id;
}

function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((r) => { open = r; });
  return { wait, open };
}

const autoMessages = async (id: string, seatId: string) =>
  (await saveService.getInbox(id, seatId)).filter((m) => m.category === "world" && (m as { kind?: string }).kind === "auto_advanced");

describe("group advance executor", () => {
  test("runs to the smallest ready date and waits there for everybody", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13" }, b: { readyUntil: "2027-03-15" } });
    const deps = stubDeps(id);
    const r = await kickWorld(id, deps);
    expect(deps.days).toEqual(["2027-03-10", "2027-03-11", "2027-03-12"]);
    expect(r).toMatchObject({ days: 3, date: "2027-03-13", target: "2027-03-13", waitingFor: ["a"] });
    const adv = (await saveService.getMeta(id))!.world!.advance!;
    expect(adv.running).toBe(false);
    expect(adv.waitingSince).toBe(new Date(NOW).toISOString());
  });

  test("the calendar is read only up to the furthest ready date; an unemployed seat is never read", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13" }, b: { readyUntil: "2027-03-15" }, c: { unemployed: true, readyUntil: "2027-03-15" } });
    const deps = stubDeps(id);
    await kickWorld(id, deps);
    expect(deps.untils.length).toBeGreaterThan(0);
    expect(new Set(deps.untils)).toEqual(new Set(["2027-03-15"]));
    expect(deps.untils.length % 2).toBe(0);
  });

  test("stops ON an undecided game and goes on once it is decided", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" }, b: { readyUntil: "2027-03-15" } });
    const game = { id: "fx", date: "2027-03-12" } as Fixture;
    const deps = stubDeps(id, {
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

  test("a decision for a later game is kept while the days before it run", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13", matchDecision: { date: "2027-03-15", fixtureId: "fx", mode: "simulate" } } });
    const deps = stubDeps(id, { matchDates: async (_s, _id, _seat, from) => (from <= "2027-03-15" ? ["2027-03-15"] : []) });
    expect((await kickWorld(id, deps)).date).toBe("2027-03-13");
    expect((await saveService.getSeat(id, "a"))!.matchDecision).toEqual({ date: "2027-03-15", fixtureId: "fx", mode: "simulate" });
  });

  test("a decision written during a day is not wiped by that day's cleanup", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13", matchDecision: { date: D, fixtureId: "f1", mode: "simulate" } } });
    const g = gate();
    const deps = stubDeps(id, {
      matchDates: async (_s, _id, _seat, from) => [D, "2027-03-11"].filter((d) => d >= from),
    });
    const base = deps.runDay;
    deps.runDay = async (saveId, recs) => {
      if ((await saveService.getMeta(saveId))!.currentDate === D) {
        await saveService.updateSeat(id, "a", { matchDecision: { date: "2027-03-11", fixtureId: "f2", mode: "simulate" } });
        g.open();
      }
      return base(saveId, recs);
    };
    const r = await kickWorld(id, deps);
    expect(r.date).toBe("2027-03-13");
  });

  for (const part of [{ jobOffers: 1 }, { sacked: true }, { seasonEnded: true }]) {
    test(`a stop of the day (${Object.keys(part)[0]}) unmarks the seat and is kept in the summary`, async () => {
      const id = await world({ a: { readyUntil: "2027-03-15" }, b: { readyUntil: "2027-03-15" } });
      const deps = stubDeps(id);
      const base = deps.runDay;
      deps.runDay = async (saveId, recs) => {
        const out = await base(saveId, recs);
        return out.ok ? { ...out, seats: { a: part } } : out;
      };
      const r = await kickWorld(id, deps);
      expect(r.days).toBe(1);
      expect((await saveService.getSeat(id, "a"))!.readyUntil).toBeNull();
      expect((await saveService.getSeat(id, "b"))!.readyUntil).toBe("2027-03-15");
      expect((await saveService.getPendingSummary(id, "a"))[0]).toEqual({ date: D, newDate: "2027-03-11", seat: part });
    });
  }

  test("an error stops and frees the world, and is kept for the clock", async () => {
    const id = await world({ a: { readyUntil: "2027-03-15" } });
    const deps = stubDeps(id, { runDay: async () => ({ ok: false, status: 500, error: "boom" }) });
    const r = await kickWorld(id, deps);
    expect(r.error).toBe("boom");
    const meta = (await saveService.getMeta(id))!;
    expect(meta.currentDate).toBe(D);
    expect(meta.world!.advance).toMatchObject({ running: false, error: "boom", errorAt: new Date(NOW).toISOString(), errorTries: 1 });
  });

  test("a throwing day is an error; the clock retries it later, then gives up", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" } });
    const throwing = stubDeps(id, { runDay: async () => { throw new Error("kaput"); } });
    expect((await kickWorld(id, throwing)).error).toBe("kaput");
    expect((await saveService.getMeta(id))!.world!.advance!.errorTries).toBe(1);

    expect(await worldClockTick({ ...throwing, now: () => NOW + 4 * MIN })).not.toContain(id);
    expect(await worldClockTick({ ...throwing, now: () => NOW + 6 * MIN })).toContain(id);
    await waitWorld(id);
    expect((await saveService.getMeta(id))!.world!.advance!.errorTries).toBe(2);

    const meta = (await saveService.getMeta(id))!;
    await saveService.updateMeta(id, { world: { ...meta.world!, advance: { ...meta.world!.advance!, errorTries: 5 } } });
    expect(await worldClockTick({ ...throwing, now: () => NOW + 999 * MIN })).not.toContain(id);

    const ok = stubDeps(id);
    const r = await kickWorld(id, ok);
    expect(r.date).toBe("2027-03-12");
    expect((await saveService.getMeta(id))!.world!.advance).toMatchObject({ error: null, errorTries: 0 });
  });

  test("a kick during a run that ends in error is not lost", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" } });
    const g = gate();
    const deps = stubDeps(id);
    const base = deps.runDay;
    let calls = 0;
    deps.runDay = async (saveId, recs) => {
      if (calls++ === 0) { await g.wait; throw new Error("once"); }
      return base(saveId, recs);
    };
    const run = kickWorld(id, deps);
    await Bun.sleep(10);
    void kickWorld(id, deps);
    g.open();
    const r = await run;
    expect(r.error).toBeUndefined();
    expect(r.date).toBe("2027-03-12");
  });

  test("a kick during the run picks up a new target", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" }, b: { readyUntil: "2027-03-12" } });
    const g = gate();
    const deps = stubDeps(id);
    const base = deps.runDay;
    let first = true;
    deps.runDay = async (saveId, recs) => {
      if (first) { first = false; await g.wait; }
      return base(saveId, recs);
    };
    const run = kickWorld(id, deps);
    await Bun.sleep(10);
    await saveService.updateSeat(id, "a", { readyUntil: "2027-03-14" });
    await saveService.updateSeat(id, "b", { readyUntil: "2027-03-14" });
    void kickWorld(id, deps);
    g.open();
    expect((await run).date).toBe("2027-03-14");
  });

  test("the run stops cleanly at its day cap", async () => {
    const id = await world({ a: { readyUntil: "2027-03-20" } });
    const deps = stubDeps(id, { maxDaysPerRun: 2 });
    const r = await kickWorld(id, deps);
    expect(r).toMatchObject({ days: 2, date: "2027-03-12" });
    const adv = (await saveService.getMeta(id))!.world!.advance!;
    expect(adv.running).toBe(false);
    expect(adv.waitingSince).toBe(new Date(NOW).toISOString());
  });

  test("a stop without change writes nothing", async () => {
    const id = await world({ a: { readyUntil: "2027-03-11" } });
    const deps = stubDeps(id);
    await kickWorld(id, deps);
    const before = (await saveService.getMeta(id))!.updatedAt;
    await Bun.sleep(5);
    await kickWorld(id, deps);
    expect((await saveService.getMeta(id))!.updatedAt).toBe(before);
  });

  test("a live game: the recording goes to its day only, then recording and decision are gone", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12", matchDecision: { date: D, fixtureId: "fx", mode: "live" } } });
    const recording = { fixtureId: "fx" } as unknown as PlayedMatchRecording;
    await saveService.writeLiveRecording(id, "a", { date: D, fixtureId: "fx", recording });
    const got: Record<string, string[]> = {};
    const seen: PlayedMatchRecording[] = [];
    const deps = stubDeps(id, { matchDates: async (_s, _id, _seat, from) => (from <= D ? [D] : []) });
    const base = deps.runDay;
    deps.runDay = async (saveId, recs) => {
      got[(await saveService.getMeta(saveId))!.currentDate!] = Object.keys(recs);
      seen.push(...Object.values(recs));
      return base(saveId, recs);
    };
    expect((await kickWorld(id, deps)).date).toBe("2027-03-12");
    expect(got).toEqual({ [D]: ["a"], "2027-03-11": [] });
    expect(seen).toEqual([recording]);
    expect(await saveService.getLiveRecording(id, "a")).toBeNull();
    expect((await saveService.getSeat(id, "a"))!.matchDecision).toBeUndefined();
  });

  test("a refused live recording is simulated instead, and the seat is told why", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12", matchDecision: { date: D, fixtureId: "fx", mode: "live" } } });
    const recording = { fixtureId: "fx" } as unknown as PlayedMatchRecording;
    await saveService.writeLiveRecording(id, "a", { date: D, fixtureId: "fx", recording });
    const calls: number[] = [];
    const deps = stubDeps(id, { matchDates: async (_s, _id, _seat, from) => (from <= D ? [D] : []) });
    const base = deps.runDay;
    deps.runDay = async (saveId, recs) => {
      calls.push(Object.keys(recs).length);
      if (Object.keys(recs).length > 0) return { ok: false, status: 400, error: "unregistered player in recording" };
      return base(saveId, recs);
    };
    const r = await kickWorld(id, deps);
    expect(calls.slice(0, 2)).toEqual([1, 0]);
    expect(r.error).toBeUndefined();
    expect(r.date).toBe("2027-03-12");
    expect(await saveService.getLiveRecording(id, "a")).toBeNull();
    const refused = (await saveService.getInbox(id, "a")).filter((m) => (m as { kind?: string }).kind === "live_refused");
    expect(refused).toHaveLength(1);
    expect((refused[0] as unknown as { reason: string }).reason).toBe("unregistered");
  });

  test("two kicks run one executor", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" } });
    const deps = stubDeps(id);
    const [p1, p2] = [kickWorld(id, deps), kickWorld(id, deps)];
    expect(p1).toBe(p2);
    await p1;
    expect(deps.days).toEqual(["2027-03-10", "2027-03-11"]);
  });

  test("a resume while an executor runs leaves it alone", async () => {
    const id = await world({ a: { readyUntil: "2027-03-12" } });
    const g = gate();
    const entered = gate();
    const deps = stubDeps(id);
    const base = deps.runDay;
    let first = true;
    deps.runDay = async (saveId, recs) => {
      if (saveId === id && first) { first = false; entered.open(); await g.wait; }
      return base(saveId, recs);
    };
    const run = kickWorld(id, deps);
    await entered.wait;
    const resumed = resumeWorlds(deps);
    await Bun.sleep(20);
    expect((await saveService.getMeta(id))!.world!.advance!.running).toBe(true);
    g.open();
    await run;
    await resumed;
    await waitWorld(id);
    expect((await saveService.getMeta(id))!.currentDate).toBe("2027-03-12");
    expect(deps.days).toEqual(["2027-03-10", "2027-03-11"]);
  });

  test("world_progress reaches every member with the nicknames of who holds the world, and the error", async () => {
    const ua = makeUser(uniqueNick("ga"));
    const ub = makeUser(uniqueNick("gb"));
    const id = await world({ a: { readyUntil: "2027-03-11" }, b: {} });
    addSaveMember(id, ua.id, "a", "owner");
    addSaveMember(id, ub.id, "b", "member");
    const deps = stubDeps(id);
    await kickWorld(id, deps);
    expect(deps.events.map((e) => e.userId).sort()).toEqual([ua.id, ub.id].sort());
    for (const { event } of deps.events) {
      expect(event).toEqual({ type: "world_progress", saveId: id, date: D, target: D, running: false, waitingFor: [ub.nickname!] });
    }

    await saveService.updateSeat(id, "b", { readyUntil: "2027-03-12" });
    const failing = stubDeps(id, { runDay: async () => ({ ok: false, status: 500, error: "boom" }) });
    await kickWorld(id, failing);
    expect(failing.events).toHaveLength(2);
    expect(failing.events[0]!.event).toMatchObject({ type: "world_progress", running: false, error: "boom" });
  });

  test("deadline passed: the assistant takes the late seat to the others' stop", async () => {
    const since = new Date(NOW - 25 * 3_600_000).toISOString();
    const id = await world(
      { a: { readyUntil: "2027-03-13" }, late: {} },
      { deadlineHours: 24, advance: { running: false, waitingSince: since, target: D } },
    );
    const deps = stubDeps(id);
    const r = await kickWorld(id, deps);
    expect(r.date).toBe("2027-03-13");
    expect(await autoMessages(id, "late")).toHaveLength(1);
  });

  test("deadline passed with a game of the late seat: the assistant simulates it", async () => {
    const since = new Date(NOW - 25 * 3_600_000).toISOString();
    const id = await world(
      { a: { readyUntil: "2027-03-13" }, late: {} },
      { deadlineHours: 24, advance: { running: false, waitingSince: since, target: D } },
    );
    const game = { id: "fx", date: "2027-03-11" } as Fixture;
    const decisions: (string | undefined)[] = [];
    const deps = stubDeps(id, {
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

  test("a listed game the day reader cannot find never makes the assistant spam", async () => {
    const since = new Date(NOW - 25 * 3_600_000).toISOString();
    const id = await world(
      { a: { readyUntil: "2027-03-13" }, late: {} },
      { deadlineHours: 24, advance: { running: false, waitingSince: since, target: D } },
    );
    const deps = stubDeps(id, {
      matchDates: async (_s, _id, seatId, from) => (seatId === "late" && from <= D ? [D] : []),
      matchOn: async () => null,
    });
    await kickWorld(id, deps);
    await kickWorld(id, deps);
    await worldClockTick(deps);
    await waitWorld(id);
    await kickWorld(id, deps);
    expect(await autoMessages(id, "late")).toHaveLength(1);
    expect((await saveService.getMeta(id))!.currentDate).toBe("2027-03-13");
  });

  test("deadline not passed, or no deadline: nothing runs", async () => {
    const since = new Date(NOW - 3_600_000).toISOString();
    for (const hours of [24, null]) {
      const id = await world({ a: { readyUntil: "2027-03-13" }, late: {} }, { deadlineHours: hours, advance: { running: false, waitingSince: since, target: D } });
      const deps = stubDeps(id);
      expect((await kickWorld(id, deps)).days).toBe(0);
      expect((await saveService.getMeta(id))!.world!.advance!.waitingSince).toBe(since);
    }
  });

  test("a world in the lobby never advances", async () => {
    const id = await world({ a: { readyUntil: "2027-03-13" } }, { phase: "lobby" });
    expect((await kickWorld(id, stubDeps(id))).days).toBe(0);
  });
});
