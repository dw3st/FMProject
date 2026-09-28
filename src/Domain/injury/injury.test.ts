import { describe, expect, test } from "bun:test";
import {
  ageInjuryFactor,
  clearHealed,
  contactInjuryChance,
  energyInjuryFactor,
  injuryDurationDays,
  injuryRatePerMinute,
  isInjured,
  loadInjuryFactor,
  returnDate,
  rollSeverity,
  strengthInjuryFactor,
  trainingInjuryChance,
} from "@/Domain/injury/injury";
import { INJURY } from "@/Domain/injury/injuryConfig";
import type { RosterPlayer } from "@/types/playerTypes";

function player(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: "p1",
    name: "Test Player",
    age: 25,
    squadId: "s1",
    preferredFoot: "right",
    positions: ["Midfielder"],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5,
    },
    profile: { summary: "", archetype: "" },
    ...overrides,
  };
}

describe("energyInjuryFactor", () => {
  test("is 1 at full energy (100)", () => {
    expect(energyInjuryFactor(100)).toBe(1);
  });

  test("is ENERGY_MAX_MULT at 0 energy", () => {
    expect(energyInjuryFactor(0)).toBeCloseTo(INJURY.ENERGY_MAX_MULT, 10);
  });

  test("is linear and clamps beyond 0..100", () => {
    expect(energyInjuryFactor(50)).toBeCloseTo((1 + INJURY.ENERGY_MAX_MULT) / 2, 10);
    expect(energyInjuryFactor(-20)).toBe(energyInjuryFactor(0));
    expect(energyInjuryFactor(150)).toBe(energyInjuryFactor(100));
  });
});

describe("loadInjuryFactor", () => {
  test("is 1 at load 0", () => {
    expect(loadInjuryFactor(0)).toBe(1);
  });

  test("is 1 + LOAD_MAX_BONUS at LOAD_HIGH and beyond", () => {
    expect(loadInjuryFactor(INJURY.LOAD_HIGH)).toBeCloseTo(1 + INJURY.LOAD_MAX_BONUS, 10);
    expect(loadInjuryFactor(INJURY.LOAD_HIGH * 3)).toBeCloseTo(1 + INJURY.LOAD_MAX_BONUS, 10);
  });

  test("is linear between", () => {
    const half = INJURY.LOAD_HIGH / 2;
    expect(loadInjuryFactor(half)).toBeCloseTo(1 + INJURY.LOAD_MAX_BONUS / 2, 10);
  });
});

describe("ageInjuryFactor", () => {
  test("is 1 at or below AGE_REF (30)", () => {
    expect(ageInjuryFactor(25)).toBe(1);
    expect(ageInjuryFactor(30)).toBe(1);
  });

  test("is AGE_MAX_MULT at/beyond AGE_SATURATION (40)", () => {
    expect(ageInjuryFactor(40)).toBeCloseTo(INJURY.AGE_MAX_MULT, 10);
    expect(ageInjuryFactor(50)).toBeCloseTo(INJURY.AGE_MAX_MULT, 10);
  });

  test("is linear between AGE_REF and AGE_SATURATION", () => {
    const mid = (INJURY.AGE_REF + INJURY.AGE_SATURATION) / 2;
    expect(ageInjuryFactor(mid)).toBeCloseTo(1 + (INJURY.AGE_MAX_MULT - 1) / 2, 10);
  });
});

describe("strengthInjuryFactor", () => {
  test("is 1 at or below STRENGTH_REF (5, average)", () => {
    expect(strengthInjuryFactor(5)).toBe(1);
    expect(strengthInjuryFactor(2)).toBe(1);
  });

  test("is 1 - STRENGTH_MAX_REDUCTION at strength 10", () => {
    expect(strengthInjuryFactor(10)).toBeCloseTo(1 - INJURY.STRENGTH_MAX_REDUCTION, 10);
  });

  test("is linear between STRENGTH_REF and 10", () => {
    const mid = (INJURY.STRENGTH_REF + 10) / 2;
    expect(strengthInjuryFactor(mid)).toBeCloseTo(1 - INJURY.STRENGTH_MAX_REDUCTION / 2, 10);
  });
});

describe("injuryRatePerMinute", () => {
  test("baseline (full energy, no load, 25yo, average strength) equals INJURY.BASE exactly", () => {
    const rate = injuryRatePerMinute({ energy: 100, load: 0, age: 25, strength: 5 });
    expect(rate).toBeCloseTo(INJURY.BASE, 12);
  });

  test("baseline produces ~0.3 injuries per match summed over 22 players x 90 minutes", () => {
    const rate = injuryRatePerMinute({ energy: 100, load: 0, age: 25, strength: 5 });
    const perMatch = rate * 22 * 90;
    expect(perMatch).toBeCloseTo(0.3, 10);
  });

  test("low energy, high load, old, weak player has a strictly higher rate than baseline", () => {
    const baseline = injuryRatePerMinute({ energy: 100, load: 0, age: 25, strength: 5 });
    const risky = injuryRatePerMinute({ energy: 10, load: INJURY.LOAD_HIGH, age: 38, strength: 0 });
    expect(risky).toBeGreaterThan(baseline);
  });

  test("strong player has a strictly lower rate than an average-strength player, other factors equal", () => {
    const avg = injuryRatePerMinute({ energy: 100, load: 0, age: 25, strength: 5 });
    const strong = injuryRatePerMinute({ energy: 100, load: 0, age: 25, strength: 10 });
    expect(strong).toBeLessThan(avg);
  });

  test("never negative for any input in range", () => {
    for (const energy of [0, 50, 100]) {
      for (const load of [0, INJURY.LOAD_HIGH, INJURY.LOAD_HIGH * 2]) {
        for (const age of [16, 30, 40, 45]) {
          for (const strength of [0, 5, 10]) {
            expect(injuryRatePerMinute({ energy, load, age, strength })).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });
});

describe("contactInjuryChance", () => {
  test("baseline equals INJURY.CONTACT_BASE exactly", () => {
    expect(contactInjuryChance({ energy: 100, load: 0, age: 25, strength: 5 })).toBeCloseTo(
      INJURY.CONTACT_BASE,
      12,
    );
  });

  test("scales up with worse conditions, same as injuryRatePerMinute's factors", () => {
    const baseline = contactInjuryChance({ energy: 100, load: 0, age: 25, strength: 5 });
    const risky = contactInjuryChance({ energy: 20, load: INJURY.LOAD_HIGH, age: 40, strength: 0 });
    expect(risky).toBeGreaterThan(baseline);
  });
});

describe("trainingInjuryChance", () => {
  test("is 0 for light and normal training", () => {
    expect(trainingInjuryChance("light")).toBe(0);
    expect(trainingInjuryChance("normal")).toBe(0);
  });

  test("is HEAVY_TRAINING_CHANCE for heavy training", () => {
    expect(trainingInjuryChance("heavy")).toBe(INJURY.HEAVY_TRAINING_CHANCE);
  });
});

describe("rollSeverity", () => {
  test("60% light / 30% medium / 10% severe, at the exact boundaries", () => {
    expect(rollSeverity(() => 0)).toBe("light");
    expect(rollSeverity(() => 0.599999)).toBe("light");
    expect(rollSeverity(() => 0.6)).toBe("medium");
    expect(rollSeverity(() => 0.899999)).toBe("medium");
    expect(rollSeverity(() => 0.9)).toBe("severe");
    expect(rollSeverity(() => 0.999999)).toBe("severe");
  });

  test("distribution over many rolls matches 60/30/10 within tolerance", () => {
    let rngValue = 0;
    const counts = { light: 0, medium: 0, severe: 0 };
    const n = 10000;
    // deterministic pseudo-random walk over [0,1) using a simple LCG for reproducibility
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    void rngValue;
    for (let i = 0; i < n; i++) counts[rollSeverity(rng)]++;
    expect(counts.light / n).toBeCloseTo(0.6, 1);
    expect(counts.medium / n).toBeCloseTo(0.3, 1);
    expect(counts.severe / n).toBeCloseTo(0.1, 1);
  });
});

describe("injuryDurationDays / returnDate", () => {
  test("light injury: 3-7 days", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const days = injuryDurationDays("light", () => r);
      expect(days).toBeGreaterThanOrEqual(3);
      expect(days).toBeLessThanOrEqual(7);
    }
  });

  test("medium injury: 7-28 days", () => {
    for (const r of [0, 0.5, 0.999999]) {
      const days = injuryDurationDays("medium", () => r);
      expect(days).toBeGreaterThanOrEqual(7);
      expect(days).toBeLessThanOrEqual(28);
    }
  });

  test("severe injury: 30-120 days", () => {
    for (const r of [0, 0.5, 0.999999]) {
      const days = injuryDurationDays("severe", () => r);
      expect(days).toBeGreaterThanOrEqual(30);
      expect(days).toBeLessThanOrEqual(120);
    }
  });

  test("returnDate adds the rolled duration in days to the given date", () => {
    expect(returnDate("2027-03-01", "light", () => 0)).toBe("2027-03-04");
    expect(returnDate("2027-03-01", "light", () => 0.999999)).toBe("2027-03-08");
  });

  test("returnDate crosses month/year boundaries correctly", () => {
    expect(returnDate("2027-12-30", "light", () => 0)).toBe("2028-01-02");
  });
});

describe("isInjured", () => {
  test("false when no injury", () => {
    expect(isInjured({ injury: undefined }, "2027-03-01")).toBe(false);
  });

  test("true strictly before returnDate", () => {
    const p = { injury: { severity: "light" as const, returnDate: "2027-03-05" } };
    expect(isInjured(p, "2027-03-01")).toBe(true);
    expect(isInjured(p, "2027-03-04")).toBe(true);
  });

  test("false on and after returnDate", () => {
    const p = { injury: { severity: "light" as const, returnDate: "2027-03-05" } };
    expect(isInjured(p, "2027-03-05")).toBe(false);
    expect(isInjured(p, "2027-03-10")).toBe(false);
  });
});

describe("clearHealed", () => {
  test("returns the same reference when there is no injury", () => {
    const p = player();
    expect(clearHealed(p, "2027-03-01")).toBe(p);
  });

  test("returns the same reference when the injury hasn't healed yet", () => {
    const p = player({ injury: { severity: "medium", returnDate: "2027-04-01" } });
    expect(clearHealed(p, "2027-03-01")).toBe(p);
  });

  test("removes the injury and restores fitness to ~70 once healed", () => {
    const p = player({
      injury: { severity: "medium", returnDate: "2027-04-01" },
      seasonLog: {
        appearances: 5, goals: 1, assists: 0, shots: 2,
        passesCompleted: 10, passesAttempted: 12, tackles: 1, interceptions: 0,
        avgRating: 6.5, recentRatings: [6.5], trainingSessions: 3, fitness: 40, morale: 60,
      },
    });
    const healed = clearHealed(p, "2027-04-01");
    expect(healed.injury).toBeUndefined();
    expect(healed.seasonLog?.fitness).toBe(INJURY.RETURN_FITNESS);
  });

  test("is pure — never mutates the input player", () => {
    const p = player({
      injury: { severity: "light", returnDate: "2027-03-05" },
      seasonLog: {
        appearances: 0, goals: 0, assists: 0, shots: 0,
        passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0,
        avgRating: 0, recentRatings: [], trainingSessions: 0, fitness: 40, morale: 60,
      },
    });
    const snapshot = JSON.parse(JSON.stringify(p));
    clearHealed(p, "2027-03-05");
    expect(p).toEqual(snapshot);
  });

  test("works when the player has no seasonLog yet", () => {
    const p = player({ injury: { severity: "severe", returnDate: "2027-06-01" } });
    const healed = clearHealed(p, "2027-06-01");
    expect(healed.injury).toBeUndefined();
    expect(healed.seasonLog).toBeUndefined();
  });
});
