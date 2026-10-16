export const SEAT_OFFERS = {
  /** Days an offer stays open after it is made (or countered). */
  VALID_DAYS: 5,
  /** Counters in one negotiation (both sides together). */
  MAX_COUNTERS: 3,
  /** Open offers one seat can have sent at once. */
  MAX_OPEN_SENT: 10,
} as const;
