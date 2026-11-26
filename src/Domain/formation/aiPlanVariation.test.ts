import { describe, expect, test } from "bun:test";
import { aiPlanVariation, variedStyle, type AiPlanInput } from "@/Domain/formation/aiPlanVariation";
import { AI_VARIATION } from "@/Domain/formation/aiFormationConfig";
import type { AiFormationRecord } from "@/types/playerTypes";

const record: AiFormationRecord = { id: "4-3-3", season: "2026", roster: 1, level: 4, second: "4-2-3-1" };
const input = (i: number, over: Partial<AiPlanInput> = {}): AiPlanInput => ({
  fixtureId: `f${i}`, aiSquadId: "c1", tier: "HIGH", record, matchdayFormation: "4-3-3", opponentLevel: 4, ...over,
});

describe("aiPlanVariation", () => {
  test("deterministic per fixture and club", () => {
    expect(aiPlanVariation(input(7))).toEqual(aiPlanVariation(input(7)));
  });

  test("shares follow the tier", () => {
    for (const tier of ["LOW", "MEDIUM", "HIGH"] as const) {
      const n = 4000;
      let formation = 0, style = 0;
      for (let i = 0; i < n; i++) {
        const v = aiPlanVariation(input(i, { tier }));
        if (v.kind === "formation") formation++;
        if (v.kind === "style") style++;
      }
      expect(Math.abs(formation / n - AI_VARIATION.CHANCE[tier].formation)).toBeLessThan(0.025);
      expect(Math.abs(style / n - AI_VARIATION.CHANCE[tier].style)).toBeLessThan(0.025);
    }
  });

  test("a formation change plays the second formation; none without one", () => {
    for (let i = 0; i < 300; i++) {
      const v = aiPlanVariation(input(i));
      if (v.kind === "formation") expect(v.formation).toBe("4-2-3-1");
      else expect(v.formation).toBe("4-3-3");
      const bare = aiPlanVariation(input(i, { record: { ...record, second: "" } }));
      expect(bare.kind).not.toBe("formation");
    }
  });

  test("the style follows the strength gap", () => {
    expect(variedStyle("k", 3.5, 4)).toBe(AI_VARIATION.UNDERDOG_STYLE);
    for (let i = 0; i < 50; i++) {
      expect(AI_VARIATION.FAVOURITE_STYLES).toContain(variedStyle(`k${i}`, 4.5, 4));
      expect(AI_VARIATION.CLOSE_STYLES).toContain(variedStyle(`k${i}`, 4, 4));
    }
  });
});
