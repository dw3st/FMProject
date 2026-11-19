import { describe, expect, test } from "bun:test";
import { FM_COUNT_KEYS, FM_MATCH_TARGETS, fmCountsOf, fmMatchValues, fmTargetRows, perMatchCounts, type FmMatchCounts } from "@/lab/fmTargets";

/** FM target panel (engine rebuild stage 0): our values from the two teams' stats, next to FM's. */

const zero = (): FmMatchCounts => Object.fromEntries(FM_COUNT_KEYS.map(k => [k, 0])) as unknown as FmMatchCounts;

describe("FM targets", () => {
  test("every target has a value function and a unique key", () => {
    const v = fmMatchValues(zero());
    const keys = FM_MATCH_TARGETS.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k in v).toBe(true);
  });

  test("both teams summed; ratios and all pass kinds", () => {
    const a = { ...zero(), shots: 10, shotsOnTarget: 4, shotsBlocked: 3, goals: 1, xg: 1.5, passesAttempted: 400, passesCompleted: 360, crosses: 10, crossesCompleted: 2, fouls: 10, yellowCards: 2 };
    const b = { ...zero(), shots: 10, shotsOnTarget: 3, goals: 0, xg: 0.5, passesAttempted: 380, passesCompleted: 330, longBalls: 20, longBallsCompleted: 10 };
    const c = fmCountsOf(a, b);
    expect(c.shots).toBe(20);
    const v = fmMatchValues({ ...c, longShots: 9 });
    expect(v.shotsOnTargetPct).toBeCloseTo(35, 6);
    expect(v.shotsBlockedPct).toBeCloseTo(15, 6);
    expect(v.longShotsPct).toBeCloseTo(45, 6);
    expect(v.xgPerShot).toBeCloseTo(0.1, 6);
    expect(v.passesAttempted).toBe(810);
    expect(v.passCompletionPct).toBeCloseTo((100 * 702) / 810, 6);
    expect(v.yellowsPerFoul).toBeCloseTo(0.2, 6);
    expect(fmMatchValues(c).longShotsPct).toBeNull();
  });

  test("per-match mean and the rows", () => {
    const c = perMatchCounts({ ...zero(), shots: 43, corners: 25 }, 2);
    expect(c.shots).toBe(21.5);
    const rows = fmTargetRows(c);
    const shots = rows.find(r => r.target.key === "shots")!;
    expect(shots.ours).toBe("21.5");
    expect(shots.ratio).toBeCloseTo(1, 6);
    expect(rows.find(r => r.target.key === "redCards")!.ratio).toBeNull();
  });
});
