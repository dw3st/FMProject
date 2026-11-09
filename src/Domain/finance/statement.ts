import type { LedgerEntry, LedgerKind } from "@/Domain/finance/ledger";

/**
 * The accounting view of the club's ledger (Finances screen, 8.8.20): one statement per season or
 * month, the journal with its running balance. Pure; the screen only formats the result.
 */

/** A ledger kind, split where the statement shows a part of it on a line of its own. */
export type StatementAccount = LedgerKind | "severance" | "signing_bonus";
export type StatementGroupId = "revenue" | "people" | "operations" | "market" | "bank";

/** Groups and accounts in statement order; the first three make the operating result. */
const LAYOUT: { id: StatementGroupId; accounts: StatementAccount[] }[] = [
  { id: "revenue", accounts: ["broadcasting", "commercial", "gate", "prize", "board_funding"] },
  { id: "people", accounts: ["wages", "staff", "manager", "severance"] },
  { id: "operations", accounts: ["operational", "facilities", "facilities_upkeep", "scouting"] },
  { id: "market", accounts: ["transfer_in", "transfer_out", "signing_bonus"] },
  { id: "bank", accounts: ["loan_in", "loan_payment", "club_change"] },
];
const OPERATING_GROUPS: StatementGroupId[] = ["revenue", "people", "operations"];

export function accountOf(entry: LedgerEntry): StatementAccount {
  if ((entry.kind === "staff" || entry.kind === "manager") && entry.ref?.stage === "severance") return "severance";
  if (entry.kind === "transfer_out" && entry.ref?.stage === "signing_bonus") return "signing_bonus";
  return entry.kind;
}

export interface StatementGroup {
  id: StatementGroupId;
  /** Only the accounts that moved in the period. */
  accounts: { account: StatementAccount; amount: number }[];
  total: number;
}

export interface Statement {
  /** The entries of the period, in ledger order. */
  entries: LedgerEntry[];
  groups: StatementGroup[];
  opening: number;
  inflow: number;
  outflow: number;
  revenue: number;
  operating: number;
  net: number;
  closing: number;
}

const sum = (entries: LedgerEntry[]) => entries.reduce((s, e) => s + e.amount, 0);

/** The months ("YYYY-MM") with entries, oldest first. */
export function monthsOf(entries: LedgerEntry[]): string[] {
  return [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort();
}

/** Which month to show: a month the season has, else its first or last. Null for a season with no entries. */
export function resolveMonth(months: string[], pick: string): string | null {
  if (months.length === 0) return null;
  if (months.includes(pick)) return pick;
  return pick === "first" ? months[0]! : months[months.length - 1]!;
}

/** The statement of a season (`month` null) or of one of its months; `seasonOpening` is the balance the season began with. */
export function buildStatement(entries: LedgerEntry[], seasonOpening: number, month: string | null): Statement {
  const inPeriod = month ? entries.filter((e) => e.date.startsWith(month)) : entries;
  const opening = seasonOpening + (month ? sum(entries.filter((e) => e.date.slice(0, 7) < month)) : 0);
  const byAccount = new Map<StatementAccount, number>();
  for (const e of inPeriod) byAccount.set(accountOf(e), (byAccount.get(accountOf(e)) ?? 0) + e.amount);

  const groups = LAYOUT.map(({ id, accounts }) => {
    const moved = accounts.filter((a) => byAccount.has(a)).map((account) => ({ account, amount: byAccount.get(account)! }));
    return { id, accounts: moved, total: moved.reduce((s, a) => s + a.amount, 0) };
  });
  const totalOf = (ids: StatementGroupId[]) => groups.filter((g) => ids.includes(g.id)).reduce((s, g) => s + g.total, 0);
  const net = sum(inPeriod);
  const inflow = sum(inPeriod.filter((e) => e.amount > 0));
  return {
    entries: inPeriod,
    groups,
    opening,
    inflow,
    outflow: net - inflow,
    revenue: totalOf(["revenue"]),
    operating: totalOf(OPERATING_GROUPS),
    net,
    closing: opening + net,
  };
}

export interface JournalRow {
  entry: LedgerEntry;
  /** The balance right after this entry. */
  balance: number;
}

/** The journal, newest first: within a day the last entry written comes first. */
export function journalRows(entries: LedgerEntry[], closing: number): JournalRow[] {
  const newestFirst = [...entries].reverse().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  let balance = closing;
  return newestFirst.map((entry) => {
    const row = { entry, balance };
    balance -= entry.amount;
    return row;
  });
}

/** What the scouting trips cost on the last Monday the wages were paid (a negative amount, 0 without trips). */
export function lastWeekScouting(entries: LedgerEntry[]): number {
  const lastPayday = entries.reduce((d, e) => (e.kind === "wages" && e.date > d ? e.date : d), "");
  return sum(entries.filter((e) => e.kind === "scouting" && e.date === lastPayday));
}

/** Average gate of the home games in the entries; null without any. */
export function averageGate(entries: LedgerEntry[]): number | null {
  const gates = entries.filter((e) => e.kind === "gate");
  return gates.length === 0 ? null : Math.round(sum(gates) / gates.length);
}
