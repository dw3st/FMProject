/** Group advance (multiplayer part 3, `.claude/rules/game/multiplayer.md`). */
export const GROUP_ADVANCE = {
  /** Furthest "ready until" a manager can pick, in game days. */
  MAX_READY_DAYS: 400,
  /** Safety cap of days one executor run may advance (above `MAX_READY_DAYS`: a full "ready until" fits in one run). */
  MAX_DAYS_PER_RUN: 450,
  /** Real minutes before the clock retries a failed run, by failures so far (the last one repeats). */
  ERROR_RETRY_MINUTES: [5, 15, 60, 60] as readonly number[],
  /** Failed runs in a row after which only a new kick (a manager's action) tries again. */
  MAX_ERROR_RETRIES: 5,
  /** Real-time interval of the deadline clock. */
  CLOCK_MS: 60_000,
  /** Days kept in a seat's pending summary. */
  PENDING_SUMMARY_MAX: 120,
} as const;

/** Error code of a failed day in `world.advance.error` and `world_progress.error` (the text only goes to the log). */
export const DAY_FAILED = "dayFailed";
