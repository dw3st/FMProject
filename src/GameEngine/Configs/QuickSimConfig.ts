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
  BASE_GOALS: 0.76,
  HOME_ADVANTAGE: 1.03,
  /**
   * Exponent on (atk × mid) / (def × gk). Also carries league-wide imbalance: derived (of_*) squads
   * have defence/GK strong vs attack, and the engine scores far less there than level alone predicts.
   * Refitted jointly with PACE_EDGE_WEIGHT (the pace edge took over part of what this carried).
   */
  STRENGTH_EXPONENT: 0.51,
  /**
   * xG × e^(PACE_EDGE_WEIGHT × (attacker forward-line pace − defender back-line pace)), pace =
   * (3·speed + acceleration)/4 on raw 0–10 attributes. The engine's goal spread between leagues of
   * equal level follows this edge (Premier League +0.94 → many goals, Bundesliga +0.10 → few): it
   * drives chance volume via through-ball races, not conversion. Fitted with
   * `bun scripts/quicksim-spread.ts analyze`. 0 disables.
   */
  PACE_EDGE_WEIGHT: 0.32,
  /**
   * Goals per side ~ Binomial(GOAL_CHANCES, xG / GOAL_CHANCES). Fewer chances → less variance
   * than Poisson → fewer 0-0s (the full engine is under-dispersed). Also caps goals/side.
   */
  GOAL_CHANCES: 6,
  /**
   * σ of the per-match "dominance" d ~ N(0, σ): home xG × e^(d−σ²/2), away xG × e^(−d−σ²/2).
   * Anti-correlates the two sides' chances → more lopsided results, fewer draws. 0 disables.
   * Lowered 0.35 → 0.25 (2026-09-26, #2 cross-league follow-up): at 0.35 the underdog won
   * cross-league ties ~1.6× as often as the full engine (a mean-preserving lognormal spread,
   * independent of team strength — it inflates upsets between UNEQUAL sides without touching
   * within-league W/D/L, where both sides draw the same dominance distribution on average). See
   * `.claude/rules/non-player-games.md` → "quickSim" → cross-league checks.
   */
  DOMINANCE_SIGMA: 0.25,
  /**
   * Match level (mean of both XIs' mean line strength, floor included) at which the level
   * term is 1 — BASE_GOALS applies as-is at this level.
   */
  LEVEL_REF: 5,
  /**
   * xG × (matchLevel / LEVEL_REF)^LEVEL_EXPONENT. The full engine scores more between strong
   * teams than between weak ones at the same strength ratio. 0 disables.
   */
  LEVEL_EXPONENT: 0.81,
  /** Added to every line strength (0–10 attribute averages) to avoid division by ~0. */
  STRENGTH_FLOOR: 0.5,
  /**
   * Strength multiplier lost at 0 fitness (linear): factor = 1 − FATIGUE_PENALTY × (1 − fitness/100).
   * Only `fitness` feeds this — `load` never does; load only raises `ENERGY_DRAIN_BY_LINE` (see
   * above), by design (`docs/superpowers/specs/2026-09-27-stamina-design.md` §1 "Motor ×
   * quickSim": the engine gets the load factor at kickoff, quickSim gets it in the drain).
   *
   * Kept at 0.3 after calibrating against the engine (`bun scripts/fatigue-calibrate.ts`, Part 2):
   * a fresh XI (fitness 100/load 0) vs a tired XI (fitness 70/load LOAD_HIGH) on the same
   * premier_league fixtures scored engine 90% fresh win / 7.8% draw / 2.2% tired win (90 matches),
   * vs quickSim's 45.5% / 20.8% / 33.7% at FATIGUE_PENALTY=0.3 — a real gap, expected from the
   * engine's continuous fatigue (physical stats keep degrading tick by tick, amplified by the
   * load-driven drain) against quickSim's single static discount from *start* fitness only.
   * Raising FATIGUE_PENALTY narrows that gap (e.g. 1.8 → 72.5%/16.4%/11%) but was rejected: every
   * quickSim calibration to date (`quicksim-calibrate.ts`, `quicksim-spread.ts`, the "Volume de
   * gols" tables in `.claude/rules/non-player-games.md`) runs BOTH sides at the same uniform
   * `emptySeasonLog()` fitness (75, no persisted `seasonLog` on world data), where a change to
   * FATIGUE_PENALTY does NOT cancel out between the two equal-fitness sides — verified directly
   * (holding fitness at 75 for an 11-a-side XI both ways, mean xG dropped from 1.27 at
   * FATIGUE_PENALTY=0.3 to 0.81 at 2.0, a 36% swing) because of the LEVEL_EXPONENT/STRENGTH_EXPONENT
   * curvature and the additive STRENGTH_FLOOR. Raising it enough to meaningfully close the
   * tired-vs-fresh gap (≥ ~1.5) would silently invalidate the whole per-league goal-volume
   * calibration (rms 6%, individual leagues within ~13%). Closing the gap properly needs `load`
   * (or an evolving in-match fitness) to feed team strength too, which the design explicitly
   * scopes to the full engine only — left as a known limitation, not a bug.
   */
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
  ROLE_GOAL_WEIGHT:   { GK: 0, DEF: 0, MID: 0.103, FWD: 1.542 } as Record<LineGroup, number>,
  ROLE_ASSIST_WEIGHT: { GK: 0.019, DEF: 0.222, MID: 0.277, FWD: 0.546 } as Record<LineGroup, number>,
  /** 1 − the engine's assists per goal. */
  NO_ASSIST_RATE: 0.131,
  /**
   * Non-goal shots per unit of (match-day) xG, at match level LEVEL_REF, scaled by
   * (matchLevel / LEVEL_REF)^SHOTS_LEVEL_EXPONENT: the engine's weak leagues shoot more per goal
   * (they convert less).
   */
  SHOTS_PER_XG: 1.754,
  SHOTS_LEVEL_EXPONENT: -1.17,

  /**
   * Regular passes per starting slot at team level LEVEL_REF — the engine counts through balls in
   * their own family, not as passes. quickSim has no substitutes, so the target is the engine's
   * line total / starting slots (not per player who appeared). Scaled by
   * (ownTeamLevel / LEVEL_REF)^PASS_LEVEL_EXPONENT[group]. Fitted against the engine with the
   * midfield passing-hub levers (26 leagues, `bun scripts/quicksim-spread.ts events`).
   */
  PASSES_PER_MATCH:        { GK: 2.159, DEF: 2.101, MID: 2.338, FWD: 1.128 } as Record<LineGroup, number>,
  /** Weak teams pass less in the engine, mostly in midfield (Kenya MID 1.32 vs Premier 2.36 per slot). */
  PASS_LEVEL_EXPONENT:     { GK: 0.15, DEF: 0.4, MID: 0.96, FWD: 0.67 } as Record<LineGroup, number>,
  /** Engine completion is ~97.5% (only interceptions/offside fail a regular pass); passing barely moves it. */
  PASS_COMPLETION_BASE: 0.971,
  PASS_COMPLETION_SKILL: 0.007,
  /**
   * Won tackles / interceptions per starting slot (the engine's line total ÷ starting slots) at
   * team level LEVEL_REF, per unit of the player factor (0.5 + tackling/10, resp. pressing/10).
   * Scaled by (ownTeamLevel / LEVEL_REF)^…_LEVEL_EXPONENT[group]. Fitted with
   * `bun scripts/quicksim-spread.ts events`.
   */
  TACKLES_PER_MATCH:            { GK: 0, DEF: 0.529, MID: 0.186, FWD: 0.362 } as Record<LineGroup, number>,
  TACKLE_LEVEL_EXPONENT:        { GK: 0, DEF: -0.16, MID: -0.79, FWD: -0.08 } as Record<LineGroup, number>,
  INTERCEPTIONS_PER_MATCH:      { GK: 0, DEF: 0.123, MID: 0.157, FWD: 0.175 } as Record<LineGroup, number>,
  INTERCEPTION_LEVEL_EXPONENT:  { GK: 0, DEF: 0.51, MID: 1.09, FWD: 1.37 } as Record<LineGroup, number>,
  /**
   * Failed tackles per starting slot at LEVEL_REF, × (ownTeamLevel / LEVEL_REF)^TACKLE_FAIL_LEVEL_EXPONENT.
   * Independent of the won-tackle roll. The exponents follow the engine; the rates are set so each
   * line's mean starter rating matches the engine's (a quickSim starter also carries the events of
   * the sub who would replace him, so the rates sit off the engine's per-slot counts).
   */
  TACKLES_FAILED_PER_MATCH:     { GK: 0, DEF: 1.072, MID: 0.356, FWD: 1.154 } as Record<LineGroup, number>,
  TACKLE_FAIL_LEVEL_EXPONENT:   { GK: 0, DEF: -0.39, MID: -0.81, FWD: -0.36 } as Record<LineGroup, number>,

  /**
   * Energy spent over 90' for an average-stamina player, per line — calibrated against the full
   * engine's average end-of-match energy loss for players who play the whole 90' (fitness 100,
   * load 0), pooled across premier_league / of_allsvenskan / of_kenyan_premier_division (60 pairs
   * per league, ~360–940 full-90 player-observations per line). See
   * `bun scripts/fatigue-calibrate.ts`. Applied in `quickSim.ts` as
   * `ENERGY_DRAIN_BY_LINE[line] × staminaFactor × drainMultiplier(load) × extraTimeMult`. GK
   * drains the least (mostly holds position / occasional gkSave); DEF and FWD the most (constant
   * pressing/tackling and carrying/pressing respectively); MID sits in between.
   */
  ENERGY_DRAIN_BY_LINE: { GK: 38.1, DEF: 53.5, MID: 48.3, FWD: 52.1 } as Record<LineGroup, number>,
} as const;
