import { describe, expect, test } from "bun:test";
import {
  drawFree,
  drawRoundOf16,
  finalWinner,
  tieWinner,
  twoLegFixtures,
  withAggregate,
} from "@/Domain/continental/knockout";
import { mulberry32 } from "@/Domain/rng";
import type { Fixture } from "@/types/calendarTypes";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const COUNTRIES = ["England", "Spain", "Italy", "Germany", "France", "Portugal", "Netherlands", "Turkey"];

function sampleWinnersAndRunners() {
  const winners = GROUPS.map((g) => `w_${g}`);
  const runnersUp = GROUPS.map((g) => `r_${g}`);
  const groupOf: Record<string, string> = {};
  const countryOf: Record<string, string> = {};
  GROUPS.forEach((g, i) => {
    groupOf[winners[i]!] = g;
    groupOf[runnersUp[i]!] = g;
    // Winner and runner-up of the same group are usually (not always) from the same country in a
    // real draw; vary it a bit here so the country rule is sometimes binding and sometimes not.
    countryOf[winners[i]!] = COUNTRIES[i % COUNTRIES.length]!;
    countryOf[runnersUp[i]!] = COUNTRIES[(i + 3) % COUNTRIES.length]!;
  });
  return { winners, runnersUp, groupOf, countryOf };
}

function countClashes(ties: { first: string; second: string }[], countryOf: Record<string, string>): number {
  return ties.filter((t) => countryOf[t.first] === countryOf[t.second]).length;
}

describe("drawRoundOf16", () => {
  test("8 ties, every winner and runner-up used exactly once, never same group, over many seeds", () => {
    const { winners, runnersUp, groupOf, countryOf } = sampleWinnersAndRunners();
    for (let seed = 1; seed <= 200; seed++) {
      const ties = drawRoundOf16(winners, runnersUp, groupOf, countryOf, mulberry32(seed));
      expect(ties).toHaveLength(8);
      expect(new Set(ties.map((t) => t.second))).toEqual(new Set(winners));
      expect(new Set(ties.map((t) => t.first))).toEqual(new Set(runnersUp));
      for (const t of ties) {
        expect(groupOf[t.first]).not.toBe(groupOf[t.second]);
      }
    }
  });

  test("avoids same-country pairings when a clash-free pairing exists", () => {
    const { winners, runnersUp, groupOf, countryOf } = sampleWinnersAndRunners();
    for (let seed = 1; seed <= 50; seed++) {
      const ties = drawRoundOf16(winners, runnersUp, groupOf, countryOf, mulberry32(seed));
      expect(countClashes(ties, countryOf)).toBe(0);
    }
  });

  test("deterministic for a given seed", () => {
    const { winners, runnersUp, groupOf, countryOf } = sampleWinnersAndRunners();
    const a = drawRoundOf16(winners, runnersUp, groupOf, countryOf, mulberry32(42));
    const b = drawRoundOf16(winners, runnersUp, groupOf, countryOf, mulberry32(42));
    expect(a).toEqual(b);
  });

  test("forced-clash case: minimises clashes rather than defaulting to the worst case", () => {
    // 7 winners are "A", 1 is "B"; all 8 runners-up are "A". Groups are entirely disjoint between
    // winners and runners-up, so the group rule never binds and the country rule is the only
    // constraint in play. The "B" winner can always find a non-clashing "A" runner-up (different
    // country), but the remaining 7 "A" winners have nothing but "A" runners-up left — every valid
    // assignment has exactly 7 clashes, never 8 and never fewer.
    const winners = Array.from({ length: 8 }, (_, i) => `w${i}`);
    const runnersUp = Array.from({ length: 8 }, (_, i) => `r${i}`);
    const groupOf: Record<string, string> = {};
    const countryOf: Record<string, string> = {};
    winners.forEach((w, i) => {
      groupOf[w] = `WG${i}`;
      countryOf[w] = i === 0 ? "B" : "A";
    });
    runnersUp.forEach((r, i) => {
      groupOf[r] = `RG${i}`;
      countryOf[r] = "A";
    });

    for (const seed of [1, 2, 3, 99]) {
      const ties = drawRoundOf16(winners, runnersUp, groupOf, countryOf, mulberry32(seed));
      expect(ties).toHaveLength(8);
      expect(countClashes(ties, countryOf)).toBe(7);
      const bTie = ties.find((t) => t.second === "w0")!;
      expect(countryOf[bTie.first]).toBe("A"); // the B winner never clashes
    }
  });

  test("wrong counts throw", () => {
    const { winners, runnersUp, groupOf, countryOf } = sampleWinnersAndRunners();
    expect(() => drawRoundOf16(winners.slice(0, 7), runnersUp, groupOf, countryOf, mulberry32(1))).toThrow();
    expect(() => drawRoundOf16(winners, runnersUp.slice(0, 7), groupOf, countryOf, mulberry32(1))).toThrow();
  });
});

describe("drawFree", () => {
  test("pairs every id exactly once", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `c${i}`);
    const ties = drawFree(ids, mulberry32(3));
    expect(ties).toHaveLength(4);
    const used = ties.flatMap((t) => [t.first, t.second]);
    expect(new Set(used)).toEqual(new Set(ids));
    expect(used).toHaveLength(8);
  });

  test("deterministic for a given seed", () => {
    const ids = Array.from({ length: 4 }, (_, i) => `c${i}`);
    expect(drawFree(ids, mulberry32(11))).toEqual(drawFree(ids, mulberry32(11)));
  });

  test("odd or empty count throws", () => {
    expect(() => drawFree(["a", "b", "c"], mulberry32(1))).toThrow();
    expect(() => drawFree([], mulberry32(1))).toThrow();
  });
});

describe("twoLegFixtures", () => {
  const ties = [
    { first: "a", second: "b" },
    { first: "c", second: "d" },
  ];

  test("two-legged stage: leg 1 home=first, leg 2 home=second, shared tieId, leg 2 is knockout", () => {
    const fx = twoLegFixtures("ucl", 2027, "r16", ties, [7, 8], ["2027-02-10", "2027-02-17"]);
    expect(fx).toHaveLength(4);

    const [leg1a, leg2a, leg1b, leg2b] = fx;
    expect(leg1a).toMatchObject({
      id: "ucl_2027_r7_1", date: "2027-02-10", competition: "ucl", round: 7,
      home: "a", away: "b", played: false, result: null, leg: 1,
    });
    expect(leg1a!.knockout).toBeUndefined();
    expect(leg1a!.neutral).toBeUndefined();

    expect(leg2a).toMatchObject({
      id: "ucl_2027_r8_1", date: "2027-02-17", competition: "ucl", round: 8,
      home: "b", away: "a", played: false, result: null, leg: 2, knockout: true,
    });
    expect(leg2a!.tieId).toBe(leg1a!.tieId);
    expect(leg2a!.aggregate).toBeUndefined();

    expect(leg1b!.tieId).toBe("ucl_2027_r16_2");
    expect(leg2b!.tieId).toBe("ucl_2027_r16_2");
    expect(leg1b!.tieId).not.toBe(leg1a!.tieId);
    expect(leg1b).toMatchObject({ id: "ucl_2027_r7_2", home: "c", away: "d" });
    expect(leg2b).toMatchObject({ id: "ucl_2027_r8_2", home: "d", away: "c" });
  });

  test("startIndex offsets both the fixture id counter and the tieId counter", () => {
    const fx = twoLegFixtures("ucl", 2027, "qf", [ties[0]!], [9, 10], ["2027-03-10", "2027-03-17"], 3);
    expect(fx[0]!.id).toBe("ucl_2027_r9_3");
    expect(fx[1]!.id).toBe("ucl_2027_r10_3");
    expect(fx[0]!.tieId).toBe("ucl_2027_qf_3");
  });

  test("final: single round, single neutral knockout fixture per tie, no leg/tieId", () => {
    const fx = twoLegFixtures("ucl", 2027, "final", [{ first: "e", second: "f" }], [13], ["2027-05-20"]);
    expect(fx).toHaveLength(1);
    expect(fx[0]).toMatchObject({
      id: "ucl_2027_r13_1", date: "2027-05-20", competition: "ucl", round: 13,
      home: "e", away: "f", played: false, result: null, knockout: true, neutral: true,
    });
    expect(fx[0]!.leg).toBeUndefined();
    expect(fx[0]!.tieId).toBeUndefined();
  });

  test("mismatched rounds/dates length throws", () => {
    expect(() => twoLegFixtures("ucl", 2027, "r16", ties, [7, 8], ["2027-02-10"])).toThrow();
  });

  test("rounds length other than 1 or 2 throws", () => {
    expect(() => twoLegFixtures("ucl", 2027, "r16", ties, [7, 8, 9], ["a", "b", "c"])).toThrow();
  });
});

function played(home: string, away: string, h: number, a: number, extra?: Partial<Fixture>): Fixture {
  return {
    id: `${home}-${away}`,
    date: "2027-03-01",
    competition: "ucl",
    round: 7,
    home,
    away,
    played: true,
    result: { home: h, away: a },
    ...extra,
  };
}

describe("withAggregate", () => {
  test("attributes leg-1 goals from leg 2's home/away point of view", () => {
    const leg1 = played("x", "y", 1, 2); // x 1-2 y
    const leg2Base = played("y", "x", 0, 0, { leg: 2, knockout: true, played: false, result: null });
    const leg2 = withAggregate(leg2Base, leg1);
    // y (leg2 home) scored 2 in leg1 (as away side); x (leg2 away) scored 1 in leg1 (as home side).
    expect(leg2.aggregate).toEqual({ home: 2, away: 1 });
    // Original fields preserved.
    expect(leg2.home).toBe("y");
    expect(leg2.away).toBe("x");
  });

  test("throws when leg1 is not played", () => {
    const leg1 = { ...played("x", "y", 1, 2), played: false, result: null };
    const leg2 = played("y", "x", 0, 0);
    expect(() => withAggregate(leg2, leg1)).toThrow();
  });
});

describe("tieWinner", () => {
  test("decided on aggregate from normal + extra time (result already includes ET goals)", () => {
    const leg1 = played("x", "y", 1, 0); // x 1-0 y
    // 90' of leg 2 finished y 1-0 x (aggregate 1-1, level) but extra time added one more for y.
    const leg2 = played("y", "x", 2, 0, {
      leg: 2,
      knockout: true,
      decider: { extraTime: { home: 1, away: 0 } },
    });
    expect(tieWinner(leg1, leg2)).toBe("y");
  });

  test("level on aggregate is decided by leg 2's penalties", () => {
    const leg1 = played("x", "y", 1, 0);
    const leg2 = played("y", "x", 1, 0, {
      leg: 2,
      knockout: true,
      decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 3, away: 4 } },
    });
    // aggregate: y (leg2 home) = 0 + 1 = 1, x (leg2 away) = 1 + 0 = 1 -- level.
    expect(tieWinner(leg1, leg2)).toBe("x"); // penalties: home(y)=3 < away(x)=4 -> x wins
  });

  test("either leg unplayed returns null", () => {
    const leg1 = played("x", "y", 1, 0);
    const leg2Unplayed = { ...played("y", "x", 0, 0), played: false, result: null };
    expect(tieWinner(leg1, leg2Unplayed)).toBeNull();
    expect(tieWinner({ ...leg1, played: false, result: null }, played("y", "x", 0, 0))).toBeNull();
  });

  test("level aggregate with no penalties recorded returns null", () => {
    const leg1 = played("x", "y", 1, 0);
    const leg2 = played("y", "x", 1, 0, { leg: 2, knockout: true });
    expect(tieWinner(leg1, leg2)).toBeNull();
  });
});

describe("finalWinner", () => {
  test("score decides when not level", () => {
    const f = played("e", "f", 2, 1, { knockout: true, neutral: true });
    expect(finalWinner(f)).toBe("e");
  });

  test("penalties decide when level", () => {
    const f = played("e", "f", 1, 1, {
      knockout: true,
      neutral: true,
      decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 5, away: 4 } },
    });
    expect(finalWinner(f)).toBe("e");
  });

  test("unplayed is null", () => {
    const f = { ...played("e", "f", 0, 0, { knockout: true, neutral: true }), played: false, result: null };
    expect(finalWinner(f)).toBeNull();
  });
});
