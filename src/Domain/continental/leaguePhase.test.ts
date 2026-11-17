import { describe, expect, test } from "bun:test";
import { BRACKET_ORDER, LEAGUE_PHASE, bracketTies, drawLeaguePhase, leaguePhaseTable, playoffTies, roundOf16Ties, scheduleLeaguePhase, venueRuns } from "@/Domain/continental/leaguePhase";
import { mulberry32 } from "@/Domain/rng";
import type { DrawClub } from "@/Domain/continental/groupDraw";
import type { Fixture } from "@/types/calendarTypes";

/** A realistic spread: 5 English, 5 Spanish, 4 Italian, 4 German, 4 French, then 14 countries with 1, levels mixed. */
function clubs(): DrawClub[] {
  const ids = [
    ...["ENG", "ESP", "ITA", "GER", "FRA"].flatMap((c) => Array.from({ length: c === "ENG" || c === "ESP" ? 5 : 4 }, (_, i) => ({ c, i }))),
    ...Array.from({ length: 14 }, (_, i) => ({ c: `C${i}`, i: 0 })),
  ];
  // Big countries spread over the pots (the i-th club of a country a pot lower), the small ones at the bottom.
  return ids.map(({ c, i }, n) => ({ id: `${c}${i}`, country: c, level: c.startsWith("C") ? 2 - n * 0.01 : 5 - i - n * 0.001 }));
}

describe("league phase draw", () => {
  for (const seed of [1, 7, 42, 99, 2026]) {
    test(`seed ${seed}: 8 opponents, 2 per pot, 4 home, no compatriot, max 2 per country`, () => {
      const cs = clubs();
      const { pots, matches } = drawLeaguePhase(cs, mulberry32(seed));
      expect(matches.length).toBe(144);
      const country = new Map(cs.map((c) => [c.id, c.country]));
      const potOf = new Map(pots.flatMap((p, i) => p.map((id) => [id, i] as const)));
      for (const c of cs) {
        const mine = matches.filter((m) => m.home === c.id || m.away === c.id);
        const opps = mine.map((m) => (m.home === c.id ? m.away : m.home));
        expect(new Set(opps).size).toBe(8);
        expect(mine.filter((m) => m.home === c.id).length).toBe(4);
        for (let p = 0; p < 4; p++) {
          const vs = mine.filter((m) => potOf.get(m.home === c.id ? m.away : m.home) === p);
          expect(vs.length).toBe(2);
          expect(vs.filter((m) => m.home === c.id).length).toBe(1);
        }
        expect(opps.some((o) => country.get(o) === c.country)).toBe(false);
        const per = new Map<string, number>();
        for (const o of opps) per.set(country.get(o)!, (per.get(country.get(o)!) ?? 0) + 1);
        expect(Math.max(...per.values())).toBeLessThanOrEqual(LEAGUE_PHASE.MAX_PER_COUNTRY);
      }
    });
  }

  test("deterministic per seed", () => {
    expect(drawLeaguePhase(clubs(), mulberry32(5))).toEqual(drawLeaguePhase(clubs(), mulberry32(5)));
  });

  test("schedule: 8 rounds, every club once a round, few runs of 3", () => {
    const { matches } = drawLeaguePhase(clubs(), mulberry32(3));
    const rounds = scheduleLeaguePhase(matches, mulberry32(4));
    expect(rounds.length).toBe(8);
    for (const r of rounds) {
      const ids = r.flatMap((m) => [m.home, m.away]);
      expect(r.length).toBe(18);
      expect(new Set(ids).size).toBe(36);
    }
    expect(rounds.flat().length).toBe(144);
    expect(venueRuns(rounds)).toBeLessThanOrEqual(8);
  });

  test("a pot full of one country still draws, with compatriots only where unavoidable", () => {
    // Pot 1: 5 English clubs out of 9 — five of them cannot all avoid each other inside the pot.
    const cs: DrawClub[] = Array.from({ length: 36 }, (_, n) => ({ id: `x${n}`, country: n < 5 ? "ENG" : `K${n}`, level: 10 - n * 0.1 }));
    const { matches } = drawLeaguePhase(cs, mulberry32(11));
    expect(matches.length).toBe(144);
    const compatriots = matches.filter((m) => m.home.startsWith("x") && Number(m.home.slice(1)) < 5 && Number(m.away.slice(1)) < 5).length;
    expect(compatriots).toBeLessThanOrEqual(3);
  });
});

describe("table and bracket", () => {
  const fx = (home: string, away: string, h: number, a: number): Fixture =>
    ({ id: `${home}-${away}`, date: "2026-09-16", competition: "ucl", round: 1, home, away, played: true, result: { home: h, away: a } }) as Fixture;

  test("points, then goal difference, goals, away goals", () => {
    const rows = leaguePhaseTable(["a", "b", "c"], [fx("a", "b", 2, 0), fx("c", "a", 0, 3), fx("b", "c", 3, 3)]);
    expect(rows.map((r) => r.squadId)).toEqual(["a", "b", "c"]);
    expect(rows[0]!.pts).toBe(6);
    expect(rows[1]!.awayGf).toBe(0);
    expect(rows[2]!.awayGf).toBe(3);
  });

  test("play-off: 9 v 24 … 16 v 17, the better placed hosts the second leg", () => {
    const order = Array.from({ length: 36 }, (_, i) => `p${i + 1}`);
    const ties = playoffTies(order);
    expect(ties[0]).toEqual({ first: "p24", second: "p9" });
    expect(ties[7]).toEqual({ first: "p17", second: "p16" });
  });

  test("round of 16 in bracket order, then the bracket pairs the right winners", () => {
    const seeds = Object.fromEntries(Array.from({ length: 36 }, (_, i) => [`p${i + 1}`, i + 1]));
    const winners = ["p9", "p10", "p11", "p12", "p20", "p19", "p15", "p16"];
    const r16 = roundOf16Ties(seeds, winners);
    expect(r16.map((t) => t.second)).toEqual(BRACKET_ORDER.map((k) => `p${k}`));
    expect(r16[0]).toEqual({ first: "p16", second: "p1" });
    expect(r16[1]).toEqual({ first: "p9", second: "p8" });
    const qf = bracketTies(seeds, r16.map((t) => t.second));
    expect(qf).toEqual([{ first: "p8", second: "p1" }, { first: "p5", second: "p4" }, { first: "p7", second: "p2" }, { first: "p6", second: "p3" }]);
    expect(bracketTies(seeds, ["p8", "p4", "p2", "p6"])).toEqual([{ first: "p8", second: "p4" }, { first: "p6", second: "p2" }]);
  });
});
