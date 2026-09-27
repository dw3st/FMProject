import { WAGE_CONFIG } from "@/Domain/finance/wageConfig";
import { Player } from "@/Domain/Player";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * The single wage curve: a player's weekly wage in real euros from their 0–10 rating.
 * Power-law form (`SCALE × rating^GROWTH`), calibrated on the real world by
 * `scripts/wage-calibrate.ts` — see `wageConfig.ts` for the full calibration writeup.
 */
export function weeklyWage(rating: number): number {
  return Math.round(
    Math.max(WAGE_CONFIG.FLOOR, WAGE_CONFIG.SCALE * Math.pow(Math.max(rating, 0), WAGE_CONFIG.GROWTH)),
  );
}

/** Uses the same rating `estimateWeeklyWage` uses today (`Player.overallAvg`, cached on the player). */
export function playerWeeklyWage(p: RosterPlayer): number {
  return weeklyWage(Player.overallAvg(p));
}

export function squadWeeklyWages(players: RosterPlayer[]): number {
  return players.reduce((sum, p) => sum + playerWeeklyWage(p), 0);
}
