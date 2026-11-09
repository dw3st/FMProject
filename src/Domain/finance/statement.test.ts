import { describe, expect, test } from "bun:test";
import type { LedgerEntry, LedgerKind } from "@/Domain/finance/ledger";
import { accountOf, averageGate, buildStatement, journalRows, lastWeekScouting, monthsOf, resolveMonth } from "@/Domain/finance/statement";

const e = (date: string, kind: LedgerKind, amount: number, stage?: string): LedgerEntry => ({
  date, kind, amount, label: kind, ...(stage ? { ref: { stage } } : {}),
});

const ENTRIES = [
  e("2032-05-17", "broadcasting", 100),
  e("2032-05-24", "wages", -40),
  e("2032-06-01", "transfer_in", 50),
  e("2032-06-02", "transfer_out", -10, "signing_bonus"),
  e("2032-06-07", "staff", -5, "severance"),
  e("2032-06-07", "operational", -20),
];

describe("accountOf", () => {
  test("severance and signing bonus get lines of their own", () => {
    expect(accountOf(e("2032-01-01", "staff", -1, "severance"))).toBe("severance");
    expect(accountOf(e("2032-01-01", "manager", -1, "severance"))).toBe("severance");
    expect(accountOf(e("2032-01-01", "transfer_out", -1, "signing_bonus"))).toBe("signing_bonus");
    expect(accountOf(e("2032-01-01", "transfer_out", -1, "sell_on"))).toBe("transfer_out");
    expect(accountOf(e("2032-01-01", "staff", -1))).toBe("staff");
  });
});

describe("buildStatement", () => {
  test("a season adds up from the opening balance to the closing one", () => {
    const s = buildStatement(ENTRIES, 7, null);
    expect(s.opening).toBe(7);
    expect(s.inflow).toBe(150);
    expect(s.outflow).toBe(-75);
    expect(s.net).toBe(75);
    expect(s.closing).toBe(82);
    expect(s.revenue).toBe(100);
    expect(s.operating).toBe(100 - 40 - 5 - 20);
    expect(s.groups.reduce((sum, g) => sum + g.total, 0)).toBe(s.net);
  });

  test("a month opens with the balance the previous months left", () => {
    const s = buildStatement(ENTRIES, 7, "2032-06");
    expect(s.opening).toBe(7 + 60);
    expect(s.entries).toHaveLength(4);
    expect(s.net).toBe(15);
    expect(s.closing).toBe(82);
  });

  test("only the accounts that moved are listed, every ledger kind lands in a group", () => {
    const kinds: LedgerKind[] = ["broadcasting", "commercial", "wages", "operational", "staff", "gate", "prize", "transfer_in", "transfer_out", "club_change", "facilities", "facilities_upkeep", "board_funding", "manager", "scouting", "loan_in", "loan_payment"];
    const s = buildStatement(kinds.map((k) => e("2032-01-01", k, 1)), 0, null);
    expect(s.groups.flatMap((g) => g.accounts)).toHaveLength(kinds.length);
    expect(buildStatement(ENTRIES, 0, "2032-05").groups.find((g) => g.id === "market")!.accounts).toEqual([]);
  });
});

describe("months", () => {
  test("monthsOf lists the months once, oldest first", () => {
    expect(monthsOf(ENTRIES)).toEqual(["2032-05", "2032-06"]);
  });
  test("resolveMonth keeps a known month and falls back to the ends", () => {
    expect(resolveMonth(["2032-05", "2032-06"], "2032-05")).toBe("2032-05");
    expect(resolveMonth(["2032-05", "2032-06"], "first")).toBe("2032-05");
    expect(resolveMonth(["2032-05", "2032-06"], "last")).toBe("2032-06");
    expect(resolveMonth(["2032-05", "2032-06"], "2031-01")).toBe("2032-06");
    expect(resolveMonth([], "last")).toBeNull();
  });
});

describe("journalRows", () => {
  test("newest first, the running balance walks back from the closing figure", () => {
    const rows = journalRows(ENTRIES, 82);
    expect(rows[0]!.entry.kind).toBe("operational");
    expect(rows[0]!.balance).toBe(82);
    expect(rows[1]!.entry.kind).toBe("staff");
    expect(rows[1]!.balance).toBe(102);
    expect(rows[rows.length - 1]!.entry.kind).toBe("broadcasting");
    expect(rows[rows.length - 1]!.balance).toBe(107);
  });
});

describe("weekly figures", () => {
  test("scouting of the last wage Monday only", () => {
    const list = [e("2032-06-07", "wages", -1), e("2032-06-07", "scouting", -3), e("2032-06-14", "wages", -1), e("2032-06-14", "scouting", -2), e("2032-06-14", "scouting", -4)];
    expect(lastWeekScouting(list)).toBe(-6);
    expect(lastWeekScouting([])).toBe(0);
  });
  test("average gate", () => {
    expect(averageGate([e("2032-06-07", "gate", 10), e("2032-06-14", "gate", 21)])).toBe(16);
    expect(averageGate(ENTRIES)).toBeNull();
  });
});
