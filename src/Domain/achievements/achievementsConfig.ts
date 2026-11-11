/** Every constant of the achievements (`.claude/rules/game/achievements.md`). */
export const ACHIEVEMENTS = {
  POINTS: { bronze: 10, silver: 25, gold: 50, secret: 40 },
  /** Attribute gain of an unlock in the track's attribute. */
  ATTRIBUTE_GAIN: { bronze: 0.25, silver: 0.5, gold: 1, secret: 0.5 },
  /** Attribute gain of a title (Tactics). */
  TITLE_GAIN: { league: 0.5, continental: 0.5, cup: 0.25, promotion: 0.25, national: 0.5 },
  /** Season that meets the board's objective (Motivation, at the rollover). */
  OBJECTIVE_GAIN: 0.25,
  /** Every `LOSS_STREAK_STEP` official defeats in a row: Motivation and Discipline −`LOSS_STREAK_DROP`. */
  LOSS_STREAK_STEP: 5,
  LOSS_STREAK_DROP: 0.25,
  ATTRIBUTE_START: 10,
  ATTRIBUTE_MIN: 1,
  ATTRIBUTE_MAX: 20,
  /** Effect at the extreme (attribute 20 or 0): ±5%. */
  EFFECT: 0.05,
  /** Frames by points earned. */
  FRAME_POINTS: { bronze: 100, silver: 400, gold: 900, legend: 1500 },
  /** Stadium decorations by points earned. */
  DECOR_POINTS: { banner: 100, flag: 400, mosaic: 900 },
  MAX_BADGES: 3,
  /** Longest manager bio (8.9.38). */
  BIO_MAX: 280,
  SHOP: { created: 300, legend: 500 },
  /** Each shop item once per season; every purchase of it raises its price by this much. */
  SHOP_STEP: 100,
  /**
   * Points from the campaign, on top of the achievements (tester report: no more points once every achievement is
   * unlocked): titles, continental stages reached, the board's objective met, manager awards.
   */
  CAMPAIGN: {
    TITLE: { league: 60, cup: 40, continental: 80, promotion: 25, national: 60 },
    CONTINENTAL_STAGE: { sf: 15, final: 30 },
    OBJECTIVE: 15,
    AWARD: { best_manager: 20, world_manager: 40 },
  },
  /** Thrashing = a win by this margin or more; `seven_up` / `humbled` margins. */
  THRASHING_MARGIN: 3,
  SEVEN_UP_MARGIN: 7,
  HUMBLED_MARGIN: 5,
  /** `free_starter`: starts for the club. */
  FREE_STARTER_STARTS: 15,
  /** `perfect_month`: official games in the month. */
  PERFECT_MONTH_MIN: 4,
  /** `sacked_early`: days in charge. */
  SACKED_EARLY_DAYS: 30,
  /** `one_club`: seasons at one club. */
  ONE_CLUB_SEASONS: 10,
  /** `wall`: official games in a row without conceding. */
  WALL_GAMES: 10,
  /** `league_unbeaten` gold: a whole league season unbeaten, with this many games or more. */
  INVINCIBLE_MIN_GAMES: 10,
  /** Created player: age, level bonus over the line average − offset (the intake's promise + this). */
  CREATED_AGE: 16,
  CREATED_EXTRA_LEVEL: 0.3,
  /** The legend shop lists every legend, completed with the best retirees up to this many while the world has few. */
  /**
   * The shop's legends (tester report): a list per manager and season, drawn from every notable retiree. Per-player
   * draw weight and extra points by rarity.
   */
  LEGEND_OFFER: {
    SIZE: 12,
    WEIGHT: { common: 1, rare: 3, super: 2 },
    EXTRA: { common: 0, rare: 200, super: 500 },
  },
  /**
   * The legend roulette (tester report, option B, 8.9.34): the shop's price draws a tier by these odds, then a legend
   * of that tier still available in the world. Spinning again costs points or the manager's money.
   */
  LEGEND_SPIN: {
    ODDS: { normal: 0.5, rare: 0.28, epic: 0.14, legend: 0.06, super: 0.02 },
    REROLL_POINTS: 150,
    REROLL_MONEY: 2_000_000,
    /** Cards on the reel and the place of the drawn one. */
    REEL: 28,
    REEL_AT: 23,
  },
} as const;
