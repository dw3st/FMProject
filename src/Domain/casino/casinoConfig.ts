/** The manager's casino (`.claude/rules/game/casino.md`): limits and the crash game's curve. */
export const CASINO = {
  MIN_STAKE: 1_000,
  /** Largest stake: this share of the wallet. */
  MAX_SHARE: 0.02,
  /** Net loss allowed in one game day: this share of the wallet he had when he first played that day. */
  DAILY_LOSS_SHARE: 0.1,
  /** Spins and crash rounds per game day. */
  MAX_ROUNDS_PER_DAY: 100,
  /** Auto-spin: at most this many spins in one request. */
  MAX_AUTO_SPINS: 10,
  /** Last results kept for the screen. */
  HISTORY: 30,
  CRASH: {
    /** Return to player: crash point = max(1, floor(100 × RTP / (1 − U)) / 100). */
    RTP: 0.95,
    /** Multiplier curve m(t) = e^(GROWTH × t), t in real seconds since the round started. */
    GROWTH: 0.06,
    /** Highest crash point (a round never lasts more than ln(MAX) / GROWTH ≈ 115 s). */
    MAX_POINT: 1_000,
    /** Lowest auto cash-out. */
    MIN_AUTO: 1.01,
  },
} as const;
