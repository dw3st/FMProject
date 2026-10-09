/** Every referee constant (`.claude/rules/game/referees.md`). */
export const REFEREE = {
  /** Foul chance × (1 + FOUL_WEIGHT × s). */
  FOUL_WEIGHT: 0.08,
  /** Yellow per foul × (1 + YELLOW_WEIGHT × s). */
  YELLOW_WEIGHT: 0.15,
  /** Direct red per foul × (1 + RED_WEIGHT × s). */
  RED_WEIGHT: 0.25,
  /** Both cards ÷ this when s ≠ 0: the rigor spread is convex in the reds (second yellows), so the world volume needs a small normaliser (`referee-measure.ts quick`). */
  CARD_NORM: 1.01,
  /** |s| ≥ BAND: strict / lenient. */
  BAND: 0.35,
  MIN_POOL: 10,
  POOL_PER_ROUND: 1.5,
  ASSISTANTS_PER_REFEREE: 2,
  /** Days between two appointments of the same official. */
  REST_DAYS: 3,
  RECENT_PER_CLUB: 3,
  PICK_NOISE: 6,
  CONTINENTAL_MIN_QUALITY: 75,
  RETIRE_AGE: 50,
  RETIRE_FROM: 46,
  RETIRE_CHANCE: 0.25,
  GENERATED_AGE: [30, 44] as const,
  GENERATED_QUALITY: [15, 55] as const,
  QUALITY_LIMITS: [15, 98] as const,
  GENERATED_FIFA_QUALITY: 80,
  /** Referee kit for the face: black shirt, yellow collar. */
  FACE_COLORS: ["#111418", "#111418", "#f5d020"] as const,
} as const;
