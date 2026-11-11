import { describe, expect, test } from "bun:test";
import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import { drawTier, legendTier, spinLegend, spinReel, LEGEND_TIERS } from "@/Domain/achievements/legendSpin";
import { realLegendPool } from "@/Domain/legends/realLegends";
import { mulberry32 } from "@/Domain/rng";

describe("legend roulette (8.9.34)", () => {
  const pool = realLegendPool([]);

  test("every tier has legends and the famous ones are on top", () => {
    for (const tier of LEGEND_TIERS) expect(pool.some((r) => legendTier(r) === tier)).toBe(true);
    expect(legendTier(pool.find((r) => r.name === "Pelé")!)).toBe("super");
  });

  test("the draw follows the odds", () => {
    const rng = mulberry32(7);
    const n = 20000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) { const t = drawTier(rng); count[t] = (count[t] ?? 0) + 1; }
    for (const tier of LEGEND_TIERS) expect(Math.abs(count[tier]! / n - A.LEGEND_SPIN.ODDS[tier])).toBeLessThan(0.015);
  });

  test("a spin returns an available legend of the tier, falling to another tier when empty", () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const s = spinLegend(pool, rng)!;
      expect(legendTier(s.retired)).toBe(s.tier);
      expect(s.retired.legendBy).toBeUndefined();
    }
    const onlySuper = pool.filter((r) => legendTier(r) === "super").slice(0, 2);
    const s = spinLegend(onlySuper, () => 0)!; // draws "normal", only super left
    expect(s.tier).toBe("super");
    const taken = onlySuper.map((r) => ({ ...r, legendBy: "seat" }));
    expect(spinLegend(taken, () => 0)).toBeNull();
  });

  test("the reel has the winner at its place", () => {
    const winner = pool[5]!;
    const reel = spinReel(pool, winner, mulberry32(1));
    expect(reel.length).toBe(A.LEGEND_SPIN.REEL);
    expect(reel[A.LEGEND_SPIN.REEL_AT]!.id).toBe(winner.id);
  });
});
