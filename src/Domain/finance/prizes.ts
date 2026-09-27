import type { CupStageName, ContinentalSlug } from "@/types/calendarTypes";
import { AI_PRIZE_SHARE, CONTINENTAL_PRIZE, CUP_RUNNER_UP_SHARE, CUP_STAGE_SHARE, LEAGUE_PRIZE } from "@/Domain/finance/prizeConfig";
import { AI_FINANCE_CONFIG } from "@/Domain/aiFinance/aiFinanceConfig";

/**
 * Pure prize maths (`.claude/rules/AI-clubs/finance.md`,
 * `docs/superpowers/specs/2026-09-27-prizes-and-finances-design.md` §3). Nothing here reads or
 * writes the save — callers (advanceDay, cupWorld, continentalWorld) apply the numbers.
 */

/** League merit (paid at rollover): position 1..n, n clubs. n < 2 has no spread — pays 0. */
export function leaguePrize(broadcasting: number, position: number, n: number): number {
  if (n < 2) return 0;
  const merit = (broadcasting * LEAGUE_PRIZE.MERIT_SHARE * (n - position)) / (n - 1);
  const title = position === 1 ? broadcasting * LEAGUE_PRIZE.CHAMPION_SHARE : 0;
  return Math.round(merit + title);
}

/** Cup: prize for winning `stage` (final = champion — the champion is paid this, not runner-up + champion). */
export function cupStagePrize(tier1MeanBroadcasting: number, stage: CupStageName): number {
  return Math.round(tier1MeanBroadcasting * CUP_STAGE_SHARE[stage]);
}

/** Cup: prize for losing the final (runner-up). */
export function cupRunnerUpPrize(tier1MeanBroadcasting: number): number {
  return Math.round(tier1MeanBroadcasting * CUP_RUNNER_UP_SHARE);
}

/** Continental: amount for one event kind, for the given competition. */
export function continentalPrize(
  slug: ContinentalSlug,
  what: "participation" | "groupWin" | "groupDraw" | "r16" | "qf" | "sf" | "final" | "title",
): number {
  return CONTINENTAL_PRIZE[slug][what];
}

/**
 * AI share of a prize, capped: returns the new `aiTransferBudget`. Adds `AI_PRIZE_SHARE` of the
 * prize, never taking the budget above `MAX_BALANCE_RATIO × seasonalGrant` (the same cap
 * `applyAITransferSale` uses, `AI_FINANCE_CONFIG.TRANSFER_BUDGET.MAX_BALANCE_RATIO`), and never
 * lowering a budget already at or above that cap.
 *
 * `current` is the club's transfer budget BEFORE the prize — callers pass
 * `aiTransferBudgetOf(squad)` (absent `squad.aiTransferBudget` means the full seasonal grant, see
 * `src/Domain/aiFinance/aiClubFinance.ts`), not `squad.aiTransferBudget` directly.
 */
export function aiBudgetWithPrize(current: number, prize: number, seasonalGrant: number): number {
  const cap = seasonalGrant * AI_FINANCE_CONFIG.TRANSFER_BUDGET.MAX_BALANCE_RATIO;
  if (current >= cap) return current;
  return Math.min(cap, current + Math.round(prize * AI_PRIZE_SHARE));
}
