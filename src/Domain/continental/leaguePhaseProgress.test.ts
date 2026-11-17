import { describe, expect, test } from "bun:test";
import { generateContinental } from "@/Domain/continental/generateContinental";
import { advanceContinental } from "@/Domain/continental/continentalProgress";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";

const clubs = Array.from({ length: 36 }, (_, n) => ({ id: `c${n + 1}`, country: `K${n % 18}`, level: 6 - n * 0.05 }));
const dates = Array.from({ length: 17 }, (_, i) => new Date(Date.UTC(2026, 8, 15 + i * 14)).toISOString().slice(0, 10));

/** Plays a round: the club with the lower number wins 2-0 (a legible, deterministic table). */
function play(fixtures: Fixture[]): Fixture[] {
  return fixtures.map((f) => {
    const h = Number(f.home.slice(1));
    const a = Number(f.away.slice(1));
    const homeWins = h < a;
    return { ...f, played: true, result: { home: homeWins ? 2 : 0, away: homeWins ? 0 : 2 } };
  });
}

describe("league phase season end to end", () => {
  test("league phase -> play-off -> fixed bracket -> champion", () => {
    const gen = generateContinental({ slug: "ucl", year: 2026, clubs, dates, seedKey: "s:2026:ucl", format: "league" });
    let meta: LeagueSeasonMeta = gen.meta;
    expect(meta.continental!.format).toBe("league");
    expect(meta.totalRounds).toBe(17);
    const rounds = new Map<number, Fixture[]>(gen.rounds.map((r) => [r.round, r.fixtures]));
    for (let r = 1; r <= 8; r++) expect(rounds.get(r)!.length).toBe(18);

    const events: string[] = [];
    for (let round = 1; round <= 17; round++) {
      rounds.set(round, play(rounds.get(round)!));
      const res = advanceContinental(meta, rounds, round, "s:2026:ucl");
      if (!res) continue;
      meta = res.meta;
      for (const w of res.writes) rounds.set(w.round, w.fixtures);
      for (const e of res.events) events.push(`${e.kind}:${"stage" in e ? e.stage : ""}`);
    }
    const seeds = meta.continental!.seeds!;
    expect(seeds.c1).toBe(1);
    expect(Object.keys(seeds).length).toBe(36);
    expect(rounds.get(9)!.length).toBe(8);
    expect(rounds.get(11)!.length).toBe(8);
    expect(rounds.get(13)!.length).toBe(4);
    expect(rounds.get(15)!.length).toBe(2);
    expect(rounds.get(17)!.length).toBe(1);
    expect(rounds.get(17)![0]!.neutral).toBe(true);
    expect(meta.continental!.championId).toBe("c1");
    expect(events.filter((e) => e === "advanced:league").length).toBe(8);
    expect(events.filter((e) => e === "toPlayoff:").length).toBe(16);
    expect(events.filter((e) => e === "eliminated:league").length).toBe(12);
    expect(events.filter((e) => e === "advanced:playoff").length).toBe(8);
    // 1st meets the winner of 16th v 17th; with the better club winning, the semis are 1 v 4 and 2 v 3.
    expect(rounds.get(11)![0]!.home).toBe("c16");
    expect(rounds.get(11)![0]!.away).toBe("c1");
    const semis = rounds.get(15)!.map((f) => [f.home, f.away].sort().join("-"));
    expect(semis).toEqual(["c1-c4", "c2-c3"]);
  });
});
