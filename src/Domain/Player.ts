import { weeklyWage } from "@/Domain/finance/wages";
import {
  bestSpecificRole,
  computeOverallAvg,
  overallAvg,
  weightedScore,
} from "@/Domain/playerRating";
import { formatWageShort } from "@/Domain/money";

export type StatusLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Roster player model: weighted overall, age, market value, wage, and status bands.
 *
 * The rating math (`weightedScore`, `bestSpecificRole`, `computeOverallAvg`, `overallAvg`) lives
 * in the leaf module `src/Domain/playerRating.ts` and is re-exposed here as static methods —
 * `wages.ts` needs a player's rating to compute the wage curve, and `Player.ts` needs `weeklyWage`
 * from `wages.ts` for `salaryLabel`, so the rating math can't live in this file without creating a
 * `wages.ts` → `Player.ts` → `wages.ts` import cycle.
 */
export class Player {
  constructor(
    readonly overallRating: number,
    readonly age: number,
  ) {}

  static weightedScore = weightedScore;
  static bestSpecificRole = bestSpecificRole;
  static computeOverallAvg = computeOverallAvg;
  static overallAvg = overallAvg;

  /** Form band from last 5 ratings average; empty list uses 6.0 baseline. */
  static formToStatus(recentRatings: number[]): StatusLevel {
    const avg =
      recentRatings.length > 0
        ? recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length
        : 6.0;
    if (avg >= 7.5) return 5;
    if (avg >= 7.0) return 4;
    if (avg >= 6.5) return 3;
    if (avg >= 6.0) return 2;
    return 1;
  }

  static moraleToStatus(morale: number): StatusLevel {
    if (morale >= 85) return 5;
    if (morale >= 70) return 4;
    if (morale >= 50) return 3;
    if (morale >= 30) return 2;
    return 1;
  }

  /** `points` is the accumulated training score (0–5). Maps directly to intensity bands. */
  static trainingToStatus(points: number): StatusLevel {
    if (points > 4) return 5;
    if (points > 2) return 4;
    if (points > 1) return 3;
    if (points > 0) return 2;
    return 1;
  }

  /**
   * Estimated value in millions of € (float), before rounding to whole euros.
   *
   * Age curve is biased toward youth: a 19-year-old with decent ability commands
   * a steep premium over the same rating at peak, reflecting years of expected
   * growth. Veterans decline sharply after 30.
   */
  get valueMillions(): number {
    const base = this.overallRating * this.overallRating * 0.8;
    const a = this.age;
    const ageFactor =
      a <= 19 ? 2.4 :
      a <= 21 ? 2.0 :
      a <= 23 ? 1.6 :
      a <= 25 ? 1.3 :
      a <= 28 ? 1.0 :
      a <= 30 ? 0.75 :
      a <= 32 ? 0.50 :
      a <= 34 ? 0.30 :
      0.15;
    return base * ageFactor;
  }

  /** Estimated transfer value in whole euros. */
  get price(): number {
    return Math.round(this.valueMillions) * 1_000_000;
  }

  /** Short label for cards / lists (e.g. `"12.5M"`). */
  get priceLabel(): string {
    const v = this.valueMillions;
    if (v >= 100) return `${Math.round(v)}M`;
    return `${v.toFixed(1)}M`;
  }

  /**
   * Weekly wage label (e.g. `"45k"`) — the shared wage curve (`weeklyWage`,
   * `src/Domain/finance/wages.ts`) times the player's club's wage factor. `factor` defaults to 1
   * (the curve's raw, uncorrected wage) for callers with no squad in scope; pass
   * `wageFactorOf(squad)` for the real figure at a specific club.
   */
  salaryLabel(factor: number = 1): string {
    return formatWageShort(weeklyWage(this.overallRating) * factor);
  }
}
