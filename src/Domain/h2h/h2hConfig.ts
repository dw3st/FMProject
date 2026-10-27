/** Live match between two managers (`.claude/rules/game/multiplayer.md`, part 7). */
export const H2H = {
  /** Pauses per manager per match. */
  PAUSES: 3,
  /** Longest pause (seconds). */
  PAUSE_SECONDS: 30,
  /** Worker simulation step (real ms). */
  TICK_MS: 50,
  /** Position frames to the browsers (real ms). */
  FRAME_MS: 100,
  /** Full state to the browsers (real ms), plus after every event. */
  STATE_MS: 1000,
  /** Command rate limit window (ms) and commands per window per socket. */
  CMD_WINDOW_MS: 10_000,
  CMD_MAX: 20,
  /** Socket frames larger than this are ignored. */
  MAX_FRAME_BYTES: 8192,
} as const;
