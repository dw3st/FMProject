import { weeklyWage } from "@/Domain/finance/wages";
import {
  bestSpecificRole,
  computeOverallAvg,
  overallAvg,
  weightedScore,
} from "@/Domain/playerRating";
import { formatWageShort } from "@/Domain/money";

/**
 * Market value formula, fitted on the real Transfermarkt value of the 19,315 matched players of the recalibrated
 * world (`bun scripts/fitValueFormula.ts`, 2026-10-07): weighted least squares in log (each player weighted by
 * √value) of `log(value / 1e6) = log(VALUE_K) + VALUE_EXP × rating + log(age factor)`, the ≤ 28 band fixed at 1.
 * Median |log(game / real)| 2.76 with the old `0.8 × rating² × age` formula → 0.43; median game ÷ real 15.8 → 1.12.
 * A rating of 5.0 at 27 is worth ~€8M, 6.0 ~€43M, 6.5 ~€98M.
 */
export const VALUE_K = 0.001888;
export const VALUE_EXP = 1.671;
/** Age factor by band (upper age, factor), same fit. */
export const AGE_VALUE_FACTORS: readonly (readonly [maxAge: number, factor: number])[] = [
  [19, 1.70], [21, 1.56], [23, 1.25], [25, 1.13], [28, 1.0], [30, 0.80], [32, 0.58], [34, 0.47], [Infinity, 0.44],
];
/** Lowest transfer price (€0.1M): the fitted value of a weak or old player rounds to zero otherwise. */
export const MIN_PRICE = 100_000;

export function ageValueFactor(age: number): number {
  return AGE_VALUE_FACTORS.find(([max]) => age <= max)![1];
}

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
    /** Season-award market boost (`awardValueMult`, `.claude/rules/game/awards.md`); 1 = none. */
    readonly valueMult: number = 1,
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
   * Estimated value in millions of € (float), before rounding: `VALUE_K × e^(VALUE_EXP × rating) × age factor`.
   * Constants fitted on the real Transfermarkt value (`VALUE_K` above, `scripts/fitValueFormula.ts`).
   */
  get valueMillions(): number {
    return VALUE_K * Math.exp(VALUE_EXP * this.overallRating) * ageValueFactor(this.age) * this.valueMult;
  }

  /**
   * Estimated transfer value in euros, on the fee grid (€0.1M below €10M, €1M from there), never below
   * `MIN_PRICE`.
   */
  get price(): number {
    const v = this.valueMillions;
    const euros = v < 10 ? Math.round(v * 10) * 100_000 : Math.round(v) * 1_000_000;
    return Math.max(MIN_PRICE, euros);
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
