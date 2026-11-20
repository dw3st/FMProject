/**
 * FM-style decisions (`docs/superpowers/specs/2026-11-18-fm-style-decisions-design.md`, `.claude/rules/game-engine/decisions.md`).
 *
 * Phase 2 added the telemetry (pure, no dice). Phase 3 (`HOLDER`, on by default) is the ball holder's mind: mental
 * rolls, gates, perceived scores (`HOLDER_MIND`, `Domain/HolderMind.ts`). A flag off makes no `matchRandom` call, so a
 * match is game-for-game identical to the engine without it with a fixed engine seed.
 *
 * Overrides: `DECISION_OVERRIDES='{"HOLDER":true}'` (env, read once at load, scripts and workers) and
 * `simulateMatch(..., { decisions: { HOLDER: true } })` (per match; reset to the base flags when absent).
 */

/** Behaviour switches of the decision layer (phases 3–5). Phase 3 turns `HOLDER` on; the others stay off. */
export interface DecisionFlags {
  /** Ball holder: gates, attribute test noise, lapses (§3). */
  HOLDER: boolean;
  /** Off-ball: noise on the intent scores, flair, lapse (§4). */
  OFFBALL: boolean;
  /** Defence: noise on the intent scores, lapse (§4). */
  DEFENSE: boolean;
  /** Anticipation reads the play earlier: press start and loose-ball chase use a lookahead (stage 4, `movement.md`). */
  ANTICIPATION_PRESS: boolean;
  /** The second presser stands off ~5 yd covering the inside route (stage 4, `movement.md`). */
  SECOND_PRESSER: boolean;
  /** Positioning target lags the shape anchor by a discipline τ (§4). */
  DISCIPLINE_LAG: boolean;
  /** Consistency caps the stacked attribute modifiers of the day (§7 phase 5; stage 16, `Domain/ConsistencyCap.ts`). */
  CONSISTENCY_CAP: boolean;
  /** Holder moves (phase 3, `Domain/HolderMoves.ts`): shield / turn with the back to goal. */
  SHIELD: boolean;
  /** Holder moves: a wide holder cuts inside onto his stronger foot. */
  CUT_INSIDE: boolean;
  /** Holder moves: first-time lay-off to an arriving teammate. */
  LAY_OFF: boolean;
  /** Holder moves: chip over an advanced keeper. */
  CHIP: boolean;
  /** Holder moves: round the keeper in a one-on-one. */
  ROUND_KEEPER: boolean;
  /** Stage 4 (`movement.md`): an overhit through ball rolls on; a long pass can be miscontrolled into a loose ball. */
  ROLLING_BALL: boolean;
  /** Stage 4: part of the interceptions deflect the pass loose instead of controlling it. */
  DEFLECTIONS: boolean;
  /** Stage 4: an open-play shot can be blocked by a defender on its line and rebound loose. */
  SHOT_BLOCKS: boolean;
  /** Stage 4: the back line holds one line (robust mean) with hold / step-up / drop states. */
  BACK_LINE: boolean;
  /** Stage 4: the nearest defender / midfielder comes short to a pressed holder. */
  SUPPORT_SHORT: boolean;
  /** Stage 4b (`fm-numbers.md`): launch error on passes (distance, loft, pressure); long passes go lofted; the chooser
   * weighs the risk. */
  PASS_ERROR: boolean;
  /** Stage 4b: the holder decides when he receives and when his action ends (carry steps, hold, turn). */
  ACTION_CADENCE: boolean;
  /** Stage 4b: fewer dedicated pressers; the shape shifts toward the ball instead. */
  CALM_PRESS: boolean;
  /** Stage 4b: the block slides with possession (deep out of it, high in it, narrower). */
  SLIDING_BLOCK: boolean;
  /** Stage 4b: off-ball targets are short steps by line, positioning held longer. */
  SHORT_STEPS: boolean;
  /** Stage 4b: no shot beyond ~33 yd; per-role shooting level multiplies the shot score. */
  SHOT_LIMIT: boolean;
  /** Stage 4b: tactic axes move the engine gently (width damped, mentality on the carry threshold). */
  TACTIC_DAMP: boolean;
  /** Stage 6 (`xg.md`): the shot's xG is the FM logistic model (stats, the shot decision, the resolution input). */
  FM_XG: boolean;
  /** Stage 3 of the rebuild (`ball-3d.md`): the ball is a 3D object (height, flight, bounce, roll); passes, shots and
   *  loose balls move it physically; a loose ball above a player's reach can't be collected. */
  BALL_3D: boolean;
  /** Stage 4 of the rebuild (`pass-physics.md`): passes are launched with FM's speed and loft by type and distance, the
   *  passer's error on the 3D vector; the ball arrives where and when the physics takes it (needs `BALL_3D`). */
  PASS_PHYSICS: boolean;
  /** Stage 5 of the rebuild (`interception.md` → "Stage 5"): no interception dice for a physical pass; a defender who
   *  reaches a point of its path in time and at a playable height touches it (control, clearance, deflection, miss). */
  PHYSICAL_INTERCEPTION: boolean;
  /** Stage 18 (`highlights.md`): the highlight layer (observation only: marks the lances, never changes the play). */
  HIGHLIGHTS: boolean;
  /** Stage 13 (`game-rules/offside.md`): attackers read the offside line every few tenths of a second with an error
   *  (anticipation, decisions, consistency) instead of being held on it; mistimed runs are caught offside. */
  OFFSIDE_RUNS: boolean;
  /** Stage 13 (`fouls.md`): contact fouls on the ball holder (carrying, receiving, holding), the foul's context and
   *  third, and the FM card per foul. */
  FM_FOULS: boolean;
  /** Stage 14 (`fitness.md` → "FM condition"): FM's condition curve (kick-off 99, drain fading toward a floor, +2 at
   *  half time, keepers barely tire) and FM's AI substitutions (from 55', at 55–75 %, 3–4 a match). */
  FM_CONDITION: boolean;
  /** Stage 16 (`decisions.md` → "Stage 16"): the mental rolls off the ball and in defence — concentration (marking
   *  lapses), aggression (press, step in), anticipation (reads the mark's run), decisions (noise on the intent scores). */
  DEFENSIVE_MIND: boolean;
}

export const DEFAULT_DECISION_FLAGS: Readonly<DecisionFlags> = {
  HOLDER: true,
  OFFBALL: false,
  DEFENSE: false,
  ANTICIPATION_PRESS: true,
  SECOND_PRESSER: true,
  DISCIPLINE_LAG: false,
  CONSISTENCY_CAP: true,
  SHIELD: true,
  CUT_INSIDE: true,
  LAY_OFF: true,
  CHIP: true,
  ROUND_KEEPER: true,
  ROLLING_BALL: true,
  DEFLECTIONS: true,
  SHOT_BLOCKS: true,
  BACK_LINE: true,
  SUPPORT_SHORT: true,
  PASS_ERROR: true,
  ACTION_CADENCE: true,
  CALM_PRESS: true,
  SLIDING_BLOCK: true,
  SHORT_STEPS: true,
  SHOT_LIMIT: true,
  TACTIC_DAMP: true,
  FM_XG: true,
  BALL_3D: true,
  PASS_PHYSICS: true,
  PHYSICAL_INTERCEPTION: true,
  HIGHLIGHTS: true,
  OFFSIDE_RUNS: true,
  FM_FOULS: true,
  FM_CONDITION: true,
  DEFENSIVE_MIND: true,
};

/**
 * The holder's extra moves (`Domain/HolderMoves.ts`, `decisions.md` → "Holder moves"). Distances in yards. Scores are
 * compressed with `STRONG_RAW` like the other actions (0.632 at raw = STRONG_RAW).
 */
export const HOLDER_MOVES = {
  STRONG_RAW: 0.8,
  /** "Back to goal": the last movement more than this many degrees from the goal, at this speed (yd/s) or more. */
  FACING_AWAY_DEG: 112,
  FACING_MIN_SPEED: 0.5,
  /** ... or the nearest opponent within this distance on his goal side (a defender on his back). */
  BACK_MARKER_YD: 4,
  /** Shield: an opponent within this distance; raw = weight × (strength + composure)/2 × (0.5 + pN). */
  SHIELD_NEAR_YD: 3.5,
  SHIELD_WEIGHT: 0.6,
  /** Shielding he edges away at this share of his carry speed. */
  SHIELD_SPEED_MULT: 0.3,
  /** A tackle on a shielding holder succeeds × (1 − this × strength); fouls × FOUL_MULT. */
  SHIELD_TACKLE_RESIST: 0.35,
  SHIELD_FOUL_MULT: 1.4,
  /** Cut inside: from at least CUT_WIDE_YD off the centre line, CUT_MIN..MAX from the goal line, toward the box edge. */
  CUT_WIDE_YD: 10,
  CUT_MIN_YD: 16,
  CUT_MAX_YD: 45,
  CUT_TARGET_DEPTH_YD: 20,
  CUT_TARGET_WIDE_YD: 8,
  /** No opponent within CUT_CLEAR_YD of the first CUT_LANE_YD of the run. */
  CUT_LANE_YD: 6,
  CUT_CLEAR_YD: 3,
  /** On the natural foot (not inverted) the score × this; the full-back showing him outside × SHOW_BONUS. */
  CUT_NATURAL_FOOT: 0.5,
  CUT_SHOW_YD: 6,
  CUT_SHOW_BONUS: 1.3,
  CUT_WEIGHT: 0.85,
  /** Lay-off: right after a reception (justReceivedTicks ≥ this), an opponent within PRESSURE_YD, a teammate
   *  MIN..MAX away, at most MAX_AHEAD in front, arriving (≥ RUN_SPEED yd/s), lane clear by LANE_YD. */
  LAYOFF_RECEIVED_TICKS: 1,
  LAYOFF_PRESSURE_YD: 7,
  LAYOFF_MIN_YD: 4,
  LAYOFF_MAX_YD: 20,
  LAYOFF_MAX_AHEAD_YD: 3,
  LAYOFF_RUN_SPEED: 0.5,
  LAYOFF_LANE_YD: 2.5,
  LAYOFF_WEIGHT: 1.15,
  /** Chip: keeper at least MIN_DEPTH off his line and within KEEPER_OFF_LINE of the shot line, the shooter
   *  MIN..MAX from goal and MIN_GAP beyond him. Chance = XG × depth factor × angle × skill. */
  CHIP_MIN_DEPTH_YD: 3,
  CHIP_MIN_YD: 10,
  CHIP_MAX_YD: 28,
  CHIP_MIN_GAP_YD: 4,
  CHIP_KEEPER_OFF_LINE_YD: 4.5,
  CHIP_XG: 0.8,
  CHIP_DEPTH_SPAN_YD: 8,
  CHIP_WEIGHT: 2.6,
  /** Round the keeper: keeper within RANGE in a one-on-one. P(win) = (skill + BASE)/(skill + BASE + smother). */
  ROUND_RANGE_YD: 8,
  ROUND_WEIGHT: 2,
  ROUND_BASE: 0,
  /** A rounded keeper is beaten for this long (s). */
  ROUND_KEEPER_RECOVERY: 1.4,
};
{
  const raw = typeof process !== 'undefined' ? process.env?.HOLDER_MOVES_OVERRIDES : undefined;
  if (raw) { try { Object.assign(HOLDER_MOVES, JSON.parse(raw)); } catch { /* ignored */ } }
}

/** Telemetry constants (pressure scalar and situation buckets). */
export const DECISION_TELEMETRY = {
  /** 1 yard in metres. FM measures in metres; our pitch is in yards. */
  M_PER_YD: 0.9144,
  /** FM's pressure radius: 12 m (≈ 13.12 yd). */
  PRESSURE_RADIUS_M: 12,
  /** FM's "nearest presser" threshold: 1 m (≈ 1.09 yd). Beyond it P = max(P / d0, (P + 1) / 2), d0 in metres. */
  NEAREST_M: 1,
  /** FM's contribution weight: 10 · ((R − d) / k)² / R. */
  WEIGHT: 10,
  /** k: free opponent 1, recovering one tick 2, recovering two ticks or more 3. */
  K_FREE: 1,
  K_RECOVERING_ONE: 2,
  K_RECOVERING_MORE: 3,
  /** One decision tick in real seconds (`DECISION_REF_DT`): `recoveryTime` above this = "≥ 2 ticks". */
  TICK_S: 0.2,
  /**
   * Situation bucket split of the pressure scalar (raw P, not normalised). Chosen at the measured median of the holder
   * pressure (premier_league + of_championship baseline, `decisions.md`).
   */
  PRESSURE_HIGH: 15,
  /** Wide channel: |y − 37| ≥ this (the outer quarters of the 74-yard pitch). */
  WIDE_FROM_CENTRE: 18.5,
  /** Decisions whose top two scores differ by less than this count as near-ties. */
  NEAR_TIE: 0.05,
} as const;

/**
 * The ball holder's mind (phase 3, `HOLDER`; `.claude/rules/game-engine/decisions.md`). Attributes are read on FM's
 * 1..100 scale stretched to our world (`a = clamp(mental / MENTAL_TOP) × 100`); every gate compares a ROLL, never the
 * raw attribute.
 */
export const HOLDER_MIND = {
  /** Mental value (0..1) that maps to FM's 100: the world's top (roster 6.5). */
  MENTAL_TOP: 0.65,
  /** Rolls, noise and lapse are held this many decision ticks (0.8 s), re-rolled for a new holder. */
  WINDOW_TICKS: 4,
  /** Roll = U·(a + ROLL_PLUS) (normal mood); good mood max(U1, U2), bad U1·U2. */
  ROLL_PLUS: 2,
  /** FM's form window s = tick mod SPAN + BASE (100 scale): below it a roll < 1 is a lapse, at or above it the roll is ≥ 1. */
  FORM_WINDOW_BASE: 35,
  FORM_WINDOW_SPAN: 15,
  /** Tired players lapse more: the decisions roll is divided by 1 + LAPSE_FATIGUE·(1 − energy/100)²·(1.5 − consistency). */
  LAPSE_FATIGUE: 4,
  /** Below the form window a decisions roll under LAPSE_ROLL (after the fatigue division) is a lapse (FM: 1, a zero
   * roll; raised so the average lapse share per decision is FM27's ~4%, ~1% for the elite). */
  LAPSE_ROLL: 4,
  /** On a lapse each perceived score × U(LAPSE_MIN, 1). */
  LAPSE_MIN: 0.55,
  /** Perceived score s + σ·z, σ = SIGMA_MIN + SIGMA_SPAN·(1 − test), test = (fmScale(decisions)/100)·(0.4 + 0.6·T).
   * The design's 0.01 + 0.09 cost ~30% of the goals (most players sit low; near-ties are 42% of the decisions). */
  SIGMA_MIN: 0.005,
  SIGMA_SPAN: 0.02,
  /** Mood = clamp(0.5·moraleFactor + 0.5·form, −1, 1): good ≥ MOOD_GOOD, bad ≤ MOOD_BAD. */
  MOOD_GOOD: 0.35,
  MOOD_BAD: -0.35,
  /** Form = clamp((mean recent rating − FORM_REF) / FORM_SPAN, −1, 1); no ratings = 0. */
  FORM_REF: 6.6,
  FORM_SPAN: 0.8,
  /** pN = clamp(P / PRESSURE_NORM, 0, 1) (P = FM's raw pressure scalar, `Pressure.ts`). */
  PRESSURE_NORM: 60,
  /** High pressure for the statistics (release rate, panic). */
  HIGH_PRESSURE: 0.55,
  /**
   * Release under pressure (composure gate): no carry nor dribble when pN·100 − C/2 > D·RELEASE_K·(1 + OPEN_WEIGHT·n)/10,
   * C the composure roll, D metres to goal, n open pass options (pass score ≥ OPEN_PASS). Tuned on FM27's live rates
   * (`decision-release-tune.ts`): ~1–2% with an open option, most decisions without one.
   */
  RELEASE_K: 4,
  OPEN_WEIGHT: 6,
  /**
   * What a release does (FM27: after "must act now" the holder mostly escapes with the ball, ×8, then goes long, ×2.6,
   * rarely a short pass): no dribble, carry × RELEASE_CARRY_MULT, long ball × RELEASE_LONG_MULT, pass × RELEASE_PASS_MULT.
   */
  RELEASE_CARRY_MULT: 1.3,
  RELEASE_LONG_MULT: 1.3,
  RELEASE_PASS_MULT: 0.6,
  OPEN_PASS: 0.5,
  /** Facing away from goal (> FACING_AWAY_DEG between movement and goal): the release window × (1 + w) and a
   * backward or lateral pass (progress ≤ BACK_PASS_PROGRESS) × (1 + w), w = min(pN·10 + 10, 12)%. */
  FACING_AWAY_DEG: 112,
  FACING_MIN_SPEED: 0.5,
  BACK_PASS_PROGRESS: 0.6,
  /** Simple-minded: decisions roll < SIMPLE_ROLL → through ball only with race ≥ SIMPLE_RACE_S, no cross or long ball
   * beyond SIMPLE_MAX_AERIAL_M metres, dribble only with carryBias ≥ SIMPLE_DRIBBLE_BIAS. */
  SIMPLE_ROLL: 8,
  SIMPLE_RACE_S: 0.5,
  SIMPLE_MAX_AERIAL_M: 30,
  SIMPLE_DRIBBLE_BIAS: 0.6,
  /** Long-shot range (yd) = BASE + SPAN·((flairRoll + composureRoll)/2)/100, ≤ MAX. */
  LONG_SHOT_BASE_YD: 27,
  LONG_SHOT_SPAN_YD: 22,
  LONG_SHOT_MAX_YD: 49,
  /** Flair bias FLAIR_BIAS·clamp((flairRoll − FLAIR_CENTER)/FLAIR_CENTER, −1, 1) on dribble, through ball and a shot from
   * beyond LONG_SHOT_FROM_YD. FLAIR_CENTER ≈ the median normal roll of the world (flair 2.6 → U·28). */
  FLAIR_BIAS: 0.03,
  FLAIR_CENTER: 14,
  LONG_SHOT_FROM_YD: 20,
};

/** `HOLDER_MIND_OVERRIDES='{"RELEASE_K":50}'` (env, read once at load): tuning runs. */
try {
  const raw = typeof process !== 'undefined' ? process.env?.HOLDER_MIND_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(HOLDER_MIND) as (keyof typeof HOLDER_MIND)[]) {
      if (typeof parsed[k] === 'number') (HOLDER_MIND as Record<string, number>)[k] = parsed[k] as number;
    }
  }
} catch { /* ignore a malformed override */ }

function readEnvOverrides(): Partial<DecisionFlags> {
  try {
    const raw = typeof process !== 'undefined' ? process.env?.DECISION_OVERRIDES : undefined;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<DecisionFlags> = {};
    for (const k of Object.keys(DEFAULT_DECISION_FLAGS) as (keyof DecisionFlags)[]) {
      if (typeof parsed[k] === 'boolean') out[k] = parsed[k] as boolean;
    }
    return out;
  } catch {
    return {};
  }
}

/** The flags a match starts from: the defaults with the env overrides. */
const BASE_FLAGS: Readonly<DecisionFlags> = { ...DEFAULT_DECISION_FLAGS, ...readEnvOverrides() };

/** The live flags (process-global like the other team configs). */
export const DECISION_FLAGS: DecisionFlags = { ...BASE_FLAGS };

/** Sets the flags of the next match: the base flags with `partial` on top (absent = the base). */
export function setDecisionFlags(partial?: Partial<DecisionFlags>): void {
  Object.assign(DECISION_FLAGS, BASE_FLAGS, partial ?? {});
}
