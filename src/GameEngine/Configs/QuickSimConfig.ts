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
};

/** Midfield roles that also count toward the attack strength. */
export const ATTACKING_MID_ROLES = ["CAM", "AM", "LM", "RM"] as const;
/** Midfield roles that also count toward the defense strength. */
export const DEFENSIVE_MID_ROLES = ["CDM", "DM"] as const;

export const QUICK_SIM_CONFIG = {
  /** Expected goals for one side when both teams are equal, before home advantage. */
  BASE_GOALS: 1.3,
  HOME_ADVANTAGE: 1.12,
  /** Exponent on (atk × mid) / (def × gk). < 1 compresses mismatches. */
  STRENGTH_EXPONENT: 0.5,
  /** Added to every line strength (0–10 attribute averages) to avoid division by ~0. */
  STRENGTH_FLOOR: 0.5,
  /** Strength multiplier lost at 0 fitness (linear): factor = 1 − FATIGUE_PENALTY × (1 − fitness/100). */
  FATIGUE_PENALTY: 0.3,

  ATTACK_KEYS:     ["finishing", "dribbling", "speed", "acceleration"],
  MIDFIELD_KEYS:   ["passing", "vision", "pressing"],
  DEFENSE_KEYS:    ["tackling", "pressing", "strength", "heading"],
  GOALKEEPER_KEYS: ["reflex", "jump", "pressing"],

  ROLE_GOAL_WEIGHT:   { GK: 0,    DEF: 0.15, MID: 0.5, FWD: 1.5 } as Record<LineGroup, number>,
  ROLE_ASSIST_WEIGHT: { GK: 0.02, DEF: 0.3,  MID: 1.0, FWD: 0.8 } as Record<LineGroup, number>,
  NO_ASSIST_RATE: 0.3,
  /** Non-goal shots per unit of xG. */
  SHOTS_PER_XG: 8,

  PASSES_PER_MATCH:        { GK: 15, DEF: 35, MID: 40, FWD: 20 } as Record<LineGroup, number>,
  PASS_COMPLETION_BASE: 0.6,
  PASS_COMPLETION_SKILL: 0.3,
  TACKLES_PER_MATCH:       { GK: 0, DEF: 2.0, MID: 1.5, FWD: 0.5 } as Record<LineGroup, number>,
  INTERCEPTIONS_PER_MATCH: { GK: 0, DEF: 1.5, MID: 1.0, FWD: 0.3 } as Record<LineGroup, number>,

  /** Energy spent over 90' for an average-stamina player. */
  ENERGY_DRAIN: 35,
} as const;
