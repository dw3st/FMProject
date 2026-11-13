/** Sponsors (`.claude/rules/game/sponsors.md`): every number of the feature. */
export const SPONSORS = {
  /** Places per slot, the share of the base each place is worth (sum = 1) and the offers made for an empty slot. */
  SLOTS: {
    master: { count: 1, share: 0.5, offers: 3, weight: 3 },
    kit: { count: 1, share: 0.25, offers: 2, weight: 2 },
    /** Boards: offers = free places + `BOARD_EXTRA_OFFERS`. */
    board: { count: 4, share: 0.0625, offers: 6, weight: 1 },
  },
  BOARD_EXTRA_OFFERS: 2,
  /** Days an offer stays on the table; unanswered with the slot empty, the director signs the best fixed value. */
  OFFER_DAYS: 21,
  APPEAL: { CAMPAIGN: 0.1, SOCIAL: 0.08, MANAGER: 0.05, STARS: 0.04, MIN: 0.7, MAX: 1.3, STARS_FULL: 3 },
  /** Fixed value and bonus by profile, as a share of base × slot share. */
  PROFILE: {
    safe: { fixed: 0.9, bonus: 0.05 },
    standard: { fixed: 0.95, bonus: 0.15 },
    demanding: { fixed: 1.0, bonus: 0.3 },
  },
  NOISE: { MIN: 0.95, MAX: 1.05 },
  SIZE_MULT: { local: 0.9, national: 1, global: 1.08 },
  YEARS: { MIN: 1, MAX: 3, DEMANDING_MIN: 2, RENEWAL: 2 },
  GOAL: {
    /** League position asked relative to the board's target: safe +3, demanding −3. */
    POSITION_STEP: 3,
    /** `continental` is only offered when the target is within this many places of the zone. */
    CONTINENTAL_REACH: 4,
    FOLLOWERS: { standard: 0.03, demanding: 0.06 },
    ATTENDANCE: { standard: 0.9, demanding: 1.0 },
  },
  NEGOTIATE: { RAISE_CHANCE: 0.45, KEEP_CHANCE: 0.35, RAISE: 1.08 },
  ROLLOVER: {
    /** A position goal missed by this many places or more: the company leaves at once. */
    EXIT_MISS: 6,
    /** Missed by at most this many places (or a goal that is not a position): a cheaper renewal. */
    NEAR_MISS: 2,
    RENEW_MET: 1.1,
    RENEW_MISSED: 0.9,
  },
  /** Money is rounded to this step (EUR). */
  ROUND: 1000,
} as const;
