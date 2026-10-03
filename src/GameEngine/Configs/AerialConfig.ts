/**
 * AerialConfig — crosses, long balls, aerial duels, goalkeeper claims and headers
 * (Etapa 13, `docs/superpowers/specs/2026-10-02-aerial-play-design.md`,
 * `.claude/rules/game-engine/aerial.md`).
 *
 * Every tunable number of the aerial system lives here. Calibrated with
 * `bun scripts/aerial-calibrate.ts` (see aerial.md for the measured table): per match (both teams)
 * ~11–12 crosses, ~10–11 aerial duels (~20–22 summed over both teams), header goals ~10–11% of the
 * goals, ~6 long balls (balanced), with goals and shots within ±5% of the pre-aerial engine.
 */
export const AERIAL_CONFIG = {
  // ── Flight ────────────────────────────────────────────────────────────────
  /** Yards per real-second of a high ball (a regular pass flies at 28). */
  AERIAL_YARDS_PER_SEC: 30,
  /** Opponents within this distance of the passer at the kick may block the ball (yards). */
  BLOCK_RADIUS: 2,
  /** Chance that the closest opponent inside BLOCK_RADIUS blocks the high ball. */
  BLOCK_CHANCE: 0.35,
  /** Landing error: σ = (1 − passingSkill) × MAX_ERROR / 2 (yards). */
  CROSS_MAX_ERROR: 4,
  LONG_BALL_MAX_ERROR: 10,

  // ── Cross candidate zone ───────────────────────────────────────────────────
  /** The holder must be within this distance of the goal line he attacks (final third). */
  CROSS_MAX_DIST_TO_LINE: 50,
  /**
   * Crosses from closer than this to the line (yards) are scaled by CROSS_NEAR_LINE_MULT: there the
   * carrier's other options (cut inside, shoot, cut back, draw a penalty) are worth much more —
   * measured, letting crosses win there cost a fifth of the ground goals.
   */
  CROSS_DEEP_DIST: 20,
  CROSS_NEAR_LINE_MULT: 0.7,
  /** Outside the central corridor: |y − centre| ≥ this (yards). */
  CROSS_MIN_WIDTH: 7,
  /** Inside the penalty area only a cut-back from the byline counts: within this distance of the line, wide of the six-yard box. */
  CROSS_BYLINE_DIST: 4,

  // ── Cross targets (yards from the goal line / goal mouth) ──────────────────
  /** Just outside the small box, so the near-post ball is not an automatic keeper claim. */
  NEAR_POST_DEPTH: 7.5,
  PENALTY_SPOT_DEPTH: 12,
  FAR_POST_DEPTH: 7,
  /** Far-post target sits this far outside the far post (yards). */
  FAR_POST_OUTSIDE: 2,
  /** Defenders within this radius of a target count in its zone (yards). */
  TARGET_ZONE_RADIUS: 8,
  /** Attackers within this radius can attack the target during the flight (they run onto it). */
  ATTACKER_REACH_RADIUS: 22,

  // ── Cross scoring ──────────────────────────────────────────────────────────
  /** Raw base of any viable target (at least one attacker in the zone). */
  CROSS_BASE: 0.5,
  /** Per attacker − defender (proximity-weighted) in the target zone. */
  CROSS_NUMBERS_WEIGHT: 0.22,
  /** Defenders count this much each in the numbers term. */
  CROSS_DEFENDER_WEIGHT: 0.6,
  /** Crosser's passing skill (0..1). */
  CROSS_PASS_WEIGHT: 0.15,
  /** Best heading of an attacker in the zone (0..1, proximity-weighted). */
  CROSS_HEADING_WEIGHT: 0.30,
  /** Penalty when the defending goalkeeper can claim the target (small box, or he is within reach). */
  CROSS_GK_PENALTY: 0.20,
  /** compress() calibration — a raw cross this good scores 0.632. */
  CROSS_STRONG_RAW: 0.5,

  // ── Long ball ──────────────────────────────────────────────────────────────
  /** Receiver must be at least this far ahead of the holder (attack direction, yards). */
  LONG_BALL_MIN_PROGRESS: 22,
  LONG_BALL_MIN_DIST: 28,
  LONG_BALL_MAX_DIST: 65,
  /** The holder must be at most this far from his own goal line (yards). */
  LONG_BALL_MAX_HOLDER_DEPTH: 60,
  /** Lead in front of the receiver (attack direction, yards). 0: aimed at his head, not into space. */
  LONG_BALL_LEAD: 0,
  /** Defenders within this radius of the landing point contest the ball. */
  LONG_BALL_CONTEST_RADIUS: 7,
  LONG_BALL_PROGRESS_WEIGHT: 0.30,
  /**
   * 0 on purpose: long balls chosen for a FREE receiver created ~+12% shots (fast breaks); aimed at
   * the striker's head they are contested and roughly neutral (`aerial.md`).
   */
  LONG_BALL_SPACE_WEIGHT: 0,
  LONG_BALL_AERIAL_WEIGHT: 0.20,
  LONG_BALL_PASS_WEIGHT: 0.10,
  /** compress() calibration for the long ball action. */
  LONG_BALL_STRONG_RAW: 0.4,

  // ── Aerial duel ────────────────────────────────────────────────────────────
  /** Players within this distance of the landing point contest the ball in the air (yards). */
  AERIAL_RADIUS: 5,
  DUEL_HEADING_WEIGHT: 0.45,
  DUEL_JUMP_WEIGHT: 0.25,
  DUEL_STRENGTH_WEIGHT: 0.15,
  DUEL_POSITION_WEIGHT: 0.15,
  /** Floor added to both duel scores so a weak header still wins sometimes. */
  DUEL_BASE: 0.10,
  /** Max chasers per team committed to the landing point of a high ball. */
  MAX_CHASERS_PER_TEAM: 3,
  /** Chaser ETA horizon (seconds behind the fastest of the team). */
  CHASE_ETA_HORIZON: 1.2,

  // ── Goalkeeper ─────────────────────────────────────────────────────────────
  /** Small box: depth from the goal line and half-width beyond each post (yards). */
  SMALL_BOX_DEPTH: 6,
  SMALL_BOX_WIDE: 6,
  /** The keeper also comes for a ball he reaches first within this extra reach (yards). */
  GK_EXTRA_REACH: 3,
  GK_CLAIM_BASE: 0.45,
  GK_CLAIM_POSITIONING: 0.25,
  GK_CLAIM_REFLEX: 0.15,
  /** Each attacker within AERIAL_RADIUS lowers the claim chance by this much. */
  GK_CLAIM_CROWD: 0.08,
  /**
   * A headed clearance / keeper punch / block is itself a high ball (kind `clearance`) that lands
   * this far away from the clearing player's own goal (yards, uniform between MIN and MAX) and is
   * contested there like any high ball — the "second ball".
   */
  CLEARANCE_DIST_MIN: 16,
  CLEARANCE_DIST_MAX: 28,
  PUNCH_DIST_MIN: 14,
  PUNCH_DIST_MAX: 24,
  BLOCK_DIST_MIN: 5,
  BLOCK_DIST_MAX: 10,
  /** Lateral spread of a clearance / punch direction (radians, ±). */
  CLEARANCE_SPREAD: 0.9,
  /** A cross landing within this distance of the byline: chance a defensive header goes behind. */
  CLEARANCE_CORNER_DEPTH: 9,
  CLEARANCE_CORNER_CHANCE: 0.3,

  // ── Header ─────────────────────────────────────────────────────────────────
  /** An attacker winning the ball within this distance of the goal line heads at goal (yards). */
  HEADER_RANGE: 12,
  /** Minimum open angle to head at goal (radians). */
  HEADER_MIN_ANGLE: 0.18,
  /** Header xG = computeXG × this. */
  HEADER_XG_MULT: 0.9,
  /** Heading → finishing multiplier range (replaces shootAccuracy's SHOOTER_EFFECT). */
  HEADER_EFFECT_MIN: 0.8,
  HEADER_EFFECT_MAX: 1.3,
  /** First-touch control of a high ball: chance = CONTROL_BASE + CONTROL_TOUCH × firstTouch (else it drops loose). */
  CONTROL_BASE: 0.35,
  CONTROL_TOUCH: 0.45,
  /** Knock-down (headed lay-off) to a teammate within this distance (yards). */
  KNOCKDOWN_RANGE: 12,
} as const;
