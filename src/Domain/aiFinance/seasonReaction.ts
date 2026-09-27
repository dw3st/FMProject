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
  /**
   * The club reached the final (or won it) of one of its continental competitions this season —
   * treated as a "good" season with the same weight as a top-15% domestic finish, regardless of
   * the club's actual league position (design spec §3 "IA" / `.claude/rules/AI-clubs/finance.md`).
   * Feeds BOTH `seasonPerformance`/`nextFinancialTier`'s tier-step logic AND (via `followersChange`,
   * which calls `seasonPerformance`) the HUMAN club's followers reaction — `applyHumanSeasonReaction`
   * shares the exact same `ClubSeasonOutcome` the AI path uses, so a human finalist/champion gets
   * the same followers boost an AI one would. It does NOT unlock ELITE on its own — see
   * `continentalTitle` below, which is the stricter, separate flag for that.
   */
  continentalGood?: boolean;
  /**
   * The club WON (not just reached) a continental competition this season. Counts as a "title" for
   * `nextFinancialTier`'s ELITE-entry gate, exactly like being domestic champion (`o.rank === 1`) —
   * a continental trophy is at least as prestigious. Always a subset of `continentalGood` (the
   * champion also reached the final), but tracked separately because reaching the final alone must
   * NOT unlock ELITE (only winning it, or winning the domestic league, does).
   */
  continentalTitle?: boolean;
}

/**
 * Performance in [-1, 1]: +1 champion, 0 mid-table, -1 last. 0 when there is no table.
 * `continentalGood` floors the domestic fraction at `TOP_FRAC` (never makes a genuinely better
 * league finish look worse), so a continental finalist/champion always performs at least as well
 * as a club that finished right at the top-15% cutoff.
 */
export function seasonPerformance(o: ClubSeasonOutcome): number {
  const s = AI_FINANCE_CONFIG.season;
  if (!o.played || o.leagueSize < 2) {
    return o.continentalGood ? 1 - 2 * s.TOP_FRAC : 0;
  }
  const frac = (o.rank - 1) / (o.leagueSize - 1);
  const effectiveFrac = o.continentalGood ? Math.min(frac, s.TOP_FRAC) : frac;
  return 1 - 2 * Math.max(0, Math.min(1, effectiveFrac));
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
  else if (o.continentalGood) step = 1;
  else if (o.played && o.leagueSize >= 2) {
    const frac = (o.rank - 1) / (o.leagueSize - 1);
    if (frac <= s.TOP_FRAC) step = 1;
    else if (frac >= s.BOTTOM_FRAC) step = -1;
  }
  let idx = tierIndex(current) + step;
  const hasTitle = (o.played && o.rank === 1) || o.continentalTitle === true;
  if (step > 0 && tierAt(idx) === "ELITE" && current !== "ELITE" && !hasTitle) idx -= 1;
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

/**
 * An AI club's outcome from its league's final table (old membership) and the rollover moves.
 * `continental`, when given, is read once per day from the continental competitions' metas (see
 * `continentalGoodClubsThisSeason`, continentalWorld.ts): `good` is every club that reached a
 * final (or won it) this season, `title` is the (smaller) set that actually won it — a champion
 * is always in both.
 *
 * KNOWN GAP (documented for Task 9's docs pass, `.claude/rules/AI-clubs/finance.md`): this only
 * sees finals that are ALREADY DRAWN on disk at the moment a country's league rolls over. A
 * continental competition's final is typically drawn well after most leagues end (semis run into
 * April/May), so in practice this only ever fires for the handful of leagues that roll over LATE
 * enough in the year — chiefly the calendar-year European leagues (Belarus, Finland, Georgia,
 * Iceland, Norway, Sweden — `.claude/rules/game/continental.md`), which roll over in December,
 * well after the continental final. A cross-year league (Aug–May, e.g. Premier League) rolls over
 * in the summer, generally AFTER the continental final too, so it isn't actually excluded — but
 * the set is read at the moment THAT SPECIFIC country's rollover runs, so a country whose league
 * ends unusually early relative to the continental calendar could still miss a final decided
 * later. No fix attempted here — flagging the timing dependency for whoever revisits this.
 */
export function clubSeasonOutcome(
  table: StandingRow[],
  squadId: string,
  moves: ReadonlyArray<Pick<ClubMove, "squadId" | "kind">>,
  continental?: { good?: ReadonlySet<string>; title?: ReadonlySet<string> },
): ClubSeasonOutcome {
  const idx = table.findIndex((r) => r.squadId === squadId);
  const row = idx >= 0 ? table[idx]! : null;
  return {
    rank: idx >= 0 ? idx + 1 : table.length,
    leagueSize: table.length,
    played: !!row && (row.mp ?? 0) > 0,
    move: moves.find((m) => m.squadId === squadId)?.kind ?? null,
    ...(continental?.good?.has(squadId) ? { continentalGood: true } : {}),
    ...(continental?.title?.has(squadId) ? { continentalTitle: true } : {}),
  };
}
