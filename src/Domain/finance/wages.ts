import { WAGE_CONFIG } from "@/Domain/finance/wageConfig";
import { gateRevenue } from "@/Domain/finance/gate";
import { Player } from "@/Domain/Player";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * A typical division size (20 clubs) gives 19 home games — used only by the on-the-fly fallback
 * in `wageFactorOf` (and, by extension, `aiClubFinance`) when a squad has no stored `wageFactor`
 * and the caller doesn't know its real league size (a bare `Squad` carries no league-membership
 * info). `SaveService.createSave` and the season-rollover path in `advanceDay.ts` always pass the
 * real count.
 */
export const FALLBACK_HOME_GAMES = 19;

/**
 * Relative pay curve: how much a player's weekly wage scales with their 0–10 rating, in the
 * SAME real-euro units the club factor below corrects to an actual wage bill. This curve alone
 * cannot fit every club — clubs of the same nominal tier can differ in revenue by orders of
 * magnitude far more than their players differ in rating (see `wageConfig.ts`) — so it only sets
 * the SHAPE (how much more a rating-7 player costs than a rating-6 one) and the FLOOR; the level
 * is corrected per club by `clubWageFactor`.
 */
export function weeklyWage(rating: number): number {
  return Math.round(
    Math.max(WAGE_CONFIG.FLOOR, WAGE_CONFIG.SCALE * Math.pow(Math.max(rating, 0), WAGE_CONFIG.GROWTH)),
  );
}

/** Sum of the raw curve wage (no club factor) across a squad — the baseline `clubWageFactor` corrects. */
export function squadCurveBill(players: RosterPlayer[]): number {
  return players.reduce((sum, p) => sum + weeklyWage(Player.overallAvg(p)), 0);
}

/**
 * Per-club wage multiplier: corrects the curve's raw wage bill so the ACTUAL annual wage bill
 * lands at `TARGET_SHARE` (60%) of the club's annual revenue, clamped to `[MIN_FACTOR, MAX_FACTOR]`
 * so neither a very rich nor a very poor club (relative to what the curve alone would predict for
 * its roster) gets an absurd correction.
 */
export function clubWageFactor(revenue: number, curveBill: number): number {
  if (curveBill <= 0) return WAGE_CONFIG.MAX_FACTOR;
  const raw = (WAGE_CONFIG.TARGET_SHARE * revenue) / (52 * curveBill);
  return Math.min(WAGE_CONFIG.MAX_FACTOR, Math.max(WAGE_CONFIG.MIN_FACTOR, raw));
}

/** A player's actual weekly wage at their club: the curve wage times the club's factor. */
export function playerWeeklyWage(p: RosterPlayer, factor: number): number {
  return Math.round(weeklyWage(Player.overallAvg(p)) * factor);
}

export function squadWeeklyWages(players: RosterPlayer[], factor: number): number {
  return players.reduce((sum, p) => sum + playerWeeklyWage(p, factor), 0);
}

/**
 * Estimated annual revenue: broadcasting + commercial + an estimated league gate
 * (`gateRevenue` at league price × the club's home games this season). `homeGames` is normally
 * `clubsInLeague - 1` — the caller (career creation, season rollover, the calibration script)
 * knows the real league size; `wageFactorOf`'s on-the-fly fallback below uses a typical default.
 */
export function clubAnnualRevenue(squad: Squad, homeGames: number): number {
  const finances = squad.finances;
  const base = (finances?.broadcasting ?? 0) + (finances?.commercial ?? 0);
  const capacity = squad.venue?.capacity ?? 0;
  const gate = gateRevenue(capacity, "league") * Math.max(0, homeGames);
  return base + gate;
}

/**
 * The squad's wage factor: the stored value (set at career creation and refreshed at every
 * season rollover, once the club's tier-adjusted revenue for the season ahead is known) or, when
 * absent, computed on the fly from the squad's current finances and roster.
 */
export function wageFactorOf(squad: Squad, homeGames: number = FALLBACK_HOME_GAMES): number {
  if (typeof squad.wageFactor === "number") return squad.wageFactor;
  return clubWageFactor(clubAnnualRevenue(squad, homeGames), squadCurveBill(squad.players));
}
