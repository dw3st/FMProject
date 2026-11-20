/**
 * Stage 11 of the engine rebuild (`.claude/rules/game-engine/keeper.md` → "Stage 11"): FM's goalkeeper. Flag
 * `FM_KEEPER` (`DecisionConfig.ts`). Every number is read from FM (reports 8 and 9) or a body measure, not fitted to a
 * match volume (calibration is stage 21). Distances in metres where the name says so, else yards.
 *
 * Env `FM_KEEPER_OVERRIDES='{"LATERAL_FOLLOW":0.14}'` replaces top-level numbers (scripts and workers).
 */

/** Off-line distance (m) by the ball's distance from the centre of his goal line (m): knots, linear between, flat past
 *  the last. Opponent on the ball (R9 §2): on the line within 35 m, then the band medians 2.7 / 6.0 / 10.5 m at the
 *  centres of 35–52.5 / 52.5–70 / 70+ m. */
export const FM_KEEPER_DEFEND_KNOTS_M: ReadonlyArray<readonly [number, number]> = [
  [35, 0], [43.75, 2.7], [61.25, 6.0], [85, 10.5],
];

/** His own team on the ball (R8 §2.2 bands 25–35 / 35–52.5 / 52.5–70 m: 3.8 / 4.8 / 11; R9 far away 15–22 m). */
export const FM_KEEPER_OWN_KNOTS_M: ReadonlyArray<readonly [number, number]> = [
  [20, 0.5], [30, 3.8], [43.75, 4.8], [61.25, 11], [85, 18.5],
];

const BASE = {
  /** Never quite on the goal line itself (yd): he stands on it, in the pitch. */
  MIN_OFF_LINE_YD: 0.3,
  /** Sideways he follows this share of the ball's offset from the centre (R9 §2: 0.18; R8: 0.14 within 35 m). */
  LATERAL_FOLLOW: 0.18,

  // ── High balls into his box (R9 §2: he claims 28 %, at a median 3.7 m off the line, 16 m at most) ──
  /** He comes for a high ball whose meeting point is at most BASE + SKILL × command yards off his line (command =
   *  mean of positioning and jumping, 0..1), never past the hard cap (FM's 16 m). */
  CLAIM_DEPTH_BASE_YD: 3,
  CLAIM_DEPTH_SKILL_YD: 8,
  CLAIM_DEPTH_MAX_YD: 16 * 1.0936,
  /** ... only when he gets there first: his race time beats every outfield player's (both teams) by this (s). */
  CLAIM_FIRST_MARGIN_S: 0,
  /** ... and in time: his race time is at most the ball's flight to the point plus this (s). */
  CLAIM_TIME_SLACK_S: 0.2,
} as const;

function overrides(): Partial<Record<keyof typeof BASE, number>> {
  const raw = typeof process !== 'undefined' ? process.env?.FM_KEEPER_OVERRIDES : undefined;
  if (!raw) return {};
  try { return JSON.parse(raw) as Partial<Record<keyof typeof BASE, number>>; } catch { return {}; }
}

export const FM_KEEPER: { readonly [K in keyof typeof BASE]: number } = { ...BASE, ...overrides() };
