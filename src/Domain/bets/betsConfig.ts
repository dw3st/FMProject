/** The manager's bets (`docs/superpowers/specs/2026-11-10-manager-bets-design.md`). */
export const BETS = {
  MARGIN: 0.08,
  MIN_ODDS: 1.05,
  MAX_ODDS: 100,
  DAYS_AHEAD: 7,
  MIN_STAKE: 1_000,
  MAX_SHARE: 0.1,
  MAX_OPEN: 40,
  MAX_SETTLED: 200,
  REFUND_AFTER_DAYS: 30,
  MAX_GOALS: 7,
  SCORES_SHOWN: 8,
  SCORERS_SHOWN: 6,
  LONGSHOT_ODDS: 8,
} as const;
