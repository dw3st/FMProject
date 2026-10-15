/** Group advance (multiplayer part 3, `.claude/rules/game/multiplayer.md`). */
export const GROUP_ADVANCE = {
  /** Furthest "ready until" a manager can pick, in game days. */
  MAX_READY_DAYS: 400,
  /** Safety cap of days one executor run may advance. */
  MAX_DAYS_PER_RUN: 400,
  /** Real-time interval of the deadline clock. */
  CLOCK_MS: 60_000,
  /** Days kept in a seat's pending summary. */
  PENDING_SUMMARY_MAX: 120,
} as const;
