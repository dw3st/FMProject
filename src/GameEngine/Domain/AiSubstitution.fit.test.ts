import { describe, expect, test } from "bun:test";
import { findBestBenchForRole } from "@/GameEngine/Domain/AiSubstitution";
import type { GamePlayer } from "@/GameEngine/types";

function bench(id: number, role: string, speed: number, apt?: "natural" | "unsuitable"): GamePlayer {
  return {
    id, role, energy: 100,
    baseStats: { withBall: { speed, passingSkill: 0.5 }, withoutBall: { tackleChance: 0.5 } },
    fit: apt ? { stats: {} as never, aptitudes: { LB: apt } } : undefined,
  } as unknown as GamePlayer;
}

describe("findBestBenchForRole — position fit", () => {
  test("a natural wins over a stronger but unsuitable bench player of the same line", () => {
    const natural = bench(1, "CB", 0.6, "natural");
    const unsuitable = bench(2, "CB", 0.8, "unsuitable");
    expect(findBestBenchForRole([unsuitable, natural], "LB")?.id).toBe(1);
  });
});
