/** Every constant of friends and chat (`.claude/rules/social.md`). */
export const SOCIAL = {
  NICKNAME_MIN: 3,
  NICKNAME_MAX: 20,
  /** A nickname can be changed once every 30 days. */
  NICKNAME_CHANGE_DAYS: 30,
  MAX_FRIENDS: 200,
  MAX_PENDING_OUT: 50,
  SEARCH_MIN: 3,
  SEARCH_LIMIT: 20,
  MESSAGE_MAX: 500,
  /** At most RATE_MAX messages per RATE_WINDOW_MS per user (429 past that). */
  RATE_WINDOW_MS: 10_000,
  RATE_MAX: 10,
  /** Messages older than this are deleted by the daily cleanup. */
  HISTORY_DAYS: 90,
  /** History page size (and the largest `limit` accepted). */
  PAGE_SIZE: 50,
  /** A world room exists only with at least this many members. */
  WORLD_MIN_MEMBERS: 2,
  /** Client ping over the socket while the page is visible. */
  PING_MS: 60_000,
  /** Chat windows open at once; the others are minimized. */
  MAX_OPEN_CHATS: 3,
  /** "is typing" shows for this long after the last typing event. */
  TYPING_SHOW_MS: 4_000,
  /** A client sends at most one typing event per room per this interval. */
  TYPING_THROTTLE_MS: 3_000,
} as const;

export const DAY_MS = 86_400_000;
