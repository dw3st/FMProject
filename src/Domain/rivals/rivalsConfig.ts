/** Rivals in a friends' league (`.claude/rules/game/multiplayer.md`, part 6). */
export const RIVALS = {
  /** Results kept in `rivalsFeed.json`, newest first. */
  FEED_MAX: 300,
  /** Results in a friend's form line. */
  FORM_SIZE: 5,
  /** Goal difference of a big win / loss. */
  BIG_MARGIN: 3,
  /** A goal at this minute or later is "late". */
  LATE_MINUTE: 88,
  /** At most this many live events per game (the rest are ignored); `minute` frames do not count. */
  LIVE_MAX_EVENTS: 40,
  /** Moments kept per live game for the friend's popup. */
  LIVE_MOMENTS_MAX: 12,
  /** The live match sends a `minute` frame every this many minutes of play, so the friends' clock keeps moving. */
  LIVE_MINUTE_STEP: 5,
  LIVE_MAX_MINUTE: 130,
  LIVE_MAX_GOALS: 30,
  /** `live_score` frames per socket per minute. */
  LIVE_PER_MINUTE: 30,
  /** A finished game stays this long as "full time". */
  LIVE_ENDED_KEEP_MS: 10 * 60_000,
  /** No event for this long: "interrupted". */
  LIVE_STALE_MS: 15 * 60_000,
  /** No event for this long: gone. */
  LIVE_DROP_MS: 30 * 60_000,
  SCORER_MAX: 40,
  FIXTURE_ID_MAX: 80,
  /** Result / goal notices in the corner. */
  POPUP_MS: 8_000,
  POPUP_MAX: 3,
  /** A friend's line in the live strip lights up this long after his goal. */
  STRIP_HIGHLIGHT_MS: 8_000,
  /** Results per page of `GET /results`. */
  RESULTS_PAGE: 50,
  /** Phrases shown in the menu. */
  MENU_PHRASES: 8,
} as const;
