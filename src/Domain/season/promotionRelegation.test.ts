import { describe, expect, spyOn, test } from "bun:test";
import { countryReadyForTransition, planPromotionRelegation } from "@/Domain/season/promotionRelegation";
import type { CountryPyramid } from "@/types/pyramidTypes";
import type { StandingRow } from "@/types/playerTypes";

/** Table of `n` clubs `${prefix}1..${prefix}n`, already in final order (index 0 = champion). */
const table = (prefix: string, n: number): StandingRow[] =>
  Array.from({ length: n }, (_, i) => ({
    squadId: `${prefix}${i + 1}`, name: `${prefix}${i + 1}`, colors: ["#000", "#fff"],
    mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [],
  }) as StandingRow);

const g = (leagueSlug: string, promote: number, relegate: number) => ({ leagueSlug, promote, relegate });

describe("planPromotionRelegation", () => {
  test("par simples 3/3: ids e destinos certos", () => {
    const pyramid: CountryPyramid = { country: "England", levels: [
      { tier: 1, groups: [g("pl", 0, 3)] }, { tier: 2, groups: [g("ch", 3, 0)] },
    ] };
    const moves = planPromotionRelegation(pyramid, { pl: table("pl", 20), ch: table("ch", 19) });
    expect(moves).toEqual([
      { squadId: "pl18", from: "pl", to: "ch", kind: "relegated" },
      { squadId: "pl19", from: "pl", to: "ch", kind: "relegated" },
      { squadId: "pl20", from: "pl", to: "ch", kind: "relegated" },
      { squadId: "ch1", from: "ch", to: "pl", kind: "promoted" },
      { squadId: "ch2", from: "ch", to: "pl", kind: "promoted" },
      { squadId: "ch3", from: "ch", to: "pl", kind: "promoted" },
    ]);
  });

  test("Itália: 3 rebaixados da B vão um para cada grupo C; campeões dos grupos C sobem", () => {
    const pyramid: CountryPyramid = { country: "Italy", levels: [
      { tier: 1, groups: [g("sa", 0, 3)] },
      { tier: 2, groups: [g("sb", 3, 3)] },
      { tier: 3, groups: [g("sc_a", 1, 0), g("sc_b", 1, 0), g("sc_c", 1, 0)] },
    ] };
    const moves = planPromotionRelegation(pyramid, {
      sa: table("a", 20), sb: table("b", 20), sc_a: table("ca", 19), sc_b: table("cb", 18), sc_c: table("cc", 19),
    });
    const down = moves.filter((m) => m.from === "sb" && m.kind === "relegated");
    expect(down.map((m) => m.squadId)).toEqual(["b18", "b19", "b20"]);
    expect(down.map((m) => m.to).sort()).toEqual(["sc_a", "sc_b", "sc_c"]);
    // Smallest group (sc_b, 18 − 1 promoted) takes the first relegated club.
    expect(down[0]!.to).toBe("sc_b");
    const up = moves.filter((m) => m.kind === "promoted" && m.to === "sb");
    expect(up.map((m) => m.squadId)).toEqual(["ca1", "cb1", "cc1"]);
    expect(moves.filter((m) => m.from === "sa").map((m) => m.to)).toEqual(["sb", "sb", "sb"]);
    expect(moves.filter((m) => m.from === "sb" && m.kind === "promoted").map((m) => m.squadId)).toEqual(["b1", "b2", "b3"]);
  });

  test("Rússia: distribuição balanceada entre grupos", () => {
    const pyramid: CountryPyramid = { country: "Russia", levels: [
      { tier: 1, groups: [g("rpl", 0, 3)] },
      { tier: 2, groups: [g("r1", 3, 2)] },
      { tier: 3, groups: [g("a_gold", 1, 2), g("a_silver", 1, 1)] },
      { tier: 4, groups: [g("b_2", 1, 0), g("b_3", 1, 0), g("b_4", 1, 0)] },
    ] };
    const sizes = { rpl: 16, r1: 18, a_gold: 10, a_silver: 8, b_2: 10, b_3: 9, b_4: 8 };
    const standings = Object.fromEntries(Object.entries(sizes).map(([s, n]) => [s, table(`${s}_`, n)]));
    const moves = planPromotionRelegation(pyramid, standings);

    // Final sizes after every move.
    const final: Record<string, number> = { ...sizes };
    for (const m of moves) { final[m.from]!--; final[m.to]!++; }
    // Coherent pyramid → every group ends the transition with the size it started with.
    expect(final).toEqual(sizes);

    // 1ª relegates 2 → one to each level-3 group.
    expect(moves.filter((m) => m.from === "r1" && m.kind === "relegated").map((m) => m.to).sort()).toEqual(["a_gold", "a_silver"]);
    // Level 3 relegates 3 → one to each level-4 group.
    const toL4 = moves.filter((m) => m.kind === "relegated" && m.to.startsWith("b_"));
    expect(toL4.map((m) => m.squadId)).toEqual(["a_gold_9", "a_gold_10", "a_silver_8"]);
    expect(toL4.map((m) => m.to).sort()).toEqual(["b_2", "b_3", "b_4"]);
    // Each club moves at most once.
    expect(new Set(moves.map((m) => m.squadId)).size).toBe(moves.length);
  });

  test("liga sem standings não gera mudança nem recebe clubes", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const pyramid: CountryPyramid = { country: "Italy", levels: [
      { tier: 1, groups: [g("sa", 0, 3)] },
      { tier: 2, groups: [g("sb", 3, 3)] },
      { tier: 3, groups: [g("sc_a", 1, 0), g("sc_b", 1, 0), g("sc_c", 1, 0)] },
    ] };
    const moves = planPromotionRelegation(pyramid, {
      sa: table("a", 20), sb: table("b", 20), sc_a: table("ca", 19), sc_b: [], sc_c: table("cc", 19),
    });
    expect(moves.some((m) => m.from === "sc_b" || m.to === "sc_b")).toBe(false);
    expect(moves.filter((m) => m.from === "sa")).toHaveLength(3);
    expect(warn).toHaveBeenCalled();

    // Only lower group without table → nothing crosses that boundary.
    const pair: CountryPyramid = { country: "X", levels: [
      { tier: 1, groups: [g("x1", 0, 2)] }, { tier: 2, groups: [g("x2", 2, 0)] },
    ] };
    expect(planPromotionRelegation(pair, { x1: table("x", 12) })).toEqual([]);
    warn.mockRestore();
  });

  test("clube que sobe e cai na mesma virada lança erro", () => {
    const pyramid: CountryPyramid = { country: "Z", levels: [
      { tier: 1, groups: [g("z1", 0, 1)] }, { tier: 2, groups: [g("z2", 2, 2)] }, { tier: 3, groups: [g("z3", 1, 0)] },
    ] };
    expect(() => planPromotionRelegation(pyramid, { z1: table("a", 10), z2: table("b", 3), z3: table("c", 10) })).toThrow();
  });
});

describe("countryReadyForTransition", () => {
  const active = [
    { leagueSlug: "brazil_serie_a", end: "2026-12-07" },
    { leagueSlug: "brazil_serie_b", end: "2026-11-30" },
    { leagueSlug: "premier_league", end: "2027-05-17" },
  ];
  const brazil = ["brazil_serie_a", "brazil_serie_b"];

  test("uma liga do país ainda não terminou → false", () => {
    // 11-30 played: B is over (next day 12-01 > 11-30) but A ends 12-07.
    expect(countryReadyForTransition(brazil, active, "2026-11-30")).toBe(false);
    expect(countryReadyForTransition(brazil, active, "2026-12-06")).toBe(false);
  });

  test("último dia da última liga jogado → true (mesma condição do advanceDay: nextDate > end)", () => {
    expect(countryReadyForTransition(brazil, active, "2026-12-07")).toBe(true);
    expect(countryReadyForTransition(["brazil_serie_b"], active, "2026-11-30")).toBe(true);
    expect(countryReadyForTransition(["brazil_serie_b"], active, "2026-11-29")).toBe(false);
  });

  test("ligas fora de activeLeagues não travam o país; nenhuma ativa → false", () => {
    expect(countryReadyForTransition([...brazil, "brazil_serie_c"], active, "2026-12-07")).toBe(true);
    expect(countryReadyForTransition(["nowhere"], active, "2026-12-07")).toBe(false);
  });
});
