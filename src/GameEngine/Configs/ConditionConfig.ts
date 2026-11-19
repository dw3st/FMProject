/**
 * FM condition and substitutions (engine rebuild stage 14, `.claude/rules/game/fitness.md` → "FM condition"). Behind
 * `DECISION_FLAGS.FM_CONDITION`; off = the drain, half-time recovery and AI substitution rule of before.
 *
 * FM's curve (report 9 §6): outfield 98–100 at kick-off, ~77.5 at half time, ~73.5 at 90' (lifted by the changes),
 * minimum ~60; +2 at the break; keepers end at 94–99. The drain per game-second is `STAMINA_COST[action]` ×
 * `DRAIN_SCALE` × the headroom above `FLOOR` (the drain fades as the player tires: steep first half, flatter second),
 * keepers × `GK_DRAIN_SCALE`. These shape the curve itself, the behaviour of the stage; not a volume calibration.
 */
export const CONDITION = {
  /** Multiplies the legacy per-action cost under the FM curve. */
  DRAIN_SCALE: 2.0,
  /** Condition the drain fades toward: cost × (energy − FLOOR) / (100 − FLOOR), 0 at the floor. */
  FLOOR: 60,
  /** Keepers barely tire (FM: 94–99 at the end). */
  GK_DRAIN_SCALE: 0.07,
  /** Points recovered at half time (stamina 5); × (1 − SPAN/2 + SPAN × stamina/10). Never above the kick-off value. */
  HALF_TIME_RECOVERY: 2,
  HALF_TIME_STAMINA_SPAN: 0.5,
  /** AI substitutions (FM: 3–4 a match from ~55', the player at 55–75 %; one at 86 % looks tactical). */
  AI_SUBS: {
    /** No AI change before this match minute (injuries apart). */
    FROM_MINUTE: 55,
    /** A player below this condition is a fatigue candidate. */
    CONDITION: 75,
    /** The bench player must be at least this much fresher. */
    BENCH_MARGIN: 10,
    /** From this minute, a side with fewer than `MIN_CHANGES` changes freshens its most tired player anyway. */
    TACTICAL_FROM: 70,
    MIN_CHANGES: 3,
    /** Changes the AI plans (the rest stays for injuries). */
    MAX_CHANGES: 4,
    /** At most this many changes per check (FM's double change). */
    PER_CHECK: 2,
  },
} as const;
