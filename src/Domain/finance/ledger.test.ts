import { describe, expect, test } from "bun:test";
import { applyMoney, totalsByKind, weeklyNet, type LedgerEntry } from "@/Domain/finance/ledger";
import type { Squad } from "@/types/playerTypes";

function squad(budget: number, extra: Partial<Squad> = {}): Squad {
  return {
    id: "s1",
    name: "Club",
    colors: ["#000", "#fff"],
    money: 0,
    players: [],
    finances: { broadcasting: 0, commercial: 0, total: 0, budget, followers: 0 },
    ...extra,
  };
}

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return { date: "2027-03-10", kind: "gate", amount: 1000, label: "test", ...overrides };
}

describe("applyMoney", () => {
  test("adds a positive amount to the budget", () => {
    const result = applyMoney(squad(100), entry({ amount: 50 }));
    expect(result.finances!.budget).toBe(150);
  });

  test("subtracts a negative amount, and the balance may go negative — no clamp", () => {
    const result = applyMoney(squad(100), entry({ amount: -250 }));
    expect(result.finances!.budget).toBe(-150);
  });

  test("does not mutate the original squad", () => {
    const original = squad(100);
    applyMoney(original, entry({ amount: 50 }));
    expect(original.finances!.budget).toBe(100);
  });

  test("a squad without finances is returned unchanged", () => {
    const noFinances = squad(100, { finances: undefined });
    const result = applyMoney(noFinances, entry({ amount: 50 }));
    expect(result.finances).toBeUndefined();
    expect(result).toEqual(noFinances);
  });

  test("preserves other finance fields", () => {
    const original = squad(100, {
      finances: { broadcasting: 10, commercial: 20, total: 30, budget: 100, followers: 5000 },
    });
    const result = applyMoney(original, entry({ amount: 10 }));
    expect(result.finances).toEqual({ broadcasting: 10, commercial: 20, total: 30, budget: 110, followers: 5000 });
  });
});

describe("totalsByKind", () => {
  test("sums amounts per kind and includes every kind, even absent ones, at 0", () => {
    const totals = totalsByKind([
      entry({ kind: "gate", amount: 1000 }),
      entry({ kind: "gate", amount: 500 }),
      entry({ kind: "wages", amount: -2000 }),
      entry({ kind: "prize", amount: 300 }),
    ]);
    expect(totals.gate).toBe(1500);
    expect(totals.wages).toBe(-2000);
    expect(totals.prize).toBe(300);
    expect(totals.broadcasting).toBe(0);
    expect(totals.commercial).toBe(0);
    expect(totals.operational).toBe(0);
    expect(totals.transfer_in).toBe(0);
    expect(totals.transfer_out).toBe(0);
  });

  test("empty list gives every kind 0", () => {
    const totals = totalsByKind([]);
    expect(Object.values(totals).every((v) => v === 0)).toBe(true);
    expect(Object.keys(totals).sort()).toEqual(
      ["broadcasting", "commercial", "wages", "operational", "staff", "gate", "prize", "transfer_in", "transfer_out", "club_change"].sort(),
    );
  });
});

describe("weeklyNet", () => {
  test("groups entries into Monday-start ISO weeks, oldest to newest", () => {
    // 2027-03-08 is a Monday; 2027-03-10 (Wed) and 2027-03-14 (Sun) fall in the same week.
    // 2027-03-15 is the next Monday.
    const entries = [
      entry({ date: "2027-03-15", amount: 100 }),
      entry({ date: "2027-03-10", amount: 200 }),
      entry({ date: "2027-03-14", amount: 50 }),
    ];
    expect(weeklyNet(entries)).toEqual([
      { weekStart: "2027-03-08", net: 250 },
      { weekStart: "2027-03-15", net: 100 },
    ]);
  });

  test("a Sunday belongs to the week that started the previous Monday", () => {
    // 2027-03-07 is a Sunday; the Monday before it is 2027-03-01.
    expect(weeklyNet([entry({ date: "2027-03-07", amount: 10 })])).toEqual([
      { weekStart: "2027-03-01", net: 10 },
    ]);
  });

  test("a Monday is its own week start", () => {
    expect(weeklyNet([entry({ date: "2027-03-08", amount: 10 })])).toEqual([
      { weekStart: "2027-03-08", net: 10 },
    ]);
  });

  test("empty list gives an empty array", () => {
    expect(weeklyNet([])).toEqual([]);
  });
});
