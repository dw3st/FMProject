import type { LedgerEntry, LedgerKind } from "@/Domain/finance/ledger";
import { accountOf, monthsOf, type StatementAccount } from "@/Domain/finance/statement";

/**
 * The plain views of the Finances screen (Summary and Simple tabs): the ledger grouped into a few categories a
 * player reads at a glance, the balance at the end of each month and the biggest lines. Pure.
 */

export type RevenueCategory = "tv" | "commercial" | "gate" | "prizes" | "market" | "other";
export type ExpenseCategory = "wages" | "operations" | "market" | "facilities" | "other";

/** Kinds that only move the balance (a club change, a loan received): neither income nor spending. */
const NEUTRAL: ReadonlySet<LedgerKind> = new Set<LedgerKind>(["club_change", "loan_in"]);

const REVENUE_OF: Partial<Record<LedgerKind, RevenueCategory>> = {
  broadcasting: "tv",
  commercial: "commercial",
  gate: "gate",
  prize: "prizes",
  transfer_in: "market",
  board_funding: "other",
};
const EXPENSE_OF: Partial<Record<LedgerKind, ExpenseCategory>> = {
  wages: "wages",
  staff: "wages",
  manager: "wages",
  operational: "operations",
  scouting: "operations",
  transfer_out: "market",
  facilities: "facilities",
  facilities_upkeep: "facilities",
  loan_payment: "other",
};

export const REVENUE_CATEGORIES: readonly RevenueCategory[] = ["tv", "commercial", "gate", "prizes", "market", "other"];
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ["wages", "operations", "market", "facilities", "other"];

export interface CategoryLine<C extends string> {
  category: C;
  /** Always positive. */
  amount: number;
  /** Of the side's total, 0..1. */
  share: number;
}

export interface SimpleBreakdown {
  revenue: CategoryLine<RevenueCategory>[];
  expenses: CategoryLine<ExpenseCategory>[];
  totalRevenue: number;
  /** Positive. */
  totalExpenses: number;
  /** Revenue minus expenses (a loan received or a club change left out). */
  result: number;
}

/** Income and spending by plain category, biggest first; a refund on either side is netted in its category. */
export function simpleBreakdown(entries: readonly LedgerEntry[]): SimpleBreakdown {
  const rev = new Map<RevenueCategory, number>();
  const exp = new Map<ExpenseCategory, number>();
  for (const e of entries) {
    if (NEUTRAL.has(e.kind)) continue;
    const r = REVENUE_OF[e.kind];
    if (r) {
      rev.set(r, (rev.get(r) ?? 0) + e.amount);
      continue;
    }
    const x = EXPENSE_OF[e.kind] ?? "other";
    exp.set(x, (exp.get(x) ?? 0) - e.amount);
  }
  const totalRevenue = [...rev.values()].reduce((s, v) => s + v, 0);
  const totalExpenses = [...exp.values()].reduce((s, v) => s + v, 0);
  const lines = <C extends string>(order: readonly C[], m: Map<C, number>, total: number): CategoryLine<C>[] =>
    order
      .filter((c) => (m.get(c) ?? 0) > 0)
      .map((c) => ({ category: c, amount: m.get(c)!, share: total > 0 ? m.get(c)! / total : 0 }))
      .sort((a, b) => b.amount - a.amount);
  return {
    revenue: lines(REVENUE_CATEGORIES, rev, totalRevenue),
    expenses: lines(EXPENSE_CATEGORIES, exp, totalExpenses),
    totalRevenue,
    totalExpenses,
    result: totalRevenue - totalExpenses,
  };
}

/** The balance at the end of each month with entries ("YYYY-MM"), oldest first. */
export function monthlyBalances(entries: readonly LedgerEntry[], opening: number): { month: string; balance: number }[] {
  const byMonth = new Map<string, number>();
  for (const e of entries) byMonth.set(e.date.slice(0, 7), (byMonth.get(e.date.slice(0, 7)) ?? 0) + e.amount);
  let balance = opening;
  return monthsOf([...entries]).map((month) => {
    balance += byMonth.get(month) ?? 0;
    return { month, balance };
  });
}

export interface TopLines {
  revenue: { account: StatementAccount; amount: number }[];
  /** Amounts positive. */
  expenses: { account: StatementAccount; amount: number }[];
}

/** The `n` biggest income accounts and the `n` biggest spending accounts of the entries (statement accounts). */
export function topLines(entries: readonly LedgerEntry[], n = 3): TopLines {
  const by = new Map<StatementAccount, number>();
  for (const e of entries) {
    if (NEUTRAL.has(e.kind)) continue;
    by.set(accountOf(e), (by.get(accountOf(e)) ?? 0) + e.amount);
  }
  const all = [...by.entries()].map(([account, amount]) => ({ account, amount }));
  const byAmount = (a: { account: string; amount: number }, b: { account: string; amount: number }) =>
    b.amount - a.amount || a.account.localeCompare(b.account);
  return {
    revenue: all.filter((a) => a.amount > 0).sort(byAmount).slice(0, n),
    expenses: all.filter((a) => a.amount < 0).map((a) => ({ account: a.account, amount: -a.amount })).sort(byAmount).slice(0, n),
  };
}

/** The sponsorship money of the entries: weekly payments and goal bonuses (`commercial` lines). */
export function commercialIncome(entries: readonly LedgerEntry[]): { weekly: number; bonus: number; total: number } {
  let weekly = 0;
  let bonus = 0;
  for (const e of entries) {
    if (e.kind !== "commercial") continue;
    if (e.ref?.stage === "sponsor_bonus") bonus += e.amount;
    else weekly += e.amount;
  }
  return { weekly, bonus, total: weekly + bonus };
}
