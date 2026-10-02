/**
 * AerialConfig — crosses, long balls, aerial duels, goalkeeper claims and headers
 * (Etapa 13, `docs/superpowers/specs/2026-10-02-aerial-play-design.md`,
 * `.claude/rules/game-engine/aerial.md`).
 *
 * Every tunable number of the aerial system lives here. Calibrated with
 * `bun scripts/aerial-calibrate.ts` (see aerial.md for the measured table).
 */
export const AERIAL_CONFIG = {
  // ── Flight ────────────────────────────────────────────────────────────────
  /** Yards per real-second of a high ball (a regular pass flies at 28). */
  AERIAL_YARDS_PER_SEC: 22,
  /** Opponents within this distance of the passer at the kick may block the ball (yards). */
  BLOCK_RADIUS: 2,
  /** Chance that the closest opponent inside BLOCK_RADIUS blocks the high ball. */
  BLOCK_CHANCE: 0.35,
  /** Landing error: σ = (1 − passingSkill) × MAX_ERROR / 2 (yards). */
  CROSS_MAX_ERROR: 4,
  LONG_BALL_MAX_ERROR: 6,

  // ── Cross candidate zone ───────────────────────────────────────────────────
  /** The holder must be within this distance of the goal line he attacks (final third). */
  CROSS_MAX_DIST_TO_LINE: 34,
  /** Outside the central corridor: |y − centre| ≥ this (yards). */
  CROSS_MIN_WIDTH: 13,
  /** Close to the byline: any position wide of the posts within this distance of the line counts. */
  CROSS_BYLINE_DIST: 12,

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
  ATTACKER_REACH_RADIUS: 14,

  // ── Cross scoring ──────────────────────────────────────────────────────────
  /** Raw base of any viable target (at least one attacker in the zone). */
  CROSS_BASE: 0.15,
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
  CROSS_STRONG_RAW: 1.0,

  // ── Long ball ──────────────────────────────────────────────────────────────
  /** Receiver must be at least this far ahead of the holder (attack direction, yards). */
  LONG_BALL_MIN_PROGRESS: 22,
  LONG_BALL_MIN_DIST: 28,
  LONG_BALL_MAX_DIST: 65,
  /** The holder must be at most this far from his own goal line (yards). */
  LONG_BALL_MAX_HOLDER_DEPTH: 60,
  /** Lead in front of the receiver (attack direction, yards). */
  LONG_BALL_LEAD: 3,
  /** Defenders within this radius of the landing point contest the ball. */
  LONG_BALL_CONTEST_RADIUS: 7,
  LONG_BALL_PROGRESS_WEIGHT: 0.30,
  LONG_BALL_SPACE_WEIGHT: 0.20,
  LONG_BALL_AERIAL_WEIGHT: 0.20,
  LONG_BALL_PASS_WEIGHT: 0.10,
  /** compress() calibration for the long ball action. */
  LONG_BALL_STRONG_RAW: 1.0,

  // ── Aerial duel ────────────────────────────────────────────────────────────
  /** Players within this distance of the landing point contest the ball in the air (yards). */
  AERIAL_RADIUS: 3,
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
  /** Speed of a punched / cleared ball (yards per real-second, then friction). */
  PUNCH_SPEED: 9,
  CLEARANCE_SPEED: 8,
  /** Lateral spread of a clearance / punch direction (radians, ±). */
  CLEARANCE_SPREAD: 0.9,
  /** A cross landing within this distance of the byline: chance a defensive header goes behind. */
  CLEARANCE_CORNER_DEPTH: 9,
  CLEARANCE_CORNER_CHANCE: 0.3,

  // ── Header ─────────────────────────────────────────────────────────────────
  /** An attacker winning the ball within this distance of the goal line heads at goal (yards). */
  HEADER_RANGE: 15,
  /** Minimum open angle to head at goal (radians). */
  HEADER_MIN_ANGLE: 0.18,
  /** Header xG = computeXG × this. */
  HEADER_XG_MULT: 0.55,
  /** Heading → finishing multiplier range (replaces shootAccuracy's SHOOTER_EFFECT). */
  HEADER_EFFECT_MIN: 0.8,
  HEADER_EFFECT_MAX: 1.3,
  /** Knock-down (headed lay-off) to a teammate within this distance (yards). */
  KNOCKDOWN_RANGE: 12,
} as const;
