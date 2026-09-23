/** Squad training policy (persisted on save meta). */

export type TrainingIntensity = "light" | "normal" | "heavy";

export const DEFAULT_MIN_ENERGY_TO_TRAIN = 85;

export const DEFAULT_TRAINING_INTENSITY: TrainingIntensity = "normal";

/** Training points earned in one session [min, max]. Max total points is 5. */
export function trainingPointsRange(intensity: TrainingIntensity): [min: number, max: number] {
  switch (intensity) {
    case "light": return [0, 1];
    case "heavy": return [2, 4];
    default:      return [1, 2];
  }
}

/** Base fitness cost per session [min, max], before age adjustment. */
export function trainingFitnessCostRange(intensity: TrainingIntensity): [min: number, max: number] {
  switch (intensity) {
    case "light": return [2, 5];
    case "heavy": return [7, 13];
    default:      return [4, 8];
  }
}

/** Goalkeepers take this fraction of outfield training fitness loss. */
export const GOALKEEPER_TRAINING_FATIGUE_MULTIPLIER = 0.5;

export function isGoalkeeperPlayer(positions: readonly string[]): boolean {
  return positions.some((p) => p === "GK");
}

/** Older players pay more fitness per session. */
export function trainingAgeCostFactor(age: number): number {
  if (age <= 24) return 0.8;
  if (age <= 28) return 1.0;
  if (age <= 32) return 1.2;
  return 1.5;
}

const TRAINING_AGE_COST_MIN = 0.8;
const TRAINING_AGE_COST_MAX = 1.5;

/**
 * Rest recovery uses the same base roll as heavy training cost, but inverted age:
 * younger bodies recover faster; veterans recover less per rest day.
 */
export function restAgeRecoveryFactor(age: number): number {
  const c = trainingAgeCostFactor(age);
  return TRAINING_AGE_COST_MIN + TRAINING_AGE_COST_MAX - c;
}
