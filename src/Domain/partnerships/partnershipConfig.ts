/** Club partnerships (satellite and parent club, report 648035a3). `.claude/rules/game/partnerships.md`. */
export const PARTNER = {
  /** Players lent to the satellite at the same time. */
  MAX_LOANS: 5,
  /** Most of the wage the satellite pays for a player lent by its parent. */
  MAX_SATELLITE_SHARE: 0.5,
  /** The satellite takes a player rated at least its line's starters' mean minus this. */
  STARTER_MARGIN: 0.3,
  /** Loan offers the parent makes to the human satellite per transfer window, and per week. */
  OFFERS_PER_WINDOW: 2,
  /** The parent pays at least this share of the wage of a player it lends to the human satellite. */
  PARENT_MIN_SHARE: 0.5,
  /** Age limit of a player the parent offers. */
  OFFER_MAX_AGE: 23,
} as const;
