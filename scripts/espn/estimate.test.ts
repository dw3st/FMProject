import { describe, expect, test } from "bun:test";
import { ageAdjust, estimateStats, fillSquad, lineMedians, makePlayer, trimSquad } from "@/../scripts/espn/estimate";
import type { PlayerStatsRecord, RosterPlayer } from "@/types/playerTypes";

const st = (v: number): PlayerStatsRecord => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
  pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});
const pl = (id: string, role: string, v: number, age = 25): RosterPlayer => ({
  id, name: id, age, squadId: "s", preferredFoot: "right", positions: [role], stats: st(v),
  profile: { archetype: "x", summary: "x" },
});
const overall = (p: RosterPlayer) => p.stats.passing;

describe("lineMedians", () => {
  test("per-attribute median by line", () => {
    const m = lineMedians([pl("a", "Defender", 2), pl("b", "Defender", 4), pl("c", "Defender", 9), pl("d", "Forward", 6)]);
    expect(m.Defender!.tackling).toBe(4);
    expect(m.Forward!.passing).toBe(6);
    expect(m.GK).toBeUndefined();
  });
});

describe("ageAdjust", () => {
  test("bands", () => {
    expect(ageAdjust(19)).toBe(-1);
    expect(ageAdjust(22)).toBe(-0.5);
    expect(ageAdjust(27)).toBe(0);
    expect(ageAdjust(33)).toBe(-0.3);
  });
});

describe("estimateStats", () => {
  test("deterministic, near the base, within 0..10", () => {
    const a = estimateStats("es_1", 27, st(5), 0);
    expect(a).toEqual(estimateStats("es_1", 27, st(5), 0));
    for (const v of Object.values(a)) { expect(v).toBeGreaterThanOrEqual(4); expect(v).toBeLessThanOrEqual(6); }
    const changed = Object.values(a).filter((v) => v !== 5).length;
    expect(changed).toBeLessThanOrEqual(4);
  });
  test("young players come in lower", () => {
    const young = estimateStats("es_2", 18, st(5), 0);
    expect(Object.values(young).reduce((s, v) => s + v, 0)).toBeLessThan(65);
  });
});

describe("estimateStats — unbiased rounding", () => {
  const N = 400;
  const ids = Array.from({ length: N }, (_, i) => `es_round_${i}`);
  const meanAll = (age: number, shift: number) => {
    let sum = 0;
    let count = 0;
    for (const id of ids) {
      for (const v of Object.values(estimateStats(id, age, st(5), shift))) { sum += v; count++; }
    }
    return sum / count;
  };

  test("age 22 averages ~0.5 below age 27 (fractional ageAdjust must move the mean)", () => {
    const diff = meanAll(27, 0) - meanAll(22, 0);
    expect(diff).toBeGreaterThan(0.35);
    expect(diff).toBeLessThan(0.65);
  });

  test("age 33 averages ~0.3 below age 27", () => {
    const diff = meanAll(27, 0) - meanAll(33, 0);
    expect(diff).toBeGreaterThan(0.15);
    expect(diff).toBeLessThan(0.45);
  });

  test("shift -0.3 averages ~0.3 below shift 0", () => {
    const diff = meanAll(27, 0) - meanAll(27, -0.3);
    expect(diff).toBeGreaterThan(0.15);
    expect(diff).toBeLessThan(0.45);
  });

  test("every attribute stays within base ± 2 at age 27 shift 0", () => {
    for (const id of ids) {
      for (const v of Object.values(estimateStats(id, 27, st(5), 0))) {
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("makePlayer", () => {
  test("main-role position, foot and profile", () => {
    const p = makePlayer({ id: "es_9", name: "Novo", age: 24, role: "Midfielder", squadId: "s", nationality: "Brazil", stats: st(5) }, 5);
    expect(p.positions).toEqual(["Midfielder"]);
    expect(["left", "right"]).toContain(p.preferredFoot);
    expect(p.profile.summary).toMatch(/midfielder/);
    expect(p.nationality).toBe("Brazil");
  });

  test("adjective thresholds match the world's overall scale (median ~3.24, p95 ~4.84)", () => {
    const solid = makePlayer({ id: "es_10", name: "X", age: 24, role: "Forward", squadId: "s", nationality: null, stats: st(5) }, 4);
    expect(solid.profile.summary).toMatch(/^Solid/);
    const developing = makePlayer({ id: "es_11", name: "Y", age: 24, role: "Forward", squadId: "s", nationality: null, stats: st(5) }, 2);
    expect(developing.profile.summary).toMatch(/^Developing/);
  });
});

describe("trimSquad", () => {
  test("keeps role minimums, then the best, up to max", () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => pl(`g${i}`, "GK", 1 + i)),
      ...Array.from({ length: 30 }, (_, i) => pl(`f${i}`, "Forward", 9)),
    ];
    const out = trimSquad(players, 30, overall);
    expect(out).toHaveLength(30);
    expect(out.filter((p) => p.positions[0] === "GK").map((p) => p.id).sort()).toEqual(["g2", "g3", "g4"]);
  });

  test("returns a copy (not the same reference) when no trimming is needed", () => {
    const players = [pl("a", "GK", 5)];
    const out = trimSquad(players, 30, overall);
    expect(out).not.toBe(players);
    expect(out).toEqual(players);
  });
});

describe("fillSquad", () => {
  test("tops up every line minimum and the squad minimum with youth", () => {
    const out = fillSquad("s", [pl("a", "Forward", 5)], { first: ["Ana"], last: ["Lima"] }, "Brazil", () => st(4), overall);
    const count = (r: string) => out.filter((p) => p.positions[0] === r).length;
    expect(count("GK")).toBe(3);
    expect(count("Defender")).toBeGreaterThanOrEqual(7);
    expect(count("Midfielder")).toBeGreaterThanOrEqual(7);
    expect(count("Forward")).toBeGreaterThanOrEqual(4);
    expect(out.length).toBeGreaterThanOrEqual(18);
    const youth = out.filter((p) => p.id.startsWith("es_youth_s_"));
    expect(youth.every((p) => p.age >= 17 && p.age <= 19)).toBe(true);
    expect(new Set(out.map((p) => p.id)).size).toBe(out.length);
  });

  test("deterministic — same inputs produce identical output", () => {
    const run = () => fillSquad("s", [pl("a", "Forward", 5)], { first: ["Ana"], last: ["Lima"] }, "Brazil", () => st(4), overall);
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
