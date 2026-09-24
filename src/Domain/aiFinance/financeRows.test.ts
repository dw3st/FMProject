import { describe, expect, test } from "bun:test";
import type { Squad } from "@/types/playerTypes";
import { buildClubFinanceRows } from "@/Domain/aiFinance/financeRows";
import { aiClubFinance } from "@/Domain/aiFinance/aiClubFinance";

const squad = (id: string, income: number, followers: number, extra: Partial<Squad> = {}): Squad => ({
  id, name: id.toUpperCase(), colors: ["#000", "#fff"], money: 0, players: [],
  finances: { broadcasting: income, commercial: 0, total: income, budget: 1, followers },
  ...extra,
});

describe("buildClubFinanceRows", () => {
  test("AI rows mirror aiClubFinance; the human row has no AI fields", () => {
    const rows = buildClubFinanceRows([squad("a", 1_000_000, 10), squad("b", 300_000_000, 5e7), squad("me", 300_000_000, 1e8)], "me");
    expect(rows.map((r) => r.squadId)).toEqual(["b", "a", "me"]);
    const b = aiClubFinance(squad("b", 300_000_000, 5e7));
    expect(rows[0]).toMatchObject({ tier: "ELITE", hiring: b.hiring, transferBudget: b.transferBudget, maxWageBudget: b.maxWageBudget, isPlayerClub: false });
    const me = rows[2]!;
    expect(me.isPlayerClub).toBe(true);
    expect(me.tier).toBeNull();
    expect(me.transferBudget).toBeNull();
    expect(me.popularity).toBeGreaterThan(80);
  });
});
