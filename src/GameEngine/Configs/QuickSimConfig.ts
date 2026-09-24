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

  /**
   * Who scores / shoots (× (0.5 + finishing/10) per player) and who assists (× (0.5 + passing/10)).
   * These are shares within the team, so they match the engine's line shares, subs included:
   * quickSim has no subs, and each starter carries his whole slot.
   */
  ROLE_GOAL_WEIGHT:   { GK: 0, DEF: 0, MID: 0.113, FWD: 1.533 } as Record<LineGroup, number>,
  ROLE_ASSIST_WEIGHT: { GK: 0.015, DEF: 0.219, MID: 0.284, FWD: 0.544 } as Record<LineGroup, number>,
  /** 1 − the engine's assists per goal. */
  NO_ASSIST_RATE: 0.143,
  /**
   * Non-goal shots per unit of (match-day) xG, at match level LEVEL_REF, scaled by
   * (matchLevel / LEVEL_REF)^SHOTS_LEVEL_EXPONENT: the engine's weak leagues shoot more per goal
   * (they convert less).
   */
  SHOTS_PER_XG: 1.922,
  SHOTS_LEVEL_EXPONENT: -1.03,

  /**
   * Regular passes per starting slot at team level LEVEL_REF — the engine counts through balls in
   * their own family, not as passes. quickSim has no substitutes, so the target is the engine's
   * line total / starting slots (not per player who appeared). Scaled by
   * (ownTeamLevel / LEVEL_REF)^PASS_LEVEL_EXPONENT[group]. Fitted against the engine with the
   * midfield passing-hub levers (26 leagues, `bun scripts/quicksim-spread.ts events`).
   */
  PASSES_PER_MATCH:        { GK: 2.095, DEF: 2.124, MID: 2.387, FWD: 1.102 } as Record<LineGroup, number>,
  /** Weak teams pass less in the engine, mostly in midfield (Kenya MID 1.32 vs Premier 2.36 per slot). */
  PASS_LEVEL_EXPONENT:     { GK: 0.23, DEF: 0.34, MID: 1.01, FWD: 0.72 } as Record<LineGroup, number>,
  /** Engine completion is ~97.5% (only interceptions/offside fail a regular pass); passing barely moves it. */
  PASS_COMPLETION_BASE: 0.973,
  PASS_COMPLETION_SKILL: 0.004,
  /**
   * Won tackles / interceptions per starting slot (the engine's line total ÷ starting slots) at
   * team level LEVEL_REF, per unit of the player factor (0.5 + tackling/10, resp. pressing/10).
   * Scaled by (ownTeamLevel / LEVEL_REF)^…_LEVEL_EXPONENT[group]. Fitted with
   * `bun scripts/quicksim-spread.ts events`.
   */
  TACKLES_PER_MATCH:            { GK: 0, DEF: 0.54, MID: 0.189, FWD: 0.369 } as Record<LineGroup, number>,
  TACKLE_LEVEL_EXPONENT:        { GK: 0, DEF: -0.2, MID: -0.74, FWD: -0.09 } as Record<LineGroup, number>,
  INTERCEPTIONS_PER_MATCH:      { GK: 0, DEF: 0.124, MID: 0.152, FWD: 0.161 } as Record<LineGroup, number>,
  INTERCEPTION_LEVEL_EXPONENT:  { GK: 0, DEF: 0.6, MID: 1.04, FWD: 1.24 } as Record<LineGroup, number>,
  /**
   * Failed tackles per starting slot at LEVEL_REF, × (ownTeamLevel / LEVEL_REF)^TACKLE_FAIL_LEVEL_EXPONENT.
   * Independent of the won-tackle roll. The exponents follow the engine; the rates are set so each
   * line's mean starter rating matches the engine's (a quickSim starter also carries the events of
   * the sub who would replace him, so the rates sit off the engine's per-slot counts).
   */
  TACKLES_FAILED_PER_MATCH:     { GK: 0, DEF: 1.068, MID: 0.364, FWD: 1.076 } as Record<LineGroup, number>,
  TACKLE_FAIL_LEVEL_EXPONENT:   { GK: 0, DEF: -0.39, MID: -0.82, FWD: -0.3 } as Record<LineGroup, number>,

  /** Energy spent over 90' for an average-stamina player. */
  ENERGY_DRAIN: 35,
} as const;
