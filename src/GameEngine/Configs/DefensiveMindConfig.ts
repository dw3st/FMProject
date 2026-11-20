/**
 * The mind off the ball and in defence (stage 16, `Domain/DefensiveMind.ts`, `decisions.md` → "Stage 16"), and the
 * consistency cap on the attribute modifiers (`Domain/ConsistencyCap.ts`).
 *
 * Every outfield player who does not hold the ball rolls his decisions, anticipation, concentration and aggression on
 * FM's 1..100 scale (the holder's attribute test: mood decides the shape) once per window; the rolls modify the
 * defensive and off-ball intent scores the engine already computes (never the scoring itself). Nothing is tuned to
 * volume: the values are the design's starting points.
 *
 * `DEFENSIVE_MIND_OVERRIDES='{"LAPSE_ROLL":4}'` (env, read once at load) for measurement runs.
 */
export const DEFENSIVE_MIND = {
  /** Seconds of play a window is held (the holder mind's 4 decision ticks). */
  WINDOW_S: 0.8,
  /** Roll = U·(a + ROLL_PLUS) on the 100 scale (aggression U·(a + AGGR_PLUS), FM's +5). */
  ROLL_PLUS: 2,
  AGGR_PLUS: 5,
  /** Below the form window a concentration roll under LAPSE_ROLL (after the fatigue division) is a lapse. FM's own is a
   *  zero roll (1); the holder mind uses 4 (FM27's ~4% per decision); 2 here, a defender lapses about half as often. */
  LAPSE_ROLL: 2,

  /** Concentration (derived per match): weights over anticipation, decisions (0..1) and pressing (roster / 10), plus
   *  professionalism (personality shift −1..1). */
  CONC_ANTICIPATION: 0.45,
  CONC_DECISIONS: 0.35,
  CONC_PRESSING: 0.2,
  CONC_PROF: 0.05,
  /** Aggression (derived per match): tackling and strength (roster / 10), plus temperament (−1..1: 1 = hot head). */
  AGGR_TACKLING: 0.5,
  AGGR_STRENGTH: 0.3,
  AGGR_TEMP: 0.15,
  /** FM rolls the aggression mood as U·(150 − a) against the form state; ours is mood (−1..1) × this. */
  AGGR_MOOD_SCALE: 50,

  /** Relative noise on the defensive intent scores: σ = MIN + SPAN·(1 − test), test = ((dec + antic)/2 on the world
   *  scale)·(0.4 + 0.6·luck). The design's 0.02 + 0.20 is the bound; the holder's absolute σ cost goals when wide. */
  DEF_SIGMA_MIN: 0.01,
  DEF_SIGMA_SPAN: 0.08,
  /** Off-ball: the same form (design 0.03 + 0.25). */
  OFF_SIGMA_MIN: 0.015,
  OFF_SIGMA_SPAN: 0.1,
  /** Aggression on the engagement intents: press_holder and step_into_carry_lane × (1 + W·k),
   *  k = clamp((roll − CENTER)/CENTER, −1, 1). CENTER ≈ the world's median normal roll (aggression ~0.4 → U·45). */
  AGGR_W: 0.15,
  AGGR_CENTER: 22,
  /** Concentration lapse in defence: the mark is dropped (track_mark → hold_shape) and the engagement intents held back
   *  (× LAPSE_ENGAGE_MULT). */
  LAPSE_ENGAGE_MULT: 0.5,
  /** Anticipation reads the mark's run: the track_mark target uses the mark `lookahead × luck × SHARE` seconds ahead
   *  (lookahead = `anticipationLookahead`, `Movement.ts`). */
  ANTIC_MARK_SHARE: 0.6,
  /** Off-ball: anticipation and flair on make_run × (1 + W·k) (k as for aggression, CENTER the median anticipation
   *  roll); flair k = 2·(world-scale flair) − 1. */
  OFF_ANTIC_RUN_W: 0.08,
  OFF_ANTIC_CENTER: 16,
  OFF_FLAIR_RUN_W: 0.06,
  /** Off-ball lapse: he stands in his zone (hold_space takes the best score, the others × OFF_LAPSE_MULT). */
  OFF_LAPSE_MULT: 0.5,

  /** Consistency cap (FM): a summed positive modifier m above c = MIN + SPAN·consistency (100 scale) becomes
   *  (m + 2c + 1)/3; a negative one below NEG_FROM becomes −(NEG_K − m)/3. */
  CAP_MIN: 5,
  CAP_SPAN: 5,
  CAP_NEG_FROM: -20,
  CAP_NEG_K: 41,
};

try {
  const raw = typeof process !== 'undefined' ? process.env?.DEFENSIVE_MIND_OVERRIDES : undefined;
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of Object.keys(DEFENSIVE_MIND) as (keyof typeof DEFENSIVE_MIND)[]) {
      if (typeof parsed[k] === 'number') (DEFENSIVE_MIND as Record<string, number>)[k] = parsed[k] as number;
    }
  }
} catch { /* ignore a malformed override */ }
