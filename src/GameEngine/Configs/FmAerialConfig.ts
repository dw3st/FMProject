/**
 * Stage 10 of the engine rebuild (`.claude/rules/game-engine/aerial.md` → "Stage 10"): FM's cross and aerial play.
 * Flag `FM_AERIAL` (`DecisionConfig.ts`). Every number is a design value read from FM (reports 8 and 9) or a body
 * measure, not fitted to a match volume (calibration is stage 21). Yards unless the name says metres.
 *
 * Env `FM_AERIAL_OVERRIDES='{"CONTEST_YD":4}'` replaces top-level numbers (scripts and workers).
 */
const M = 1.0936;

/** FM's decided target zones of an open-play cross (R8 §5, n = 185): depth from the goal line, lateral offset from
 *  the centre toward the crosser's side (+) or away (−), and the share. Six-yard box 64 %, penalty-spot band 28 %,
 *  edge of the box 8 %. */
export const FM_CROSS_ZONES = [
  { kind: 'six_near',    depth: 3.5, side: 4.5,  weight: 0.25 },
  { kind: 'six_far',     depth: 3.5, side: -4.5, weight: 0.22 },
  { kind: 'six_centre',  depth: 3.5, side: 0,    weight: 0.17 },
  { kind: 'spot_centre', depth: 12,  side: 0,    weight: 0.19 },
  { kind: 'spot_near',   depth: 12,  side: 9,    weight: 0.045 },
  { kind: 'spot_far',    depth: 12,  side: -9,   weight: 0.045 },
  { kind: 'edge',        depth: 19,  side: 0,    weight: 0.08 },
] as const;

export type FmCrossZoneKind = (typeof FM_CROSS_ZONES)[number]['kind'];

const BASE = {
  // ── Cross origin (R8: median 5.5 m from the byline, |x| 23 m, 66 % from the byline zone) ──
  /** A cross is played from at most this far from the goal line (yd); the near-line penalty of the old model is off. */
  CROSS_MAX_DIST_TO_LINE_YD: 35, // stage 21: 25 → 35, crosses 20 → ~58 a match (FM 64)
  /** Inside the box a cut-back cross from within this of the byline (wide of the six-yard box). */
  CROSS_BYLINE_DIST_YD: 6,
  /** The drawn target lands uniformly within this of the zone's centre (the passer's error comes on top). */
  ZONE_SPREAD_YD: 1.5,

  // ── Contact in the air (R9 §3: crosses peak 4.0 m, met at 1.8 m, 82 % before the grass) ──
  /** No contact in the first part of the flight: the block at the kick (`BLOCK_RADIUS`) covers it. */
  CONTACT_MIN_FLIGHT_S: 0.25,
  /** Sub-step of the contact search along the flight (s). */
  SUBSTEP_S: 0.02,
  /** Top of an outfield player's head standing (1.83 m) and the most a jump adds (× jumping 0..1, 0.6 m). */
  HEAD_TOP_YD: 1.83 * M,
  JUMP_YD: 0.6 * M,
  /** A keeper's hands standing and the jump, inside his own box only. */
  KEEPER_HANDS_YD: 2.3 * M,
  KEEPER_JUMP_YD: 0.5 * M,
  /** Horizontal reach to the ball from the body (yd): outfield a lean / stretch of the neck, keeper the arms. */
  BODY_REACH_YD: 0.9,
  KEEPER_REACH_YD: 1.5,
  /** FM's "met in the air": contact above 1.2 m. */
  AIR_Z_YD: 1.2 * M,
  /** Players going for a high ball attack the spot where it comes down through FM's contact height (1.8 m), not its
   *  landing point. */
  MEET_Z_YD: 1.8 * M,
  /** Rivals contest the contact within this of it (R9 §4 "the nearest rival within 3 m"). */
  CONTEST_YD: 3 * M,

  // ── The duel at the contact (R9 §4: the winner had the better jumping 63 %, heading 55 %, strength 61 %;
  //    centre-backs win 90–100 % of what they contest) ──
  DUEL_HEADING: 0.30,
  DUEL_JUMP: 0.40,
  DUEL_STRENGTH: 0.15,
  /** Standing still under the ball (speed 0 → 1, `STILL_SPEED_YD` yd/s or more → 0). */
  DUEL_STILL: 0.15,
  STILL_SPEED_YD: 6,
  /** The contestant nearer the goal under attack (goal-side of his rival). */
  DUEL_GOAL_SIDE: 0.20,
  /** Floor added to both scores. */
  DUEL_BASE: 0.10,
} as const;

function overrides(): Partial<Record<keyof typeof BASE, number>> {
  const raw = typeof process !== 'undefined' ? process.env?.FM_AERIAL_OVERRIDES : undefined;
  if (!raw) return {};
  try { return JSON.parse(raw) as Partial<Record<keyof typeof BASE, number>>; } catch { return {}; }
}

export const FM_AERIAL: { readonly [K in keyof typeof BASE]: number } = { ...BASE, ...overrides() };
