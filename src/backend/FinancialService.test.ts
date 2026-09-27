import { describe, expect, test } from "bun:test";
import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import type { Squad } from "@/types/playerTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import { recordMoney, transferFeeSquads } from "@/backend/FinancialService";
import { SaveService } from "@/backend/SaveService";
import { seasonalTransferBudgetFor } from "@/Domain/aiFinance/aiClubFinance";
import { AI_FINANCE_CONFIG } from "@/Domain/aiFinance/aiFinanceConfig";

const squad = (id: string, budget: number, extra: Partial<Squad> = {}): Squad => ({
  id, name: id, colors: ["#000", "#fff"], money: 0, players: [],
  finances: { broadcasting: 100_000_000, commercial: 0, total: 100_000_000, budget, followers: 0 },
  ...extra,
});

describe("transferFeeSquads", () => {
  test("human buys from AI: human budget pays, AI seller refills part of its transfer budget", () => {
    const { buyer, seller } = transferFeeSquads(
      { squad: squad("h", 20_000_000), isPlayerClub: true },
      { squad: squad("ai", 5, { aiTransferBudget: 0 }), isPlayerClub: false },
      10_000_000,
    );
    expect(buyer.finances!.budget).toBe(10_000_000);
    expect(buyer.aiTransferBudget).toBeUndefined();
    expect(seller.finances!.budget).toBe(5); // AI balance is never touched
    expect(seller.aiTransferBudget).toBe(10_000_000 * AI_FINANCE_CONFIG.TRANSFER_BUDGET.SALE_RETURN_RATIO);
  });
  test("AI buys from human: AI transfer budget pays, human budget receives the full fee", () => {
    const { buyer, seller } = transferFeeSquads(
      { squad: squad("ai", 7), isPlayerClub: false },
      { squad: squad("h", 1_000_000), isPlayerClub: true },
      10_000_000,
    );
    expect(buyer.aiTransferBudget).toBe(seasonalTransferBudgetFor("HIGH", 0) - 10_000_000);
    expect(buyer.finances!.budget).toBe(7);
    expect(seller.finances!.budget).toBe(11_000_000);
  });
});

/** In-memory ISaveDAL covering squad + ledger; any other method throws. */
function memoryDAL(files: SquadFile[]): { dal: ISaveDAL; disk: Map<string, SquadFile>; ledger: Map<string, LedgerEntry[]> } {
  const disk = new Map(files.map((f) => [`${f.leagueSlug}/${f.clubSlug}`, f]));
  const ledger = new Map<string, LedgerEntry[]>();
  const impl: Partial<ISaveDAL> = {
    async readSquad(_s, league, club) {
      return disk.get(`${league}/${club}`)?.squad ?? null;
    },
    async writeSquad(_s, league, club, sq) {
      disk.set(`${league}/${club}`, { leagueSlug: league, clubSlug: club, squad: { ...sq, leagueSlug: league } });
    },
    async squadExists(_s, league, club) {
      return disk.has(`${league}/${club}`);
    },
    async listSquadFiles() {
      return Array.from(disk.values());
    },
    async listLeagues() {
      return [...new Set(Array.from(disk.values()).map((f) => f.leagueSlug))];
    },
    async readLedger(_s, season) {
      return ledger.get(`${_s}:${season}`) ?? [];
    },
    async appendLedger(_s, season, entries) {
      const key = `${_s}:${season}`;
      ledger.set(key, [...(ledger.get(key) ?? []), ...entries]);
    },
  };
  const dal = new Proxy(impl, {
    get(target, prop) {
      const v = Reflect.get(target, prop);
      if (v) return v;
      return () => {
        throw new Error(`fake DAL: ${String(prop)} not implemented`);
      };
    },
  }) as ISaveDAL;
  return { dal, disk, ledger };
}

describe("recordMoney", () => {
  const SAVE = "save-1";

  test("moves the squad's budget by the entry amount, saves the squad, and appends the ledger entry", async () => {
    const { dal, disk, ledger } = memoryDAL([
      { leagueSlug: "lg", clubSlug: "c1", squad: squad("h", 100_000) },
    ]);
    const service = new SaveService(dal);
    const entry: LedgerEntry = { date: "2027-03-10", kind: "gate", amount: 5000, label: "test" };

    const updated = await recordMoney(service, SAVE, 2027, { leagueSlug: "lg", clubSlug: "c1" }, entry);

    expect(updated.finances!.budget).toBe(105_000);
    expect(disk.get("lg/c1")!.squad.finances!.budget).toBe(105_000);
    expect(ledger.get(`${SAVE}:2027`)).toEqual([entry]);
  });

  test("the balance can go negative — no clamp", async () => {
    const { dal } = memoryDAL([{ leagueSlug: "lg", clubSlug: "c1", squad: squad("h", 1000) }]);
    const service = new SaveService(dal);
    const entry: LedgerEntry = { date: "2027-03-10", kind: "wages", amount: -5000, label: "wages" };

    const updated = await recordMoney(service, SAVE, 2027, { leagueSlug: "lg", clubSlug: "c1" }, entry);

    expect(updated.finances!.budget).toBe(-4000);
  });

  test("several entries in a row accumulate in the same season's ledger", async () => {
    const { dal, ledger } = memoryDAL([{ leagueSlug: "lg", clubSlug: "c1", squad: squad("h", 0) }]);
    const service = new SaveService(dal);
    await recordMoney(service, SAVE, 2027, { leagueSlug: "lg", clubSlug: "c1" }, { date: "2027-03-10", kind: "commercial", amount: 1000, label: "a" });
    await recordMoney(service, SAVE, 2027, { leagueSlug: "lg", clubSlug: "c1" }, { date: "2027-03-10", kind: "wages", amount: -400, label: "b" });

    expect(ledger.get(`${SAVE}:2027`)!.map((e) => e.label)).toEqual(["a", "b"]);
  });

  test("throws when the squad cannot be found", async () => {
    const { dal } = memoryDAL([]);
    const service = new SaveService(dal);
    await expect(
      recordMoney(service, SAVE, 2027, { leagueSlug: "lg", clubSlug: "missing" }, {
        date: "2027-03-10", kind: "gate", amount: 100, label: "x",
      }),
    ).rejects.toThrow(/missing/);
  });
});
