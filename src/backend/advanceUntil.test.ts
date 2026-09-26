import { describe, expect, test } from "bun:test";
import {
  computeAdvanceTarget,
  nextPlayerFixtureDate,
  runAdvanceBatch,
  shiftDate,
  type AdvanceBatchDeps,
  type AdvancePosition,
} from "@/backend/advanceUntil";
import type { AdvanceDayOutcome } from "@/backend/advanceDay";
import { SaveService } from "@/backend/SaveService";
import type { ISaveDAL } from "@/backend/dal/ISaveDAL";
import type { Fixture, LeagueDateIndex, RoundFixtures } from "@/types/calendarTypes";

describe("computeAdvanceTarget", () => {
  test("targets the next unplayed player fixture day itself", () => {
    expect(computeAdvanceTarget("2025-08-01", ["2025-08-20", "2025-08-10", "2025-07-01"])).toEqual({
      target: "2025-08-10",
      matchDate: "2025-08-10",
    });
  });

  test("a match today is the target (nothing to advance)", () => {
    expect(computeAdvanceTarget("2025-08-10", ["2025-08-10"])).toEqual({ target: "2025-08-10", matchDate: "2025-08-10" });
  });

  test("crosses month and year boundaries", () => {
    expect(computeAdvanceTarget("2025-12-20", ["2026-01-01"]).target).toBe("2026-01-01");
    expect(computeAdvanceTarget("2025-12-31", [], "2025-12-31").target).toBe("2026-01-01");
    expect(computeAdvanceTarget("2025-02-28", [], "2025-02-28").target).toBe("2025-03-01");
  });

  test("calendar exhausted: waits for the country rollover (day after it)", () => {
    expect(computeAdvanceTarget("2025-11-30", [], "2025-12-07")).toEqual({
      target: "2025-12-08",
      matchDate: null,
    });
  });

  test("throws when no match within 400 days", () => {
    expect(() => computeAdvanceTarget("2025-01-01", [])).toThrow();
    expect(() => computeAdvanceTarget("2025-01-01", ["2026-03-01"])).toThrow();
    expect(() => computeAdvanceTarget("2025-01-01", [], "2024-12-01")).toThrow();
  });
});

function fixture(id: string, date: string, competition: string, home: string, away: string, played = false): Fixture {
  return { id, date, competition, round: 1, home, away, played, result: null };
}

/** In-memory ISaveDAL covering only round + date-index reads; any other method throws. */
function calendarDAL(leagues: Record<string, { dateIndex: LeagueDateIndex; rounds: Record<number, RoundFixtures> }>): ISaveDAL {
  const impl: Partial<ISaveDAL> = {
    async readDateIndex(_saveId, leagueSlug) {
      return leagues[leagueSlug]?.dateIndex ?? null;
    },
    async readRound(_saveId, leagueSlug, round) {
      return leagues[leagueSlug]?.rounds[round] ?? null;
    },
  };
  return new Proxy(impl, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (v) return v;
      return () => { throw new Error(`memory DAL: ${String(prop)} not implemented`); };
    },
  }) as ISaveDAL;
}

describe("nextPlayerFixtureDate", () => {
  test("earliest unplayed fixture across league AND cup", async () => {
    const svc = new SaveService(calendarDAL({
      premier_league: {
        dateIndex: { "2027-08-20": [1], "2027-08-30": [2] },
        rounds: {
          1: { leagueSlug: "premier_league", round: 1, fixtures: [fixture("f1", "2027-08-20", "premier_league", "me", "them")] },
          2: { leagueSlug: "premier_league", round: 2, fixtures: [fixture("f2", "2027-08-30", "premier_league", "me", "other")] },
        },
      },
      cup_england: {
        dateIndex: { "2027-08-14": [1] },
        rounds: {
          1: { leagueSlug: "cup_england", round: 1, fixtures: [fixture("c1", "2027-08-14", "cup_england", "me", "cupfoe")] },
        },
      },
    }));
    const date = await nextPlayerFixtureDate(svc, "save-1", ["premier_league", "cup_england"], "me", "2027-08-01");
    expect(date).toBe("2027-08-14");
  });

  test("league-only fixtures still work without a cup competition", async () => {
    const svc = new SaveService(calendarDAL({
      premier_league: {
        dateIndex: { "2027-08-20": [1] },
        rounds: { 1: { leagueSlug: "premier_league", round: 1, fixtures: [fixture("f1", "2027-08-20", "premier_league", "me", "them")] } },
      },
    }));
    const date = await nextPlayerFixtureDate(svc, "save-1", ["premier_league"], "me", "2027-08-01");
    expect(date).toBe("2027-08-20");
  });

  test("a played cup fixture doesn't count; the league date wins", async () => {
    const svc = new SaveService(calendarDAL({
      premier_league: {
        dateIndex: { "2027-08-20": [1] },
        rounds: { 1: { leagueSlug: "premier_league", round: 1, fixtures: [fixture("f1", "2027-08-20", "premier_league", "me", "them")] } },
      },
      cup_england: {
        dateIndex: { "2027-08-14": [1] },
        rounds: { 1: { leagueSlug: "cup_england", round: 1, fixtures: [fixture("c1", "2027-08-14", "cup_england", "me", "cupfoe", true)] } },
      },
    }));
    const date = await nextPlayerFixtureDate(svc, "save-1", ["premier_league", "cup_england"], "me", "2027-08-01");
    expect(date).toBe("2027-08-20");
  });
});

/** Fake save: `currentDate` advances by one per successful day; target recomputed per call. */
function fakeDeps(opts: {
  start: string;
  target: (currentDate: string) => string;
  failOn?: string;
  seasonEndOn?: string;
}) {
  let currentDate = opts.start;
  let locked = 0;
  let maxConcurrent = 0;
  const days: string[] = [];
  const deps: AdvanceBatchDeps = {
    async readPosition(): Promise<AdvancePosition> {
      return { currentDate, target: opts.target(currentDate), matchDate: opts.target(currentDate) };
    },
    async runDay(): Promise<AdvanceDayOutcome> {
      if (currentDate === opts.failOn) return { ok: false, status: 500, error: "failed to persist day" };
      days.push(currentDate);
      const ended = currentDate === opts.seasonEndOn;
      currentDate = shiftDate(currentDate, 1);
      return {
        ok: true,
        payload: {
          date: days[days.length - 1],
          newDate: currentDate,
          ...(ended
            ? {
                seasonEnded: true,
                archiveYear: 2025,
                moves: [{ squadId: "x", from: "a", to: "b", kind: "relegated" }],
                playerMove: { squadId: "me", from: "b", to: "a", kind: "promoted" },
                playerChampionOf: "b",
              }
            : {}),
        },
      };
    },
    async withLock<T>(fn: () => Promise<T>): Promise<T> {
      locked++;
      maxConcurrent = Math.max(maxConcurrent, locked);
      try { return await fn(); } finally { locked--; }
    },
  };
  return { deps, days, get currentDate() { return currentDate; }, get maxConcurrent() { return maxConcurrent; } };
}

describe("runAdvanceBatch", () => {
  test("stops ON the match day without simulating it", async () => {
    const f = fakeDeps({ start: "2025-08-01", target: () => "2025-08-04" });
    const r = await runAdvanceBatch(7, f.deps);
    expect(r).toMatchObject({ daysAdvanced: 3, done: true, newDate: "2025-08-04", target: "2025-08-04" });
    expect(f.days).toEqual(["2025-08-01", "2025-08-02", "2025-08-03"]);
    expect(f.days).not.toContain("2025-08-04");
    expect(f.maxConcurrent).toBe(1);
  });

  test("never runs the day function at or past the target, even from past it", async () => {
    const f = fakeDeps({ start: "2025-08-06", target: () => "2025-08-04" });
    const r = await runAdvanceBatch(7, f.deps);
    expect(r).toMatchObject({ daysAdvanced: 0, done: true });
    expect(f.days).toEqual([]);
  });

  test("stops at maxDays with done=false", async () => {
    const f = fakeDeps({ start: "2025-08-01", target: () => "2025-09-01" });
    const r = await runAdvanceBatch(5, f.deps);
    expect(r).toMatchObject({ daysAdvanced: 5, done: false, newDate: "2025-08-06" });
  });

  test("reaching the target exactly on the last allowed day reports done", async () => {
    const f = fakeDeps({ start: "2025-08-01", target: () => "2025-08-03" });
    const r = await runAdvanceBatch(2, f.deps);
    expect(r).toMatchObject({ daysAdvanced: 2, done: true });
  });

  test("already at the target: no day is run", async () => {
    const f = fakeDeps({ start: "2025-08-05", target: () => "2025-08-04" });
    const r = await runAdvanceBatch(7, f.deps);
    expect(r).toMatchObject({ daysAdvanced: 0, done: true });
    expect(f.days).toEqual([]);
  });

  test("stops on the first failing day and returns the error", async () => {
    const f = fakeDeps({ start: "2025-08-01", target: () => "2025-08-10", failOn: "2025-08-03" });
    const r = await runAdvanceBatch(7, f.deps);
    expect(r.daysAdvanced).toBe(2);
    expect(r.done).toBe(false);
    expect(r.newDate).toBe("2025-08-03");
    expect(r.error).toEqual({ status: 500, message: "failed to persist day" });
  });

  test("a target that cannot be computed is an error", async () => {
    const f = fakeDeps({ start: "2025-08-01", target: () => "2025-08-10" });
    f.deps.readPosition = async () => { throw new Error("no player match within 400 days of 2025-08-01"); };
    const r = await runAdvanceBatch(7, f.deps);
    expect(r.error?.status).toBe(400);
    expect(r.daysAdvanced).toBe(0);
  });

  test("aggregates season events and follows a target that moves after the rollover", async () => {
    // Before the rollover the target is the day after it; afterwards, the new calendar's match eve.
    const f = fakeDeps({
      start: "2025-12-05",
      seasonEndOn: "2025-12-07",
      target: (d) => (d <= "2025-12-07" ? "2025-12-08" : "2025-12-11"),
    });
    const r = await runAdvanceBatch(14, f.deps);
    expect(r).toMatchObject({ daysAdvanced: 6, done: true, newDate: "2025-12-11", target: "2025-12-11" });
    expect(r.seasonEvents).toEqual([
      {
        date: "2025-12-07",
        archiveYear: 2025,
        moves: [{ squadId: "x", from: "a", to: "b", kind: "relegated" }],
        playerMove: { squadId: "me", from: "b", to: "a", kind: "promoted" },
        playerChampionOf: "b",
      },
    ]);
  });
});
