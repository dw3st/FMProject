/**
 * Engine rebuild stage 15 (`.claude/rules/game-engine/team-shape.md`): team shape, pressing in the pass shadow,
 * off-ball actions held by time and runs on the last defender's shoulder. Switches in `DECISION_FLAGS` (`FM_SHAPE`,
 * `OOP_ZONES`, `PASS_SHADOW`, `ACTION_HOLD`, `SHOULDER_RUNS`).
 *
 * The shape numbers are FM's measured averages (report 7, Balanced against Balanced, metres × 1.0936 = yards). The
 * ball dependence of the line and the zone scores are first readings of FM's mechanism, not a fit to a volume: nothing
 * here is calibrated (stage 21). `SHAPE_OVERRIDES='{"OUT_BACK_YD":26}'` (env, read once at load) tunes the numbers.
 */

export const TEAM_SHAPE = {
  /** Measurement switches (1 = on): FM's block in possession / out of possession. */
  APPLY_IN: 1,
  APPLY_OUT: 1,
  // ── 1. The block (FM: back line 53.5 / 22 m from own goal, back-four → front-two span 26.5 / 24 m, width 37 / 34 m) ──
  /** Back line (mean of the four deepest outfield anchors), yd from the team's own goal line, with the ball on the
   *  halfway line (FM's mean ball: holder decisions split 28 / 43 / 29% over the thirds). */
  IN_BACK_YD: 58,
  OUT_BACK_YD: 24,
  /** ...moves this many yd per yd of ball depth from halfway (the block slides with the ball, FM: ~30 m between the
   *  phases at the same length). */
  IN_BALL_SLOPE: 0.5,
  OUT_BALL_SLOPE: 0.35,
  /** ...kept within these depths (yd from own goal). */
  IN_MIN_YD: 30,
  IN_MAX_YD: 75,
  OUT_MIN_YD: 8,
  OUT_MAX_YD: 42,
  /** The `defensive_line` tactic moves the line out of possession (DEFENSIVE_LINE_HEIGHT − 0.6) × this (yd). */
  LINE_TACTIC_YD: 20,
  /** Back four → front two, the whole shape scaled to this span (yd). */
  IN_SPAN_YD: 29,
  OUT_SPAN_YD: 26,
  /** Outfield anchors spread to this width (yd), × the width tactic on top. */
  IN_WIDTH_YD: 40,
  OUT_WIDTH_YD: 37,
  /** Out of possession a back-liner holding or marking never drops more than this (yd) behind the line. */
  LINE_SLACK_YD: 1.5,

  // ── 2. Out-of-possession zones (FM's position scoring: home 14–20, neighbours 11–17, next 8–14, far 3–8) ──
  ZONE_HOME: 17,
  ZONE_NEIGHBOUR: 14,
  ZONE_NEXT_LINE: 11,
  ZONE_FAR: 5,
  /** A covering role (CDM, `cb_cover`) scores the zone behind his this much more; a pressing role (FWD) the zone ahead. */
  ZONE_ROLE_BONUS: 3,
  /** Value of a zone for a candidate: score − ZONE_DIST_COST × distance (yd) to it. */
  ZONE_DIST_COST: 0.35,
  /** A zone counts as vacant when its owner is this far from it (yd) or not holding the shape. */
  ZONE_LEFT_YD: 10,
  /** Only vacant zones within this of the ball are covered (yd); a cover comes from within COVER_MAX_YD of the zone. */
  COVER_BALL_YD: 30,
  COVER_MAX_YD: 20,
  /** ...by a holder for whom it is at least this much deeper or nearer the ball than his own zone (yd). */
  COVER_GAIN_YD: 3,

  // ── 3. Pressing in the pass shadow (FM: the attacker's press point is the midpoint of carrier and receiver) ──
  /** Receivers considered for the shadow: the holder's teammates within this distance of him (yd). */
  SHADOW_RECEIVER_YD: 35,
  /** The press point never closer to the holder than this (yd): the attacker cuts the lane, he does not engage. */
  SHADOW_MIN_HOLDER_YD: 4,
  /** Pressing states: the predicted ball in a 3×3 grid (depth third from the defending side's goal × lateral third). The
   *  shadow press applies with the ball outside our defensive third (states 3–8). */
  SHADOW_FROM_STATE: 3,

  // ── 4. Actions held by time (FM: default positioning 10–20 s, short actions ~5 s) ──
  /** A short off-ball / defensive action (marking, stepping into a carry lane, offering, a run) is held this long (s of
   *  play) unless the ball changes side or pressing calls. */
  SHORT_HOLD_S: 5,

  // ── 5. Runs on the shoulder (stage 13 left them out: FM's offsides come from runs timed on the pass) ──
  /** A runner within this distance (yd) of his read of the line, behind it, stands on the shoulder. */
  SHOULDER_YD: 3,
  /** ...the holder within this distance of him (yd), free (nearest opponent beyond HOLDER_FREE_YD). */
  HOLDER_RANGE_YD: 45,
  HOLDER_FREE_YD: 3,
  /** He goes when the holder plays forward (the cue); a poor reader goes later by up to REACT_S × (1 − anticipation). */
  REACT_S: 0.4,
  /** ...or early, before any pass: chance per second EARLY_PER_S × (1 − anticipation) (a mistimed run). */
  EARLY_PER_S: 0.25,
  /** A run lasts this long (s): past the line he keeps going, then checks back. */
  GO_S: 1.5,
  /** While going his target is this far beyond his position, toward goal (yd). */
  GO_AHEAD_YD: 10,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.SHAPE_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(TEAM_SHAPE) as (keyof typeof TEAM_SHAPE)[]) {
      const v = parsed[k];
      if (typeof v === 'number') (TEAM_SHAPE as Record<string, unknown>)[k] = v;
    }
  }
} catch { /* ignore a malformed override */ }
