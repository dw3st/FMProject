/**
 * SetPieceConfig — corners, direct free kicks and the wall, crossed free kicks, throw-ins and the
 * corner sources (Etapa 14, `docs/superpowers/specs/2026-10-02-set-pieces-design.md`,
 * `.claude/rules/game-engine/set-pieces-play.md`).
 *
 * Every tunable number of the set-piece system lives here. Calibrated with
 * `bun scripts/setpiece-calibrate.ts` (see set-pieces-play.md for the measured table).
 */
export const SET_PIECE_CONFIG = {
  // ── Direct free kick ───────────────────────────────────────────────────────
  /** A free kick within this distance of the goal centre (yards) and a central angle is shot directly. */
  DIRECT_FK_RANGE: 30,
  /** Minimum open angle to the goal mouth (radians) for a direct shot (~"central"). */
  DIRECT_FK_MIN_ANGLE: 0.3,
  /** Direct free-kick xG before the wall at FK_XG_NEAR yards with a full angle. */
  FK_XG_BASE: 0.7,
  /** Distance (yards) up to which the distance factor is 1. */
  FK_XG_NEAR: 18,
  /** Distance factor at DIRECT_FK_RANGE (linear in between). */
  FK_XG_FAR_FACTOR: 0.45,
  /** Open angle (radians) at which the angle factor reaches 1. */
  FK_XG_REF_ANGLE: 0.42,

  // ── Wall ───────────────────────────────────────────────────────────────────
  /** Wall distance from the ball, on the ball→goal line (yards). */
  WALL_DISTANCE: 10,
  WALL_MIN: 2,
  WALL_MAX: 5,
  /** Lateral spacing between wall players (yards). */
  WALL_SPACING: 0.9,
  /** Each man in the wall: chance the direct shot strikes the wall (= share of xG blocked). */
  WALL_BLOCK_FACTOR: 0.06,
  /** Rebound off the wall: speed (yards / real-second) and lateral spread (radians, ±). */
  WALL_REBOUND_SPEED: 6,
  WALL_REBOUND_SPREAD: 1.2,

  // ── Box set pieces (corner, crossed free kick) ─────────────────────────────
  /** A free kick within this distance of the goal line (yards) that is not direct is crossed into the box (or played short). */
  FK_CROSS_RANGE: 26,
  /** Attackers sent into the box (2 best aerial defenders + centre-forward + the next best headers). */
  BOX_ATTACKERS: 5,
  /** Defenders of the box set piece who go up from the back line (the two best in the air). */
  BOX_DEFENDERS_UP: 2,
  /** Random jitter (± yards) on each box attacker's spot, so delivery choices vary between corners. */
  BOX_JITTER: 2,
  /** Edge-of-the-box player (rebounds), distance from the goal line (yards). */
  EDGE_DEPTH: 20,
  /** Corner taker's short option: distance from the goal line / touchline (yards). */
  SHORT_DEPTH: 11,
  SHORT_WIDTH: 8,
  /** Players left back on a corner: distance from the goal they attack (yards). */
  REST_DEPTH: 52,
  /** Defending team's outlet (the fastest forward) stays this far from his own goal (yards). */
  OUTLET_DEPTH: 40,
  /** Zone radius around a delivery target for the aerial head count (yards). */
  TARGET_ZONE_RADIUS: 6,
  /** Delivery option scoring (raw, before compress). */
  CORNER_BASE: 0.35,
  CORNER_NUMBERS_WEIGHT: 0.45,
  CORNER_DEFENDER_WEIGHT: 0.8,
  CORNER_DELIVERY_WEIGHT: 0.25,
  CORNER_GK_PENALTY: 0.25,
  /** Short option: base, bonus when nobody is within SHORT_OPEN_RADIUS of the receiver, by build_up. */
  SHORT_BASE: 0.35,
  SHORT_OPEN_BONUS: 0.1,
  SHORT_OPEN_RADIUS: 5,
  SHORT_POSSESSION_BONUS: 0.3,
  SHORT_DIRECT_PENALTY: 0.15,

  /** Crossed free kick: attackers start at the line, so a wider zone counts them (they run onto it). */
  FK_TARGET_ZONE_RADIUS: 8,
  /** Added to the defender's aerial-duel score on a set-piece cross (he is set, goal-side of his man). */
  SET_PIECE_DEFENDER_DUEL_BONUS: 3.2,
  /** Share of aerial fouls at a set-piece cross committed by the attacker (open play: 0.5). */
  SET_PIECE_ATTACKER_FOUL_SHARE: 0.8,
  /**
   * Header from a set-piece cross: the crowd's pressure on the header × this. The few attackers who
   * beat their set marker (SET_PIECE_DEFENDER_DUEL_BONUS) have won the ball cleanly; the full
   * box-crowd pressure would otherwise floor nearly every set-piece header at xG ≈ 0.1.
   */
  SET_PIECE_HEADER_PRESSURE_MULT: 0,

  // ── Countdowns (real seconds) ──────────────────────────────────────────────
  CORNER_COUNTDOWN: 1.2,
  BOX_FREE_KICK_COUNTDOWN: 1.0,
  DIRECT_FREE_KICK_COUNTDOWN: 1.5,

  // ── Throw-in ───────────────────────────────────────────────────────────────
  /** A throw-in reaches teammates within this distance (yards); no long throws. */
  THROW_IN_RANGE: 20,

  // ── Corner sources ─────────────────────────────────────────────────────────
  /** A keeper's save is parried behind for a corner. */
  SAVE_CORNER_CHANCE: 0.5,
  /** An off-target shot was deflected behind by a defender (needs one within SHOT_DEFLECT_RADIUS of the shooter). */
  OFF_TARGET_CORNER_CHANCE: 0.6,
  SHOT_DEFLECT_RADIUS: 6,
  /** A blocked cross goes behind for a corner. */
  CROSS_BLOCK_CORNER_CHANCE: 0.5,
  /** A cross headed clear inside the box goes behind for a corner. */
  CROSS_CLEAR_CORNER_CHANCE: 0.55,
  /** A loose ball over the defending team's goal line with a defender within this distance: his touch, corner. */
  LOOSE_CORNER_RADIUS: 3,
  LOOSE_CORNER_CHANCE: 0.6,
  /** A tackle won near the byline (within TACKLE_CORNER_DEPTH yds, wide of the posts) puts the ball behind. */
  TACKLE_CORNER_CHANCE: 0.3,
  TACKLE_CORNER_DEPTH: 18,

  // ── Set-piece goal attribution ─────────────────────────────────────────────
  /** A goal within this many game-seconds of a corner / free kick in the attacking third / penalty, with the ball kept, is a set-piece goal. */
  SET_PIECE_PHASE_SECONDS: 60,
  /** Free kicks closer than this to the goal they attack open a set-piece phase (yards). */
  SET_PIECE_FK_ZONE: 40,
} as const;
