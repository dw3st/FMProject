import type { CupStageName, ContinentalSlug, ContinentalStageName } from "@/types/calendarTypes";
import type { ContinentalEvent } from "@/Domain/continental/continentalProgress";
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

/** The stage a club REACHED, from the `ContinentalStageName` it "advanced" out of. Skips "final" — the eventual champion's own "advanced,stage:final" event has no further stage; they're paid via the separate "champion" event. */
const STAGE_REACHED: Partial<Record<ContinentalStageName, "r16" | "qf" | "sf" | "final">> = {
  group: "r16", r16: "qf", qf: "sf", sf: "final",
};

/** One club's prize for one continental event, from `continentalStagePrizesFromEvents`. */
export interface ContinentalPrizeAward {
  clubId: string;
  amount: number;
  /** Which prize this is: the stage reached ("r16".."final"), or "title" (the champion event). */
  reason: "r16" | "qf" | "sf" | "final" | "title";
}

/**
 * Pure: the prize awards implied by one competition's `events` for a single played day
 * (`advanceContinentalStages`'s `ContinentalEvent[]` for one slug — see design spec §3
 * "Continental" and `.claude/rules/AI-clubs/finance.md`). Never reads or writes anything; callers
 * (advanceDay.ts) apply each award via `awardClubPrize`.
 *
 * - `{ kind: "advanced" }` pays the club for the stage it just REACHED — group→r16, r16→qf,
 *   qf→sf, sf→final (`STAGE_REACHED`). An `advanced` event with `stage: "final"` (the eventual
 *   champion, who "advances" out of the final into nothing) is skipped — no further stage exists,
 *   and the champion is paid separately below.
 * - `{ kind: "champion" }` pays the "title" bonus.
 * - Every other event kind (`eliminated`, `drawn`, `undecidedTie`) pays nothing.
 * - Each event produces at most one award, so a club is never double-paid for the same event —
 *   but a club CAN legitimately appear twice in the result if two different events both concern
 *   it the same day (e.g. reaching r16 AND, on a different day, later winning the final — not a
 *   same-day case since those are different `events` calls; within ONE `events` array a club
 *   appears at most once per "advanced"/"champion" pairing the engine can actually produce).
 */
export function continentalStagePrizesFromEvents(
  slug: ContinentalSlug,
  events: ReadonlyArray<ContinentalEvent>,
): ContinentalPrizeAward[] {
  const awards: ContinentalPrizeAward[] = [];
  for (const ev of events) {
    if (ev.kind === "advanced") {
      const reached = STAGE_REACHED[ev.stage];
      if (!reached) continue;
      awards.push({ clubId: ev.clubId, amount: continentalPrize(slug, reached), reason: reached });
    } else if (ev.kind === "champion") {
      awards.push({ clubId: ev.clubId, amount: continentalPrize(slug, "title"), reason: "title" });
    }
  }
  return awards;
}
