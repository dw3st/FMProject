/**
 * Morale and talks constants (`docs/superpowers/specs/2026-10-04-morale-talks-design.md`,
 * `.claude/rules/game/morale.md`).
 */
import type { MoraleBand, SquadStatus } from "@/types/moraleTypes";

export const MORALE = {
  MIN: 0,
  MAX: 100,
  /** Start value and neutral point: the match effect is exactly 0 here. */
  NEUTRAL: 65,

  /** Bands (lower bound, inclusive): >= 80 very happy, 60–79 content, 40–59 neutral, 25–39 unhappy, < 25 furious. */
  BAND_MIN: { very_happy: 80, content: 60, neutral: 40, unhappy: 25 } as const,

  // ── Match effect ────────────────────────────────────────────────────────
  /** Attributes × (1 + EXECUTION_STAT_SCALE × factor) — same scale as style familiarity. */
  EXECUTION_STAT_SCALE: 0.02,
  /** Factor at morale 100 (it is −1 at 0 and 0 at NEUTRAL). */
  FACTOR_AT_MAX: 0.5,
  /** quickSim: line strengths × (1 + QUICKSIM_STRENGTH × factor), only when a side morale is given. */
  QUICKSIM_STRENGTH: 0.02,

  // ── Development, contract ───────────────────────────────────────────────
  /** DP multiplier by band. */
  DP_MULT: { very_happy: 1.05, content: 1, neutral: 1, unhappy: 0.95, furious: 0.9 } as Record<MoraleBand, number>,
  /** Wage demand multiplier of an unhappy (or furious) player. */
  UNHAPPY_DEMAND_MULT: 1.15,

  // ── Squad status and minutes ────────────────────────────────────────────
  /** Official matches in a minutes window. */
  WINDOW: 5,
  /** A window needs at least this many matches before it counts. */
  WINDOW_MIN_MATCHES: 3,
  /** Expected matches (full-match equivalents) per window of 5: [lo, hi]. */
  EXPECTED: {
    key: [4, 5], starter: [3, 4], rotation: [2, 3], backup: [0, 1], youth: [0, 1],
  } as Record<SquadStatus, [number, number]>,
  /** Monday minutes delta: below lo, −MINUTES_DEFICIT_SLOPE per missing match (rounded), at least −1. */
  MINUTES_DEFICIT_SLOPE: 1.5,
  MINUTES_MIN_DELTA: -6,
  MINUTES_MAX_DELTA: 3,
  /** Suggested status: starters per line (an XI ~4-3-3), rotation players per line. */
  LINE_STARTERS: { GK: 1, Defender: 4, Midfielder: 3, Forward: 3 },
  LINE_ROTATION: { GK: 0, Defender: 2, Midfielder: 2, Forward: 1 },
  /** Key: among the squad's top KEY_COUNT by rating, and a starter. */
  KEY_COUNT: 3,
  /** Not a starter and this young: youth. */
  YOUTH_MAX_AGE: 21,

  // ── Events ──────────────────────────────────────────────────────────────
  WIN: 1,
  LOSS: -1,
  GOAL: 1,
  GOOD_RATING: 7.5,
  GOOD_RATING_BONUS: 1,
  /** Cap of the personal bonus (goals + rating) per match. */
  MATCH_PERSONAL_CAP: 2,
  PROMISE_KEPT: 8,
  PROMISE_BROKEN: -15,
  PROMISE_MADE: 3,
  RENEWAL_ACCEPTED: 6,
  /** The club turned down a contract talk. */
  RENEWAL_REFUSED: -10,
  LISTED_UNASKED: -8,
  PRAISE: 2,
  /** "Demand more": +DEMAND_GOOD for a content player, DEMAND_BAD otherwise. */
  DEMAND_GOOD: 1,
  DEMAND_BAD: -3,
  REFUSE: -5,
  /** Weekly drift towards NEUTRAL (share of the distance). */
  DRIFT: 0.05,

  // ── Talks and promises ──────────────────────────────────────────────────
  /** Praise / demand works once per this many days. */
  PRAISE_EVERY_DAYS: 30,
  /** A talk request stays open this long; unanswered = refused. */
  TALK_VALID_DAYS: 14,
  /** After a talk is answered, no new request from him for this long. */
  TALK_QUIET_DAYS: 28,
  /** Minutes talk: morale below this and below the expected minutes. */
  MINUTES_TALK_BELOW: 40,
  /** Contract talk: key/starter in the last CONTRACT_TALK_DAYS of his contract. */
  CONTRACT_TALK_DAYS: 183,
  /** Chance talk (youth): morale at least this and recent ratings at least YOUTH_TALK_RATING, rising. */
  YOUTH_TALK_MORALE: 70,
  YOUTH_TALK_RATING: 6.8,
  /** wants_move: a bid arrives and his morale is below this (or the bidder is a stronger side). */
  WANTS_MOVE_BELOW: 60,
  /** New requests per week at most. */
  MAX_NEW_TALKS_PER_WEEK: 2,
  /** Deadline of a sale promise when none is chosen, and the allowed range (days). */
  SALE_PROMISE_DAYS: 60,
  SALE_PROMISE_MIN_DAYS: 14,
  SALE_PROMISE_MAX_DAYS: 120,
  /** A renewal promise must be kept within this many days. */
  RENEWAL_PROMISE_DAYS: 30,
  /** Transfer request: below this; withdrawn on a Monday at or above TRANSFER_REQUEST_WITHDRAW. */
  TRANSFER_REQUEST_BELOW: 25,
  TRANSFER_REQUEST_WITHDRAW: 50,
  /** Daily trend values kept (7-day trend = last vs 7 days earlier). */
  TREND_DAYS: 8,
  /** Requested sale: extra daily bid chance and the wider rating band an AI club accepts. */
  REQUEST_BID_CHANCE: 0.25,
  REQUEST_BAND_SLACK: 1,
} as const;
