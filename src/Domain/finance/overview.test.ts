import { describe, expect, test } from "bun:test";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import { commercialIncome, monthlyBalances, simpleBreakdown, topLines } from "@/Domain/finance/overview";

const e = (date: string, kind: LedgerEntry["kind"], amount: number, stage?: string): LedgerEntry =>
  ({ date, kind, amount, label: kind, ...(stage ? { ref: { stage } } : {}) });

const ledger: LedgerEntry[] = [
  e("2027-08-01", "broadcasting", 1000),
  e("2027-08-02", "commercial", 100, "sponsors"),
  e("2027-08-02", "wages", -400),
  e("2027-08-02", "staff", -50),
  e("2027-08-02", "operational", -100),
  e("2027-08-10", "gate", 200),
  e("2027-09-01", "transfer_out", -300),
  e("2027-09-02", "transfer_out", -20, "signing_bonus"),
  e("2027-09-05", "facilities", -80),
  e("2027-09-06", "loan_in", 500),
  e("2027-09-13", "loan_payment", -10),
  e("2027-09-20", "club_change", -5000, "leave"),
  e("2027-10-01", "commercial", 30, "sponsor_bonus"),
];

describe("finance overview", () => {
  test("simple breakdown groups and leaves out loans received and club changes", () => {
    const b = simpleBreakdown(ledger);
    expect(b.totalRevenue).toBe(1330);
    expect(b.totalExpenses).toBe(960);
    expect(b.result).toBe(370);
    expect(b.revenue.map((l) => l.category)).toEqual(["tv", "gate", "commercial"]);
    expect(b.expenses.find((l) => l.category === "wages")?.amount).toBe(450);
    expect(b.expenses.find((l) => l.category === "market")?.amount).toBe(320);
    expect(b.expenses.find((l) => l.category === "other")?.amount).toBe(10);
    expect(b.revenue.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1);
  });

  test("an empty period", () => {
    const b = simpleBreakdown([]);
    expect(b.revenue).toEqual([]);
    expect(b.result).toBe(0);
  });

  test("monthly balances end at the closing balance", () => {
    const m = monthlyBalances(ledger, 50);
    expect(m.map((x) => x.month)).toEqual(["2027-08", "2027-09", "2027-10"]);
    expect(m[0]!.balance).toBe(50 + 1000 + 100 - 400 - 50 - 100 + 200);
    expect(m[m.length - 1]!.balance).toBe(50 + ledger.reduce((s, x) => s + x.amount, 0));
  });

  test("top lines by statement account", () => {
    const t = topLines(ledger);
    expect(t.revenue.map((x) => x.account)).toEqual(["broadcasting", "gate", "commercial"]);
    expect(t.expenses).toEqual([
      { account: "wages", amount: 400 },
      { account: "transfer_out", amount: 300 },
      { account: "operational", amount: 100 },
    ]);
  });

  test("sponsorship money splits payments and bonuses", () => {
    expect(commercialIncome(ledger)).toEqual({ weekly: 100, bonus: 30, total: 130 });
  });
});
