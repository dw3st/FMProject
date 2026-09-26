import { describe, expect, test } from "bun:test";
import { drawTies } from "@/Domain/cups/cupDraw";
import { mulberry32 } from "@/Domain/rng";

const clubs = (n: number, tier = (i: number) => 1 + (i % 3)) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, tier: tier(i) }));

describe("drawTies", () => {
  test("pairs everyone exactly once", () => {
    const ties = drawTies(clubs(16), mulberry32(1), false);
    expect(ties).toHaveLength(8);
    const ids = ties.flatMap((t) => [t.home, t.away]).sort();
    expect(ids).toEqual(clubs(16).map((c) => c.id).sort());
  });
  test("the lower-tier club hosts", () => {
    const ties = drawTies(clubs(32), mulberry32(2), false);
    const tier = new Map(clubs(32).map((c) => [c.id, c.tier]));
    for (const t of ties) expect(tier.get(t.home)!).toBeGreaterThanOrEqual(tier.get(t.away)!);
  });
  test("deterministic for the same rng seed", () => {
    expect(drawTies(clubs(8), mulberry32(9), false)).toEqual(drawTies(clubs(8), mulberry32(9), false));
  });
  test("neutral final flag", () => {
    const [t] = drawTies(clubs(2), mulberry32(3), true);
    expect(t!.neutral).toBe(true);
  });
  test("odd count throws", () => {
    expect(() => drawTies(clubs(3), mulberry32(1), false)).toThrow();
  });
});
