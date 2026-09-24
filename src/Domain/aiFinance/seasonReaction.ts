import { AI_FINANCE_CONFIG } from "@/Domain/aiFinance/aiFinanceConfig";
import {
  financialTierOf, naturalFinancialTier, popularityFromFollowers, seasonalTransferBudgetFor, tierAt, tierIndex,
} from "@/Domain/aiFinance/aiClubFinance";
import type { FinancialTier, Squad, StandingRow } from "@/types/playerTypes";
import type { ClubMove } from "@/types/pyramidTypes";

/** How an AI club's season went, from its league's final table. */
export interface ClubSeasonOutcome {
  /** 1 = champion. */
  rank: number;
  leagueSize: number;
  /** False when the league played no games: no performance reaction (moves still apply). */
  played: boolean;
  move: "promoted" | "relegated" | null;
}

/**
 * Performance in [-1, 1]: +1 champion, 0 mid-table, -1 last. 0 when there is no table.
 */
export function seasonPerformance(o: ClubSeasonOutcome): number {
  if (!o.played || o.leagueSize < 2) return 0;
  const frac = (o.rank - 1) / (o.leagueSize - 1);
  return 1 - 2 * Math.max(0, Math.min(1, frac));
}

/** Relative followers change for the season (e.g. 0.08 = +8%), with soft balancing by tier. */
export function followersChange(o: ClubSeasonOutcome, tier: FinancialTier): number {
  const s = AI_FINANCE_CONFIG.season;
  const perf = seasonPerformance(o);
  let gain = perf > 0 ? perf * s.FOLLOWERS_GOOD_GAIN : 0;
  let loss = perf < 0 ? -perf * s.FOLLOWERS_BAD_LOSS : 0;
  if (o.played && o.rank === 1) gain += s.CHAMPION_BONUS;
  if (o.move === "promoted") gain += s.PROMOTED_BONUS;
  if (o.move === "relegated") loss += s.RELEGATED_LOSS;
  return gain * s.GAIN_MULT[tier] - loss * s.LOSS_MULT[tier];
}

/**
 * Next season's tier: one step up for a promotion or a top finish, one step down for a
 * relegation or a bottom finish (a promotion/relegation already is the season's result, so
 * table position does not stack on top of it). Moving INTO ELITE needs a title.
 * The result is clamped to `MAX_DRIFT_FROM_NATURAL` steps around the natural tier of the club's
 * (new) income, so tiers stay anchored to the league the club plays in and self-correct.
 */
export function nextFinancialTier(current: FinancialTier, natural: FinancialTier, o: ClubSeasonOutcome): FinancialTier {
  const s = AI_FINANCE_CONFIG.season;
  let step = 0;
  if (o.move === "promoted") step = 1;
  else if (o.move === "relegated") step = -1;
  else if (o.played && o.leagueSize >= 2) {
    const frac = (o.rank - 1) / (o.leagueSize - 1);
    if (frac <= s.TOP_FRAC) step = 1;
    else if (frac >= s.BOTTOM_FRAC) step = -1;
  }
  let idx = tierIndex(current) + step;
  if (step > 0 && tierAt(idx) === "ELITE" && current !== "ELITE" && !(o.played && o.rank === 1)) idx -= 1;
  const nat = tierIndex(natural);
  const d = s.MAX_DRIFT_FROM_NATURAL;
  return tierAt(Math.max(nat - d, Math.min(nat + d, idx)));
}

/** Followers after the season's reaction (soft-balanced by `tier`), floored. */
export function reactFollowers(followers: number, outcome: ClubSeasonOutcome, tier: FinancialTier): number {
  return Math.max(
    AI_FINANCE_CONFIG.season.FOLLOWERS_FLOOR,
    Math.round(followers * (1 + followersChange(outcome, tier))),
  );
}

/**
 * Season rollover reaction of an AI club. Call on the RESET squad, after the tier income change
 * (`applyTierFinanceChange`) so the natural tier reflects the new division. Updates followers,
 * stores the new `financialTier` and grants next season's transfer budget from the new tier +
 * popularity (replacing whatever was left: AI money never accumulates, so no club stays broke).
 * Pure; a squad without finances gets a tier and a budget from popularity 0.
 */
export function applyAISeasonReaction(squad: Squad, outcome: ClubSeasonOutcome): Squad {
  const current = financialTierOf(squad);
  const natural = naturalFinancialTier(squad.finances);
  const financialTier = nextFinancialTier(current, natural, outcome);
  const finances = squad.finances
    ? { ...squad.finances, followers: reactFollowers(squad.finances.followers, outcome, current) }
    : undefined;
  const aiTransferBudget = seasonalTransferBudgetFor(financialTier, popularityFromFollowers(finances?.followers ?? 0));
  return { ...squad, financialTier, aiTransferBudget, ...(finances ? { finances } : {}) };
}

/**
 * Season reaction of the HUMAN club: followers only (same performance / title / move rules and
 * soft balancing, using the natural tier of its income). No financial tier, no AI budget; the
 * full financial system is untouched. Returns the updated squad and the followers before/after.
 */
export function applyHumanSeasonReaction(
  squad: Squad,
  outcome: ClubSeasonOutcome,
): { squad: Squad; followersBefore: number; followersAfter: number } {
  const before = squad.finances?.followers ?? 0;
  if (!squad.finances) return { squad, followersBefore: before, followersAfter: before };
  const after = reactFollowers(before, outcome, naturalFinancialTier(squad.finances));
  return { squad: { ...squad, finances: { ...squad.finances, followers: after } }, followersBefore: before, followersAfter: after };
}

/** An AI club's outcome from its league's final table (old membership) and the rollover moves. */
export function clubSeasonOutcome(
  table: StandingRow[],
  squadId: string,
  moves: ReadonlyArray<Pick<ClubMove, "squadId" | "kind">>,
): ClubSeasonOutcome {
  const idx = table.findIndex((r) => r.squadId === squadId);
  const row = idx >= 0 ? table[idx]! : null;
  return {
    rank: idx >= 0 ? idx + 1 : table.length,
    leagueSize: table.length,
    played: !!row && (row.mp ?? 0) > 0,
    move: moves.find((m) => m.squadId === squadId)?.kind ?? null,
  };
}
