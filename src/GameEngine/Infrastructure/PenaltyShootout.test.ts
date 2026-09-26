import { describe, expect, test } from "bun:test";
import { mulberry32 } from "@/Domain/rng";
import {
  penaltyChance,
  resolvePenaltyShootout,
  type PenaltySide,
} from "@/GameEngine/Infrastructure/PenaltyShootout";

function side(prefix: string, accuracy: number, keeperSkill: number): PenaltySide<string> {
  const takers = Array.from({ length: 10 }, (_, i) => ({ id: `${prefix}${i}`, accuracy, isGK: false }));
  takers.push({ id: `${prefix}gk`, accuracy: 0, isGK: true });
  return { takers, keeper: { id: `${prefix}gk`, reflex: keeperSkill, diving: keeperSkill } };
}

describe("penaltyChance", () => {
  test("average shooter vs average keeper is ~75%", () => {
    const c = penaltyChance(0.5, { id: "k", reflex: 0.5, diving: 0.5 });
    expect(c).toBeGreaterThan(0.72);
    expect(c).toBeLessThan(0.78);
  });
  test("is clamped", () => {
    expect(penaltyChance(0.95, null)).toBeLessThanOrEqual(0.92);
    expect(penaltyChance(0, { id: "k", reflex: 1, diving: 1 })).toBeGreaterThanOrEqual(0.55);
  });
});

describe("resolvePenaltyShootout", () => {
  test("always produces a winner and a non-tied score", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), rng);
      expect(r.score.A).not.toBe(r.score.B);
      expect(r.winner).toBe(r.score.A > r.score.B ? "A" : "B");
      // Invariant: score always equals the scored-kick counts per team.
      const a = r.kicks.filter((k) => k.team === "A" && k.scored).length;
      const b = r.kicks.filter((k) => k.team === "B" && k.scored).length;
      expect({ A: a, B: b }).toEqual(r.score);
    }
  });

  test("kicks alternate A, B, A, B… and the score matches the kicks", () => {
    const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), mulberry32(3));
    r.kicks.forEach((k, i) => expect(k.team).toBe(i % 2 === 0 ? "A" : "B"));
    const a = r.kicks.filter((k) => k.team === "A" && k.scored).length;
    const b = r.kicks.filter((k) => k.team === "B" && k.scored).length;
    expect({ A: a, B: b }).toEqual(r.score);
  });

  test("stops early once a side can no longer catch up", () => {
    // One rng() call per kick, kicks alternate A, B…: A always scores (0), B always misses (0.99).
    // After A's 3rd and B's 3rd kick it is 3–0 with B having 2 left: 0 + 2 < 3 → decided at 6 kicks.
    let n = 0;
    const aScoresBMisses = () => (n++ % 2 === 0 ? 0 : 0.99);
    const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), aScoresBMisses);
    expect(r.score).toEqual({ A: 3, B: 0 });
    expect(r.kicks.length).toBe(6);
  });

  test("best finisher kicks first, keeper kicks last", () => {
    const s: PenaltySide<string> = {
      takers: [
        { id: "gk", accuracy: 0, isGK: true },
        { id: "low", accuracy: 0.2, isGK: false },
        { id: "high", accuracy: 0.9, isGK: false },
      ],
      keeper: { id: "gk", reflex: 0.5, diving: 0.5 },
    };
    const r = resolvePenaltyShootout(s, s, mulberry32(11));
    const aTakers = r.kicks.filter((k) => k.team === "A").map((k) => k.takerId);
    expect(aTakers.slice(0, 3)).toEqual(["high", "low", "gk"]);
  });

  test("average sides convert ~75% over many shootouts", () => {
    const rng = mulberry32(42);
    let taken = 0, scored = 0;
    for (let i = 0; i < 10_000; i++) {
      const r = resolvePenaltyShootout(side("a", 0.5, 0.5), side("b", 0.5, 0.5), rng);
      taken += r.kicks.length;
      scored += r.kicks.filter((k) => k.scored).length;
    }
    const rate = scored / taken;
    expect(rate).toBeGreaterThan(0.70);
    expect(rate).toBeLessThan(0.80);
  });

  test("a side with no takers loses on a synthetic 1-0 kick", () => {
    const r = resolvePenaltyShootout(side("a", 0.5, 0.5), { takers: [], keeper: null }, mulberry32(1));
    expect(r.winner).toBe("A");
    expect(r.score).toEqual({ A: 1, B: 0 });
    expect(r.kicks).toHaveLength(1);
    expect(r.kicks[0]).toMatchObject({ team: "A", scored: true, chance: 1, keeperId: null });
  });

  test("both sides with no takers still returns a non-tied score (documented no-kicks exception)", () => {
    const r = resolvePenaltyShootout({ takers: [], keeper: null }, { takers: [], keeper: null }, mulberry32(1));
    expect(r).toEqual({ kicks: [], score: { A: 1, B: 0 }, winner: "A" });
  });

  test("a side with no takers but a keeper still lends its keeper id to the opponent's synthetic kick", () => {
    // Empty `takers` with a non-null `keeper` is structurally unusual (the shape allows it —
    // `takers` and `keeper` are independent fields) but must still resolve keeperId from the
    // loser's keeper, not force it to null.
    const winnerSide = side("a", 0.5, 0.5);
    const loserSide: PenaltySide<string> = { takers: [], keeper: { id: "b-lonegk", reflex: 0.6, diving: 0.6 } };
    const r = resolvePenaltyShootout(winnerSide, loserSide, mulberry32(1));
    expect(r.winner).toBe("A");
    expect(r.score).toEqual({ A: 1, B: 0 });
    expect(r.kicks).toHaveLength(1);
    expect(r.kicks[0]).toMatchObject({ team: "A", scored: true, chance: 1, keeperId: "b-lonegk" });
  });
});
