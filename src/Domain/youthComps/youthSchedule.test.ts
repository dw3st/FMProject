import { describe, expect, test } from "bun:test";
import { roundRobinPairings, scheduleYouthSeason } from "@/Domain/youthComps/youthSchedule";

const clubs = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

describe("roundRobinPairings", () => {
  test("double round robin: 38 rounds, 10 games, every pair twice with swapped venue", () => {
    const rounds = roundRobinPairings(clubs, "seed");
    expect(rounds.length).toBe(38);
    for (const r of rounds) {
      expect(r.length).toBe(10);
      expect(new Set(r.flatMap(([h, a]) => [h, a])).size).toBe(20);
    }
    const seen = new Map<string, number>();
    for (const r of rounds) for (const [h, a] of r) seen.set(`${h}>${a}`, (seen.get(`${h}>${a}`) ?? 0) + 1);
    for (const a of clubs) for (const b of clubs) if (a !== b) expect(seen.get(`${a}>${b}`)).toBe(1);
  });
  test("first half is a complete first leg", () => {
    const rounds = roundRobinPairings(clubs, "seed").slice(0, 19);
    const pairs = new Set(rounds.flat().map(([h, a]) => [h, a].sort().join("-")));
    expect(pairs.size).toBe(190);
  });
  test("odd number of clubs: one rests per round", () => {
    const rounds = roundRobinPairings(clubs.slice(0, 5), "s");
    expect(rounds.length).toBe(10);
    for (const r of rounds) expect(r.length).toBe(2);
  });
  test("deterministic, and the seed changes the order", () => {
    expect(roundRobinPairings(clubs, "x")).toEqual(roundRobinPairings(clubs, "x"));
    expect(roundRobinPairings(clubs, "x")).not.toEqual(roundRobinPairings(clubs, "y"));
  });
});

describe("scheduleYouthSeason", () => {
  const window = { start: "2026-08-10", end: "2027-05-09" }; // 39 semanas inteiras
  test("no fixture on a first-team day of either club, every date inside the window", () => {
    const busy = new Map<string, Set<string>>();
    for (const c of clubs) busy.set(c, new Set(["2026-08-25", "2026-09-02", "2026-09-03"]));
    busy.get("c1")!.add("2026-09-01");
    busy.get("c2")!.add("2026-10-06");
    const out = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: busy, age: "u21" })!;
    expect(out.fixtures.length).toBe(380);
    for (const f of out.fixtures) {
      expect(f.date >= window.start && f.date <= window.end).toBe(true);
      expect(busy.get(f.home)!.has(f.date) || busy.get(f.away)!.has(f.date)).toBe(false);
    }
  });
  test("a club never plays two youth games on the same day", () => {
    const busy = new Map<string, Set<string>>();
    for (const c of clubs) busy.set(c, new Set());
    // c1 busy on every Tuesday and Wednesday: its games move.
    for (let d = new Date("2026-08-11T12:00:00Z"); d.toISOString() < "2027-05-09"; d.setUTCDate(d.getUTCDate() + 7)) {
      busy.get("c1")!.add(d.toISOString().slice(0, 10));
      const w = new Date(d); w.setUTCDate(w.getUTCDate() + 1);
      busy.get("c1")!.add(w.toISOString().slice(0, 10));
    }
    const out = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: busy, age: "u21" })!;
    const seen = new Set<string>();
    for (const f of out.fixtures) for (const c of [f.home, f.away]) {
      expect(seen.has(`${c}@${f.date}`)).toBe(false);
      seen.add(`${c}@${f.date}`);
    }
    for (const f of out.fixtures) if (f.home === "c1" || f.away === "c1") expect(busy.get("c1")!.has(f.date)).toBe(false);
  });
  test("one round per week when there are enough weeks; mostly midweek", () => {
    const out = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u21" })!;
    const commonDays = out.roundDates;
    expect(commonDays.length).toBe(38);
    for (let i = 1; i < commonDays.length; i++) expect(commonDays[i]! > commonDays[i - 1]!).toBe(true);
    expect(out.fixtures.every((f) => [1, 2, 3, 4, 5].includes(dow(f.date)))).toBe(true);
    expect(out.singleLeg).toBe(false);
  });
  test("u21 prefers tuesday, u19 thursday", () => {
    const u21 = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u21" })!;
    const u19 = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u19" })!;
    expect(dow(u21.roundDates[0]!)).toBe(2);
    expect(dow(u19.roundDates[0]!)).toBe(4);
  });
  test("short windows: two a week, then only the first leg, then nothing", () => {
    const all = roundRobinPairings(clubs, "s");
    // 2026-12-21 (seg) .. 2027-05-09 (dom) = 20 semanas: 2W = 40 ≥ 38 → turno e returno, duas por semana.
    const twice = scheduleYouthSeason({ rounds: all, window: { start: "2026-12-21", end: "2027-05-09" }, busyByClub: new Map(), age: "u21" })!;
    expect(twice.singleLeg).toBe(false);
    expect(new Set(twice.fixtures.map((f) => f.round)).size).toBe(38);
    for (let i = 1; i < twice.roundDates.length; i++) expect(twice.roundDates[i]! > twice.roundDates[i - 1]!).toBe(true);
    // 2027-01-04 (seg) .. 2027-05-09 (dom) = 18 semanas: 2W = 36 < 38 → só o turno (19 rodadas).
    const half = scheduleYouthSeason({ rounds: all, window: { start: "2027-01-04", end: "2027-05-09" }, busyByClub: new Map(), age: "u21" })!;
    expect(half.singleLeg).toBe(true);
    expect(new Set(half.fixtures.map((f) => f.round)).size).toBe(19);
    // 2027-04-05 .. 2027-05-09 = 5 semanas: 3 × 5 = 15 < 19 → não gera.
    expect(scheduleYouthSeason({ rounds: all, window: { start: "2027-04-05", end: "2027-05-09" }, busyByClub: new Map(), age: "u21" })).toBeNull();
  });
  test("a window that does not start on monday skips the partial week", () => {
    const out = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window: { start: "2026-08-12", end: "2027-05-09" }, busyByClub: new Map(), age: "u21" })!;
    expect(out.fixtures.every((f) => f.date >= "2026-08-17")).toBe(true);
  });
  test("deterministic", () => {
    const a = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u19" });
    const b = scheduleYouthSeason({ rounds: roundRobinPairings(clubs, "s"), window, busyByClub: new Map(), age: "u19" });
    expect(a).toEqual(b);
  });
});
