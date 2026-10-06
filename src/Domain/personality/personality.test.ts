import { describe, expect, test } from "bun:test";
import {
  ambitionDemandMult, compatriotMult, generatePersonality, isLoyal, listedUnaskedMult, loyaltyRenewalMult,
  minutesDeficitMult, moraleVolatility, obscurePersonality, personalDpMult, personalityOf, professionalismDecayMult,
  professionalismDpMult, promiseBrokenMult, refusesSmallerClub, seasonsAtClub, sellPush, shieldedMoraleDpMult,
  smallerClubMult, summaryOf, temperamentFoulMult, temperamentRedMult, temperamentYellowMult, tierStepsDown,
  traitBand, traitT, transferRequestBelow, wantsMove, PERSONALITY_TRAITS,
} from "@/Domain/personality/personality";
import type { Personality } from "@/types/personalityTypes";

const neutral: Personality = { ambition: 10.5, loyalty: 10.5, professionalism: 10.5, temperament: 10.5 };
const withP = (p: Partial<Personality>) => ({ id: "x", personality: { ...neutral, ...p } });

describe("generation", () => {
  test("deterministic, 1..20, mean ~10,5", () => {
    expect(generatePersonality("player_1")).toEqual(generatePersonality("player_1"));
    const sums: Record<string, number> = { ambition: 0, loyalty: 0, professionalism: 0, temperament: 0 };
    const n = 20_000;
    for (let i = 0; i < n; i++) {
      const p = generatePersonality(`id_${i}`);
      for (const k of PERSONALITY_TRAITS) {
        expect(p[k]).toBeGreaterThanOrEqual(1);
        expect(p[k]).toBeLessThanOrEqual(20);
        expect(Number.isInteger(p[k])).toBe(true);
        sums[k] = (sums[k] ?? 0) + p[k];
      }
    }
    for (const k of PERSONALITY_TRAITS) expect(Math.abs(sums[k]! / n - 10.5)).toBeLessThan(0.2);
  });

  test("loyalty (ambition mix) is unbiased: world mean ~10,5", () => {
    let sum = 0;
    const n = 40_000;
    for (let i = 0; i < n; i++) sum += generatePersonality(`loyal_${i}`).loyalty;
    expect(Math.abs(sum / n - 10.5)).toBeLessThan(0.05);
  });

  test("override wins; reborn inherits the original", () => {
    expect(personalityOf(withP({ ambition: 3 })).ambition).toBe(3);
    expect(personalityOf({ id: "reborn_player_9_2030", reborn: { fromId: "player_9" } })).toEqual(personalityOf({ id: "player_9" }));
  });
});

describe("bands and summary", () => {
  test("bands", () => {
    expect(traitBand(1)).toBe("very_low");
    expect(traitBand(4)).toBe("very_low");
    expect(traitBand(5)).toBe("low");
    expect(traitBand(12)).toBe("medium");
    expect(traitBand(13)).toBe("high");
    expect(traitBand(17)).toBe("very_high");
  });
  test("summary", () => {
    expect(summaryOf(neutral)).toBe("balanced");
    expect(summaryOf({ ...neutral, temperament: 19 })).toBe("hothead");
    expect(summaryOf({ ...neutral, professionalism: 2 })).toBe("sloppy");
    expect(summaryOf({ ...neutral, loyalty: 18, ambition: 16 })).toBe("loyal");
    expect(summaryOf({ ...neutral, temperament: null, ambition: 17 })).toBe("ambitious");
  });
});

describe("multipliers are neutral at 10,5", () => {
  const p = withP({});
  test("all", () => {
    expect(traitT(10.5)).toBe(0);
    expect(professionalismDpMult(p)).toBe(1);
    expect(professionalismDecayMult(p)).toBe(1);
    expect(temperamentFoulMult(0)).toBe(1);
    expect(temperamentYellowMult(0)).toBe(1);
    expect(temperamentRedMult(0)).toBe(1);
    expect(moraleVolatility(p)).toBe(1);
    expect(minutesDeficitMult(p)).toBe(1);
    expect(listedUnaskedMult(p)).toBe(1);
    expect(promiseBrokenMult(p)).toBe(1);
    expect(ambitionDemandMult(p)).toBe(1);
    expect(loyaltyRenewalMult(p, 10)).toBe(1);
    expect(smallerClubMult(p, 3)).toBe(1);
    expect(sellPush(p, true)).toBe(0);
    expect(transferRequestBelow(p, 25)).toBe(25);
  });
});

describe("effects", () => {
  test("professionalism", () => {
    expect(professionalismDpMult(withP({ professionalism: 20 }))).toBeCloseTo(1.15);
    expect(professionalismDpMult(withP({ professionalism: 1 }))).toBeCloseTo(0.85);
    expect(professionalismDecayMult(withP({ professionalism: 20 }))).toBeCloseTo(0.9);
    // A professional ignores the low-morale DP loss, keeps the happy bonus.
    expect(shieldedMoraleDpMult(withP({ professionalism: 16 }), 0.9)).toBe(1);
    expect(shieldedMoraleDpMult(withP({ professionalism: 16 }), 1.05)).toBe(1.05);
    expect(shieldedMoraleDpMult(withP({ professionalism: 12 }), 0.9)).toBe(0.9);
    expect(personalDpMult(withP({ professionalism: 20 }), 0.9)).toBeCloseTo(1.15);
  });
  test("temperament", () => {
    expect(temperamentFoulMult(1)).toBeCloseTo(1.45);
    expect(temperamentYellowMult(-1)).toBeCloseTo(0.8);
    expect(temperamentRedMult(1)).toBeCloseTo(1.4);
  });
  test("morale thresholds", () => {
    expect(transferRequestBelow(withP({ loyalty: 16 }), 25)).toBeNull();
    expect(transferRequestBelow(withP({ ambition: 20 }), 25)).toBeCloseTo(33);
    expect(isLoyal(withP({ loyalty: 15 }))).toBe(true);
    expect(wantsMove(withP({ loyalty: 18 }), 50, true, 60)).toBe(false);
    expect(wantsMove(withP({ loyalty: 18 }), 30, false, 60)).toBe(true);
    expect(wantsMove(withP({ ambition: 14 }), 80, true, 60)).toBe(true);
    expect(wantsMove(withP({ ambition: 12 }), 80, true, 60)).toBe(false);
    expect(wantsMove(withP({}), 55, false, 60)).toBe(true);
  });
  test("contracts", () => {
    const loyal = withP({ loyalty: 20 });
    expect(loyaltyRenewalMult(loyal, 4)).toBeCloseTo(0.9);
    expect(loyaltyRenewalMult(loyal, 2)).toBeCloseTo(0.95);
    expect(loyaltyRenewalMult(withP({ loyalty: 1 }), 8)).toBe(1);
    expect(compatriotMult({ ...loyal, nationality: "Brazil" }, "Brazil")).toBeCloseTo(0.95);
    expect(compatriotMult({ ...loyal, nationality: "Brazil" }, "England")).toBe(1);
    expect(smallerClubMult(withP({ ambition: 20 }), 2)).toBeCloseTo(1.2);
    expect(refusesSmallerClub(withP({ ambition: 17 }), 2)).toBe(true);
    expect(refusesSmallerClub(withP({ ambition: 17 }), 1)).toBe(false);
    expect(refusesSmallerClub(withP({ ambition: 16 }), 3)).toBe(false);
    const rich = { finances: { broadcasting: 300_000_000, commercial: 0, budget: 0, followers: 0 } };
    const poor = { finances: { broadcasting: 1_000_000, commercial: 0, budget: 0, followers: 0 } };
    expect(tierStepsDown(rich as never, poor as never)).toBe(3);
    expect(tierStepsDown(poor as never, rich as never)).toBe(0);
    expect(sellPush(withP({ ambition: 20 }), true)).toBeCloseTo(0.1);
    expect(sellPush(withP({ loyalty: 20 }), false)).toBeCloseTo(-0.1);
  });
  test("seasons at club", () => {
    const row = (season: string, squadId: string) => ({ season, squadId } as never);
    const history = [row("2026-27", "a"), row("2027-28", "a"), row("2028-29", "b")];
    const inSeason = { history, seasonLog: { appearances: 3, trainingSessions: 10 } as never };
    expect(seasonsAtClub(inSeason, "a", true)).toBe(3);
    expect(seasonsAtClub(inSeason, "b", false)).toBe(1);
    // At the rollover the log was just reset: the closed season (already a history row) counts once.
    const rolled = { history, seasonLog: { appearances: 0, trainingSessions: 0 } as never };
    expect(seasonsAtClub(rolled, "a", true)).toBe(2);
  });
});

describe("scout view", () => {
  const real: Personality = { ambition: 10, loyalty: 12, professionalism: 15, temperament: 5 };
  test("0 = exact", () => {
    expect(obscurePersonality(real, 0, "s", "p")).toEqual({ traits: { ...real }, uncertain: false });
  });
  test("deterministic, bounded, unknown from noise 1", () => {
    const a = obscurePersonality(real, 0.6, "s", "p");
    expect(a).toEqual(obscurePersonality(real, 0.6, "s", "p"));
    expect(a.uncertain).toBe(true);
    for (const k of PERSONALITY_TRAITS) {
      const v = a.traits[k]!;
      expect(Math.abs(v - real[k])).toBeLessThanOrEqual(3);
      expect(v).toBeGreaterThanOrEqual(1);
    }
    const b = obscurePersonality(real, 1.5, "s", "p");
    expect(b.traits.temperament).toBeNull();
    expect(b.traits.professionalism).toBeNull();
    expect(b.traits.ambition).not.toBeNull();
  });
});
