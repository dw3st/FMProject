export type Aptitude = "natural" | "apt" | "training" | "unsuitable";

/** Multiplier on a player's attributes when fielded in a slot, by aptitude. */
export const POSITION_PENALTY: Record<Aptitude, number> = {
  natural: 1.0,
  apt: 0.97,
  training: 0.9,
  unsuitable: 0.8,
};

/** Score thresholds, as a fraction of the natural role's score. */
export const APT_RATIO = 0.95;
export const TRAINING_RATIO = 0.88;
