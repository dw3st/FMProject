import { describe, expect, test } from "bun:test";
import { answerDelay, applicationChance, liveRefusals, securityLevel } from "@/Domain/jobs/application";
import { daysBetween } from "@/Domain/dates";

describe("job security and applications (8.9.29)", () => {
  const base = { target: 10, size: 20, form: 1.4, progress: 0.5 };

  test("level follows the table position against the target", () => {
    expect(securityLevel({ ...base, position: 2 })).toBe(1);
    expect(securityLevel({ ...base, position: 9 })).toBe(2);
    expect(securityLevel({ ...base, position: 11 })).toBe(3);
    expect(securityLevel({ ...base, position: 14 })).toBe(4);
    expect(securityLevel({ ...base, position: 19 })).toBe(5);
  });

  test("early season, no games or a new manager soften the risk", () => {
    expect(securityLevel({ ...base })).toBe(3);
    expect(securityLevel({ ...base, position: 19, progress: 0.05 })).toBeLessThan(5);
    expect(securityLevel({ ...base, position: 16, daysInCharge: 10 })).toBeLessThan(securityLevel({ ...base, position: 16 }));
    expect(securityLevel({ ...base, position: 13, form: 0.2 })).toBeGreaterThan(securityLevel({ ...base, position: 13, form: 2.6 }));
  });

  test("chance grows with the threat and falls with a club too big for the reputation", () => {
    const at = (level: 1 | 2 | 3 | 4 | 5 | "vacant", prestige = 0.4) => applicationChance({ level, prestige, reputation: 50 });
    expect(at(1)).toBeLessThan(at(3));
    expect(at(3)).toBeLessThan(at(5));
    expect(at(5)).toBeLessThan(at("vacant"));
    expect(at(5, 0.95)).toBeLessThan(at(5, 0.4));
    expect(at(5, 0.95)).toBeGreaterThan(0);
  });

  test("answer in 3..6 days and refusals expire after 90", () => {
    for (let i = 0; i < 20; i++) {
      const d = answerDelay(() => i / 20);
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(6);
    }
    expect(liveRefusals({ a: "2027-01-01", b: "2027-05-01" }, "2027-05-10", daysBetween)).toEqual({ b: "2027-05-01" });
  });
});
