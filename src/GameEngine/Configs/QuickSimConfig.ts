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
  /**
   * Expected goals for one side when both teams are equal and at LEVEL_REF, before home advantage.
   *
   * Recalibrated 2026-09-27 ("soften + recalibrate" stamina balance task) at a representative
   * matchday fitness (88, not the old 75 `emptySeasonLog()` default every prior goal-volume
   * calibration assumed) — the engine's fatigue curve itself (`RuntimeLineup.ts`) is UNCHANGED (a
   * softened version was tried and reverted — see that file's doc comment and
   * `.claude/rules/non-player-games.md` → "Fadiga"). Only the fitness assumption used to collect
   * the calibration data moved (75 → 88); the engine's own scoring at fitness 88 is close to, but
   * not identical to, its scoring at fitness 75 (a fresher squad plays a little sharper), so the
   * constants below moved a little too. Old values (fitted at fitness 75): BASE_GOALS 0.76,
   * HOME_ADVANTAGE 1.03, STRENGTH_EXPONENT 0.51, LEVEL_EXPONENT 0.81, PACE_EDGE_WEIGHT 0.32.
   *
   * Refit: `bun scripts/quicksim-spread.ts collect <league> 150 2 <out> --fitness 88`, 10 leagues
   * (premier_league, la_liga, bundesliga, brazil_serie_a, of_championship, of_allsvenskan,
   * of_eredivisie, of_kenyan_premier_division, of_liga_mx, of_turkish_super_league), then
   * `analyze` section 8 ("ratio+level+pace", current ATTACK_KEYS). rms across leagues 25.1% (with
   * the OLD, fitness-75-fit constants, measured against fitness-88 data) → 5.9% (worst-case
   * la_liga −9.5%; every league within ±10%).
   */
  BASE_GOALS: 0.84,
  HOME_ADVANTAGE: 1.03,
  /**
   * Exponent on (atk × mid) / (def × gk). Also carries league-wide imbalance: derived (of_*) squads
   * have defence/GK strong vs attack, and the engine scores far less there than level alone predicts.
   * Refitted jointly with PACE_EDGE_WEIGHT (the pace edge took over part of what this carried).
   */
  STRENGTH_EXPONENT: 0.48,
  /**
   * xG × e^(PACE_EDGE_WEIGHT × (attacker forward-line pace − defender back-line pace)), pace =
   * (3·speed + acceleration)/4 on raw 0–10 attributes. The engine's goal spread between leagues of
   * equal level follows this edge (Premier League +0.94 → many goals, Bundesliga +0.10 → few): it
   * drives chance volume via through-ball races, not conversion. Fitted with
   * `bun scripts/quicksim-spread.ts analyze`. 0 disables.
   */
  PACE_EDGE_WEIGHT: 0.29,
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
  LEVEL_EXPONENT: 1.06,
  /** Added to every line strength (0–10 attribute averages) to avoid division by ~0. */
  STRENGTH_FLOOR: 0.5,
  /**
   * Strength multiplier lost at 0 fitness (linear): factor = 1 − FATIGUE_PENALTY × (1 − fitness/100).
   * Only `fitness` feeds this — `load` never does; load only raises `ENERGY_DRAIN_BY_LINE` (see
   * above), by design (`docs/superpowers/specs/2026-09-27-stamina-design.md` §1 "Motor ×
   * quickSim": the engine gets the load factor at kickoff, quickSim gets it in the drain).
   *
   * Kept at 0.3 after re-checking against the engine (`bun scripts/fatigue-calibrate.ts`, Part 2) —
   * the engine's own fatigue curve (`RuntimeLineup.ts`) is unchanged by the 2026-09-27
   * "soften + recalibrate" balance pass (a softened curve was tried and reverted; see that file's
   * doc comment), so the engine's tired-vs-fresh gap is the same as it always was: a fresh XI
   * (fitness 100/load 0) vs a tired XI (fitness 70/load LOAD_HIGH) on the same premier_league
   * fixtures scores engine ~82-90% fresh win / ~8-12% draw / ~2-6% tired win — quickSim's
   * FATIGUE_PENALTY=0.3 gives 44.9%/21.1%/34%, matching its original calibration. Only BASE_GOALS
   * and friends moved (see above — the fitness ASSUMPTION for the goal-volume calibration moved
   * 75 → 88, not the curve), and re-checking the FATIGUE_PENALTY sweep against those new constants
   * changes nothing about the underlying tension: raising it enough to meaningfully close the gap
   * (≥ ~1.5) still costs equal-fitness goal volume (LEVEL_EXPONENT/STRENGTH_EXPONENT curvature +
   * the additive STRENGTH_FLOOR don't cancel between two equal-fitness sides), so it would silently
   * invalidate the per-league goal-volume calibration just above. Closing the gap properly needs
   * `load` (or an evolving in-match fitness) to feed team strength too, which the design explicitly
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
   * Etapa 13 (aerial play): scaled per line by the engine's passes per slot after / before crosses
   * and long balls (`bun scripts/aerial-calibrate.ts`, PL + Championship, 1200 matches each): GK ×0.53
   * (balanced keepers go long on ~40% of restarts), DEF ×0.86, MID ×0.87, FWD ×0.80 — was GK 2.159,
   * DEF 2.101, MID 2.338, FWD 1.128.
   * Etapa 14 (set pieces): scaled again by the engine's passes per slot after / before
   * (`bun scripts/aerial-calibrate.ts`, PL 800 + Championship 600): GK ×0.62 (saves parried for a
   * corner replace goal kicks), DEF ×0.93, MID ×0.89, FWD ×0.955 — was GK 1.145, DEF 1.811,
   * MID 2.038, FWD 0.906.
   */
  PASSES_PER_MATCH:        { GK: 0.71, DEF: 1.684, MID: 1.814, FWD: 0.865 } as Record<LineGroup, number>,
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
   * Rating-tail correction (#9). A quickSim starter carries the goals and assists of the whole slot
   * (there is no bench), so his rating spreads wider than a full-engine starter's, who shares the slot
   * with a substitute: too many ratings >= 8.5 (and too many very low ones) on the attacking lines.
   * The raw rating is shrunk toward `RATING_SHRINK_CENTER` by `RATING_SHRINK` (1 = off) before the
   * clamp, which narrows both tails and keeps the line mean. Fitted with
   * `bun scripts/quicksim-spread.ts events` (share of >= 8.5 and mean starter rating per line).
   */
  RATING_SHRINK:        { GK: 1, DEF: 0.9, MID: 0.94, FWD: 0.92 } as Record<LineGroup, number>,
  RATING_SHRINK_CENTER: { GK: 6.04, DEF: 6.14, MID: 6.22, FWD: 6.7 } as Record<LineGroup, number>,

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

  /**
   * Discipline (Etapa 12, `.claude/rules/game/discipline.md`): fouls, cards, penalties and offsides
   * per side, Poisson around the full engine's per-match means (`.claude/rules/game-engine/fouls.md`:
   * PL 11.3 fouls / 2.89 yellows / 0.15 reds / 0.24 penalties / 1.05 offsides per match, two teams).
   * No level trend in the engine except offsides. Fitted by `bun scripts/quicksim-discipline.ts`.
   */
  FOULS_PER_SIDE: 5.75,
  /** Who commits a foul: weight per line × (1 + 0.6 × (0.5 − tackling/10)). */
  FOUL_LINE_WEIGHT: { GK: 0.05, DEF: 1.2, MID: 1.0, FWD: 0.7 } as Record<LineGroup, number>,
  /** A booked player fouls less (same idea as the engine's `YELLOW_MULT`). */
  BOOKED_FOUL_MULT: 0.35,
  YELLOW_PER_FOUL: 0.245,
  /** Card chance on a booked player's foul (engine: 1.15). */
  BOOKED_CARD_MULT: 1.15,
  DIRECT_RED_PER_FOUL: 0.0026,
  /** 0.115 → 0.14 with aerial play: the engine's IN_BOX_MULT went up (PL 0.27 / Championship 0.29 penalties per match). */
  PENALTIES_PER_SIDE: 0.14,
  OFFSIDES_PER_SIDE: 0.45,
  OFFSIDE_LEVEL_EXPONENT: 1.5,

  /**
   * Aerial play (Etapa 13, `.claude/rules/game-engine/aerial.md`), Poisson / binomial around the
   * full engine's per-match means (`bun scripts/aerial-calibrate.ts`). No level trend modelled.
   * HEADER_GOAL_SHARE of the (non-penalty) goals already sampled become header goals, re-attributed
   * by HEADER_LINE_WEIGHT × (0.5 + heading/10) — the score never changes.
   */
  /** Etapa 14 (set pieces): 0.105 → 0.19 (corners and crossed free kicks are headed in). */
  HEADER_GOAL_SHARE: 0.19,
  /**
   * Engine header goals per starter slot with set pieces: DEF ≈ FWD (centre-backs go up for corners),
   * MID ≈ 0.22 × FWD. Was DEF 0.01, MID 0.11 before set pieces.
   */
  HEADER_LINE_WEIGHT: { GK: 0, DEF: 0.9, MID: 0.22, FWD: 1.0 } as Record<LineGroup, number>,
  /** Set-piece deliveries (corners, crossed free kicks) count as crosses: 5.5 → 8.1 per side. */
  CROSSES_PER_SIDE: 8.1,
  CROSS_COMPLETION: 0.15,
  LONG_BALLS_PER_SIDE: 2.85,
  LONG_BALL_COMPLETION: 0.52,
  /** Distinct aerial duels per match (both teams contest each one). 9.8 → 14.5 with set pieces. */
  AERIAL_DUELS_PER_MATCH: 14.5,
  /** Who wins a team's duels (engine duels won per starter slot): weight × (0.5 + heading/10). */
  AERIAL_DUEL_LINE_WEIGHT: { GK: 0, DEF: 0.95, MID: 0.44, FWD: 0.72 } as Record<LineGroup, number>,

  /**
   * Set pieces (Etapa 14, `.claude/rules/game-engine/set-pieces-play.md`), from the full engine's
   * per-match means (`bun scripts/setpiece-calibrate.ts`). Corners and direct free-kick shots by
   * Poisson; free kicks = the opponent's fouls minus its penalties. SET_PIECE_GOAL_SHARE of all goals
   * are non-penalty set-piece goals (corners, free kicks — DIRECT_FK_GOAL_SHARE of all goals are
   * direct free kicks, moved to the best finisher with no assist); a set-piece goal that is not
   * already a header is re-attributed by SET_PIECE_LINE_WEIGHT × (0.5 + heading/10). Penalty goals
   * count as set-piece goals too. The score never changes.
   */
  CORNERS_PER_SIDE: 3.24,
  DIRECT_FK_SHOTS_PER_SIDE: 0.11,
  SET_PIECE_GOAL_SHARE: 0.117,
  DIRECT_FK_GOAL_SHARE: 0.036,
  /** Non-header set-piece goals: second balls and edge-of-the-box shots, mostly forwards and midfielders. */
  SET_PIECE_LINE_WEIGHT: { GK: 0, DEF: 0.5, MID: 0.5, FWD: 1.0 } as Record<LineGroup, number>,
} as const;
