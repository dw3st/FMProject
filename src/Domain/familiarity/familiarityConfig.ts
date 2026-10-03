/** Style familiarity constants (`docs/superpowers/specs/2026-10-02-style-training-design.md`). */
export const FAMILIARITY = {
  MIN: 0,
  MAX: 100,
  /** Neutral value: `familiarityFactor` is exactly 0 here (no effect on the engine). */
  NEUTRAL: 50,
  /** Value of a key the squad has never trained (absent from `styleFamiliarity`). */
  INITIAL: 50,
  /** The style saved in tactics.json at career creation starts here — same as the AI's own style (fair start). */
  SAVED_STYLE_INITIAL: 75,
  /** AI clubs (rules, not simulation): implicit familiarity in their own style... */
  AI_OWN_STYLE: 75,
  /** ...and in everything else. */
  AI_OTHER: 50,
  /** Points a training session adds to the focus, times the assistant's `devMult`, before the soft cap. */
  GAIN_PER_SESSION: 2,
  /** Gain multiplier by training intensity (on top of the assistant's `devMult`). */
  INTENSITY_GAIN: { light: 0.7, normal: 1, heavy: 1.3 },
  /** Points every non-focus key loses per training day. */
  DECAY_PER_DAY: 0.15,
  /** Decay never takes a key below this. */
  DECAY_FLOOR: 30,
  /** quickSim: team strength × (1 + QUICKSIM_STRENGTH × familiarityFactor). */
  QUICKSIM_STRENGTH: 0.02,
} as const;
