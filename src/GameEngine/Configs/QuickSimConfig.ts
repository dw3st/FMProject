// src/GameEngine/Configs/QuickSimConfig.ts
/**
 * QuickSimConfig — tunable constants for the statistical match simulator used by
 * leagues the player is not following. Calibrate with `bun scripts/quicksim-calibrate.ts`.
 */

export type LineGroup = "GK" | "DEF" | "MID" | "FWD";

export const ROLE_GROUP: Record<string, LineGroup> = {
  GK: "GK",
  CB: "DEF", LB: "DEF", RB: "DEF", LWB: "DEF", RWB: "DEF",
  CDM: "MID", DM: "MID", CM: "MID", CAM: "MID", AM: "MID", LM: "MID", RM: "MID",
  LW: "FWD", RW: "FWD", ST: "FWD", CF: "FWD",
  // Real squads (src/example_data) store main roles in `positions[0]`, not detailed roles.
  Defender: "DEF", Midfielder: "MID", Forward: "FWD",
};

/** Midfield roles that also count toward the attack strength. */
export const ATTACKING_MID_ROLES = ["CAM", "AM", "LM", "RM"] as const;
/** Midfield roles that also count toward the defense strength. */
export const DEFENSIVE_MID_ROLES = ["CDM", "DM"] as const;

export const QUICK_SIM_CONFIG = {
  /** Expected goals for one side when both teams are equal and at LEVEL_REF, before home advantage. */
  BASE_GOALS: 0.74,
  HOME_ADVANTAGE: 1.07,
  /**
   * Exponent on (atk × mid) / (def × gk). Also carries league-wide imbalance: derived (of_*) squads
   * have defence/GK strong vs attack, and the engine scores far less there than level alone predicts.
   * Refitted jointly with PACE_EDGE_WEIGHT (the pace edge took over part of what this carried).
   */
  STRENGTH_EXPONENT: 0.54,
  /**
   * xG × e^(PACE_EDGE_WEIGHT × (attacker forward-line pace − defender back-line pace)), pace =
   * (3·speed + acceleration)/4 on raw 0–10 attributes. The engine's goal spread between leagues of
   * equal level follows this edge (Premier League +0.94 → many goals, Bundesliga +0.10 → few): it
   * drives chance volume via through-ball races, not conversion. Fitted with
   * `bun scripts/quicksim-spread.ts analyze`. 0 disables.
   */
  PACE_EDGE_WEIGHT: 0.26,
  /**
   * Goals per side ~ Binomial(GOAL_CHANCES, xG / GOAL_CHANCES). Fewer chances → less variance
   * than Poisson → fewer 0-0s (the full engine is under-dispersed). Also caps goals/side.
   */
  GOAL_CHANCES: 6,
  /**
   * σ of the per-match "dominance" d ~ N(0, σ): home xG × e^(d−σ²/2), away xG × e^(−d−σ²/2).
   * Anti-correlates the two sides' chances → more lopsided results, fewer draws. 0 disables.
   */
  DOMINANCE_SIGMA: 0.35,
  /**
   * Match level (mean of both XIs' mean line strength, floor included) at which the level
   * term is 1 — BASE_GOALS applies as-is at this level.
   */
  LEVEL_REF: 5,
  /**
   * xG × (matchLevel / LEVEL_REF)^LEVEL_EXPONENT. The full engine scores more between strong
   * teams than between weak ones at the same strength ratio. 0 disables.
   */
  LEVEL_EXPONENT: 0.8,
  /** Added to every line strength (0–10 attribute averages) to avoid division by ~0. */
  STRENGTH_FLOOR: 0.5,
  /** Strength multiplier lost at 0 fitness (linear): factor = 1 − FATIGUE_PENALTY × (1 − fitness/100). */
  FATIGUE_PENALTY: 0.3,

  /** No finishing: in the engine it only nudges conversion (shooterEffect 0.85–1.2); it still picks the scorer (fillSide). */
  ATTACK_KEYS:     ["dribbling", "speed", "acceleration"],
  MIDFIELD_KEYS:   ["passing", "vision", "pressing"],
  DEFENSE_KEYS:    ["tackling", "pressing", "strength", "heading"],
  GOALKEEPER_KEYS: ["reflex", "jump", "pressing"],

  ROLE_GOAL_WEIGHT:   { GK: 0,    DEF: 0.01, MID: 0.15, FWD: 1.5 } as Record<LineGroup, number>,
  ROLE_ASSIST_WEIGHT: { GK: 0.04, DEF: 0.3,  MID: 0.26, FWD: 0.39 } as Record<LineGroup, number>,
  NO_ASSIST_RATE: 0.19,
  /** Non-goal shots per unit of xG. */
  SHOTS_PER_XG: 1.5,

  /** Regular passes only — the engine counts through balls in their own family, not as passes. */
  PASSES_PER_MATCH:        { GK: 2.4, DEF: 0.8, MID: 0.1, FWD: 0.6 } as Record<LineGroup, number>,
  /** Engine completion is ~96% (only interceptions/offside fail a regular pass). */
  PASS_COMPLETION_BASE: 0.92,
  PASS_COMPLETION_SKILL: 0.08,
  TACKLES_PER_MATCH:       { GK: 0, DEF: 0.26, MID: 0.12, FWD: 0.22 } as Record<LineGroup, number>,
  INTERCEPTIONS_PER_MATCH: { GK: 0, DEF: 0.08, MID: 0.09, FWD: 0.09 } as Record<LineGroup, number>,
  /** Failed tackles sampled as Poisson(TACKLES_PER_MATCH[group] × TACKLE_FAIL_RATIO), independent of the won-tackle roll. */
  TACKLE_FAIL_RATIO: 2.1,

  /** Energy spent over 90' for an average-stamina player. */
  ENERGY_DRAIN: 35,
} as const;
