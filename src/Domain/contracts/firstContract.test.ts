import { describe, expect, test } from "bun:test";
import { firstProWage, FIRST_CONTRACT } from "@/Domain/contracts/firstContract";
import { playerWeeklyWage, wageFactorOf } from "@/Domain/finance/wages";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const stats = (v: number) => ({ speed: v, acceleration: v, strength: v, stamina: v, finishing: v, dribbling: v, passing: v, vision: v, tackling: v, pressing: v, heading: v, reflex: v, jump: v });
const player = (id: string, v: number, wage: number): RosterPlayer =>
  ({ id, name: id, age: 24, positions: ["Midfielder"], stats: stats(v), contract: { until: "2029-06-30", wage } } as unknown as RosterPlayer);
const squad = (players: RosterPlayer[]): Squad =>
  ({ id: "c", name: "C", players, finances: { broadcasting: 800_000, commercial: 500_000, budget: 0, followers: 700_000 } } as unknown as Squad);

describe("firstProWage", () => {
  test("half the curve, never above twice the median wage of the squad", () => {
    const s = squad([player("a", 2.5, 2000), player("b", 2.5, 2500), player("c", 2.5, 3000)]);
    const kid = player("k", 4.1, 0);
    const half = playerWeeklyWage(kid, wageFactorOf(s)) * FIRST_CONTRACT.CURVE_SHARE;
    expect(firstProWage(s, kid)).toBe(Math.round(Math.min(half, 5000)));
    expect(firstProWage(s, kid)).toBeLessThanOrEqual(5000);
  });
  test("an empty squad keeps half the curve", () => {
    const s = squad([]); const kid = player("k", 3, 0);
    expect(firstProWage(s, kid)).toBe(Math.max(FIRST_CONTRACT.FLOOR, Math.round(playerWeeklyWage(kid, wageFactorOf(s)) * 0.5)));
  });
});
