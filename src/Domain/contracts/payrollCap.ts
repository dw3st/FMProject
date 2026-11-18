import { squadWeeklyWages, wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { Squad } from "@/types/playerTypes";

/**
 * Hard ceiling on the human club's weekly wage bill (report 2026-11-18): a signing or a renewal that raises the
 * bill above this share of the weekly revenue basis (`wageRevenueBasisOf / 52`) is refused (409 `payrollCap`). The
 * contract screen warns earlier, at `PAYROLL_WARN_SHARE` (0.70).
 */
export const PAYROLL_CAP_SHARE = 0.85;

export interface PayrollCapRefusal {
  /** The weekly bill the deal would leave. */
  bill: number;
  /** The most the bill may be. */
  cap: number;
}

/**
 * `newWage` joining the bill. `leaving`: wages that leave with the deal (a renewal's old wage, a swapped player, the
 * share of a player already here on loan). `pending`: wages already promised that are not on the bill yet (signed
 * pre-contracts). A deal that does not raise the bill (`newWage <= leaving`) is always allowed. Pure.
 */
export function payrollCapRefusal(
  squad: Squad, newWage: number, opts: { leaving?: number; pending?: number } = {},
): PayrollCapRefusal | null {
  const leaving = opts.leaving ?? 0;
  if (newWage <= leaving) return null;
  const bill = squadWeeklyWages(squad.players, wageFactorOf(squad)) - leaving + (opts.pending ?? 0) + newWage;
  const cap = Math.round((wageRevenueBasisOf(squad) / 52) * PAYROLL_CAP_SHARE);
  return bill > cap ? { bill, cap } : null;
}
