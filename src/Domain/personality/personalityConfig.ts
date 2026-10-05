/**
 * Personality constants (`docs/superpowers/specs/2026-10-05-personality-design.md`,
 * `.claude/rules/game/personality.md`). Every effect is linear in t = (v − 10,5) / 9,5 and is 0 at t = 0.
 */
export const PERSONALITY = {
  MIN: 1,
  MAX: 20,
  /** Mean of the distribution: every effect is neutral here. */
  NEUTRAL: 10.5,
  /** t = (v − NEUTRAL) / SPAN, −1..1. */
  SPAN: 9.5,
  /** Band upper bounds (inclusive): 1–4 very low, 5–8 low, 9–12 medium, 13–16 high, 17–20 very high. */
  BAND_MAX: { very_low: 4, low: 8, medium: 12, high: 16 } as const,
  /** Loyalty = round(OWN × own draw + AMBITION × (21 − ambition)): a mild ambition × loyalty anticorrelation. */
  LOYALTY_OWN: 0.75,
  LOYALTY_AMBITION: 0.25,
  /** The summary word needs a trait at least this far from NEUTRAL (else "balanced"). */
  SUMMARY_MIN_DEV: 4.5,

  // ── Development (professionalism) ──
  /**
   * DP × (1 + DP_WEIGHT × t). 0,08 (spec) → 0,15: at 0,08 a young model professional (18) vs a sloppy
   * one (3) opened only 0,13 of overall in 4 seasons (M3 target 0,2–0,4); at 0,15, 0,23. The world's
   * mean by age band does not move (≤ 0,003).
   */
  DP_WEIGHT: 0.15,
  /** Age decay × (1 − DECAY_WEIGHT × t). */
  DECAY_WEIGHT: 0.1,
  /** From this t a professional ignores the low-morale DP loss. */
  PRO_MORALE_SHIELD_T: 0.4,

  // ── Discipline (temperament) ──
  /**
   * Foul chance × (1 + FOUL_WEIGHT × t); yellow × (1 + YELLOW_WEIGHT × t); straight red × (1 + RED_WEIGHT × t).
   * FOUL_WEIGHT 0,35 (spec) → 0,45: at 0,35 a side at 20 fouled only 1,45× a side at 1 (M2 target 1,5–2×; the
   * foul-chance cap 0,9 flattens it); at 0,45, 1,82×.
   */
  FOUL_WEIGHT: 0.45,
  YELLOW_WEIGHT: 0.2,
  RED_WEIGHT: 0.4,

  // ── Morale (human club) ──
  /** Every event delta × (1 + MORALE_VOLATILITY × t_temperament). */
  MORALE_VOLATILITY: 0.25,
  /** Minutes deficit × (1 + MINUTES_AMBITION × t_ambition). */
  MINUTES_AMBITION: 0.3,
  /** Transfer request below 25 + TRANSFER_REQUEST_AMBITION × t_ambition. */
  TRANSFER_REQUEST_AMBITION: 8,
  /** wants_move below 60 + WANTS_MOVE_AMBITION × t_ambition. */
  WANTS_MOVE_AMBITION: 10,
  /** A bid of a stronger club only triggers wants_move with ambition at least this. */
  STRONGER_BID_MIN_AMBITION: 13,
  /** Listed unasked × (1 + LISTED_LOYALTY × t_loyalty). */
  LISTED_LOYALTY: 0.5,
  /** Broken promise × (1 − BROKEN_PROMISE_LOYALTY × t_loyalty). */
  BROKEN_PROMISE_LOYALTY: 0.3,
  /** Loyal: never asks for a transfer from morale alone; wants_move needs morale below LOYAL_WANTS_MOVE_BELOW. */
  LOYAL_MIN: 15,
  LOYAL_WANTS_MOVE_BELOW: 40,
  /** "Demand more" works on a professional (at least this) as on a content player. */
  PRO_DEMAND_MIN: 13,

  // ── Contracts and transfers ──
  /** Wage demand × (1 + AMBITION_DEMAND × t_ambition). */
  AMBITION_DEMAND: 0.08,
  /** Own-club renewal × (1 − LOYALTY_RENEWAL × max(0, t_loyalty) × min(1, seasons / LOYALTY_FULL_SEASONS)). */
  LOYALTY_RENEWAL: 0.1,
  LOYALTY_FULL_SEASONS: 4,
  /** Signing by a club of his nationality's country × (1 − COMPATRIOT × max(0, t_loyalty)). */
  COMPATRIOT: 0.05,
  /** Each natural tier below his club: + SMALLER_CLUB_STEP × max(0, t_ambition) on the demand. */
  SMALLER_CLUB_STEP: 0.1,
  /** Refuses a club this many tiers smaller (or more) with ambition at least SMALLER_CLUB_REFUSE_AMBITION. */
  SMALLER_CLUB_REFUSE_STEPS: 2,
  SMALLER_CLUB_REFUSE_AMBITION: 17,
  /** AI seller score: + SELL_AMBITION × t_ambition when the buyer is a bigger club, − SELL_LOYALTY × max(0, t_loyalty). */
  SELL_AMBITION: 0.1,
  SELL_LOYALTY: 0.1,

  // ── Scout ──
  /** Shown trait = real + round(scoutNoise × SCOUT_SCALE × noise(−1..1)), clamped 1..20. */
  SCOUT_SCALE: 4,
  /** From this scout noise temperament and professionalism read as unknown. */
  SCOUT_UNKNOWN_NOISE: 1,
  /** From this scout noise the view is marked uncertain (same threshold as the overall range). */
  SCOUT_UNCERTAIN_NOISE: 0.5,
} as const;
