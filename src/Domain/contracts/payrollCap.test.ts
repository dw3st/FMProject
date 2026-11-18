import { describe, expect, test } from "bun:test";
import { PAYROLL_CAP_SHARE, payrollCapRefusal } from "@/Domain/contracts/payrollCap";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

// Revenue basis 5.2M a year = 100k a week: the cap is 85k a week.
const player = (id: string, wage: number): RosterPlayer => ({ id, contract: { until: "2028-05-31", wage } }) as RosterPlayer;
const squad = (wages: number[]): Squad => ({
  id: "h", name: "H", colors: ["#000", "#fff"], money: 0,
  players: wages.map((w, i) => player(`p${i}`, w)), wageFactor: 1, wageRevenueBasis: 5_200_000,
}) as Squad;

describe("payrollCapRefusal", () => {
  test("cap is 85% of the weekly revenue basis", () => {
    expect(PAYROLL_CAP_SHARE).toBe(0.85);
    expect(payrollCapRefusal(squad([80_000]), 6_000)).toEqual({ bill: 86_000, cap: 85_000 });
  });
  test("a signing that keeps the bill under the cap passes", () => {
    expect(payrollCapRefusal(squad([80_000]), 5_000)).toBeNull();
  });
  test("a renewal that keeps or lowers the wage always passes, even over the cap", () => {
    const s = squad([90_000, 10_000]);
    expect(payrollCapRefusal(s, 10_000, { leaving: 10_000 })).toBeNull();
    expect(payrollCapRefusal(s, 8_000, { leaving: 10_000 })).toBeNull();
  });
  test("a raise counts only the difference", () => {
    const s = squad([70_000, 10_000]);
    expect(payrollCapRefusal(s, 15_000, { leaving: 10_000 })).toBeNull();
    expect(payrollCapRefusal(s, 16_000, { leaving: 10_000 })).toEqual({ bill: 86_000, cap: 85_000 });
  });
  test("pending wages (signed pre-contracts) count on the bill", () => {
    expect(payrollCapRefusal(squad([70_000]), 5_000, { pending: 11_000 })).toEqual({ bill: 86_000, cap: 85_000 });
  });
});
