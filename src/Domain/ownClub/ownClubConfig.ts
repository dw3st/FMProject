/** Founding your own club (report 17d9bdee, `.claude/rules/game/own-club.md`). */
export const FOUNDED = {
  /** Generated level = the worst squad level of the division minus this. */
  LEVEL_GAP: 0.3,
  AGE_MIN: 18,
  AGE_MAX: 32,
  LINES: { GK: 3, DEF: 7, MID: 7, FWD: 5 } as const,
  CONTRACT_SEASONS: 2,
  /** Ticket price multiplier on the club's normal price. */
  PRICE_MIN: 0.5,
  PRICE_MAX: 2,
  PRICE_STEP: 0.1,
  /** Demand × price^−e: double the price ≈ −34% of the crowd. */
  PRICE_ELASTICITY: 0.6,
  /** The president's monthly materials allowance, as the board at this level. */
  ALLOWANCE_BOARD: 70,
  DEPOSIT_MIN: 1_000,
  NAME_MIN: 2,
  NAME_MAX: 30,
};
