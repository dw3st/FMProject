import { playerWeeklyWage, wageFactorOf } from "@/Domain/finance/wages";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * First professional contract of an academy player (report 2026-11-18: at Brusque a promoted 41-rated kid asked
 * €34k a week, the best-paid in a squad of 25-30-rated players): half the curve, never above twice the squad's
 * median wage. An empty squad (tests) keeps the half curve.
 */
export const FIRST_CONTRACT = { CURVE_SHARE: 0.5, MEDIAN_MULT: 2, FLOOR: 200 } as const;

export function firstProWage(squad: Squad, player: RosterPlayer): number {
  const half = playerWeeklyWage(player, wageFactorOf(squad)) * FIRST_CONTRACT.CURVE_SHARE;
  const wages = squad.players.map((p) => p.contract?.wage ?? 0).filter((w) => w > 0).sort((a, b) => a - b);
  const median = wages.length > 0 ? wages[Math.floor(wages.length / 2)]! : Infinity;
  return Math.max(FIRST_CONTRACT.FLOOR, Math.round(Math.min(half, median * FIRST_CONTRACT.MEDIAN_MULT)));
}
