import { describe, expect, test } from "bun:test";
import type { Squad } from "@/types/playerTypes";
import { transferFeeSquads } from "@/backend/FinancialService";
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
