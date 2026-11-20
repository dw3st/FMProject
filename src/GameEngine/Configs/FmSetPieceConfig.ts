/**
 * Stage 12 of the engine rebuild (`.claude/rules/game-engine/set-pieces-play.md` → "Stage 12"): FM's set pieces. Flag
 * `FM_SET_PIECES` (`DecisionConfig.ts`). The shares and distances are read from FM (reports 6, 8 and 9), not fitted
 * to a match volume (calibration is stage 21). Distances in metres where the name says so, else yards.
 *
 * Env `FM_SET_PIECES_OVERRIDES='{"THROW_BACK_SHARE":0.3}'` replaces top-level numbers (scripts and workers).
 */
const BASE = {
  // ── Corner (R8 §4.1) ──────────────────────────────────────────────────────
  /** Decided target of a corner: the centre of the six-yard line (3.5 m out) 58 %, 5 m to the near or far post 26 %
   *  (split evenly), played short 15 % (the 1 % left goes to the centre). */
  CORNER_SIX_SHARE: 0.59,
  CORNER_POST_SHARE: 0.26,
  CORNER_SHORT_SHARE: 0.15,
  /** The decided points: this far out from the goal line (m), the posts this far sideways from the centre (m). */
  CORNER_TARGET_DEPTH_M: 3.5,
  CORNER_POST_LATERAL_M: 5,

  // ── Set-piece launch error (R6: base errors 85 / 90 for the set-piece states, 95 for a pass) ──
  /** A delivery or a restart pass (corner, crossed free kick, throw-in, goal kick) has FM's set-piece base 90 against
   *  the pass's 95, with no pressure. The direct free kick (85) is stage 7's shot. */
  BASE_SET_PIECE_PASS: 90,
  BASE_PASS: 95,

  // ── Throw-in (R8 §4.2: median 9.4 m, p90 20 m, 40 % backward, kept 95 %) ──
  THROW_BACK_SHARE: 0.4,
  /** Teammates within this distance (m) can be thrown to (FM's p90). */
  THROW_RANGE_M: 20,
  /** Short options offered next to the thrower (layout, not FM numbers): back along the line, forward along it, and
   *  infield, about FM's median length away (m). */
  THROW_OPTION_BACK_M: 9,
  THROW_OPTION_BACK_IN_M: 4,
  THROW_OPTION_FWD_M: 9,
  THROW_OPTION_FWD_IN_M: 3,
  THROW_OPTION_IN_M: 10,
  /** Opponents stay at least this far from the thrower (m, the 2 m law). */
  THROW_OPP_MIN_M: 2,

  // ── Goal kick (R8: 62 % short, median 15 m, to (|x| 10–15 m, 2.5 m off the line); 38 % long, median 60 m, landing
  //    just past half-way, |x| ≈ 8 m) ──
  GOAL_KICK_SHORT_SHARE: 0.62,
  /** Where the centre-back takes the short goal kick: sideways from the centre (m) and off the goal line (m). */
  GK_SHORT_LATERAL_M: 12.5,
  GK_SHORT_DEPTH_M: 2.5,
  /** The long goal kick's landing: off the own goal line (m; half-way 52.5 + 12) and sideways from the centre (m). */
  GK_LONG_FROM_LINE_M: 64.5,
  GK_LONG_LATERAL_M: 8,

  // ── Direct free kick (R8: shot from 26–29 m) ──
  /** A free kick within this distance of the goal centre (m), central and outside the box, is shot directly. */
  DIRECT_FK_RANGE_M: 29,
} as const;

function overrides(): Partial<Record<keyof typeof BASE, number>> {
  const raw = typeof process !== 'undefined' ? process.env?.FM_SET_PIECES_OVERRIDES : undefined;
  if (!raw) return {};
  try { return JSON.parse(raw) as Partial<Record<keyof typeof BASE, number>>; } catch { return {}; }
}

export const FM_SET_PIECES: { readonly [K in keyof typeof BASE]: number } = { ...BASE, ...overrides() };

/** 1 m in yards. */
export const SP_YD_PER_M = 1.0936;
