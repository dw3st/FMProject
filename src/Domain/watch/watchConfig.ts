// Watching a friend's live match (spec 2026-10-29-friend-match-broadcast-design). Every tunable.
export const WATCH = {
  /** Spectators of one live match. */
  MAX_WATCHERS: 8,
  /** The friend's browser: a position frame every this many real ms, a state every `STATE_MS` (and after events). */
  FRAME_MS: 200,
  STATE_MS: 1_000,
  /** Socket limits on what the friend's browser relays (per socket, per second; excess dropped in silence). */
  FRAMES_PER_SEC: 12,
  STATES_PER_SEC: 4,
  EVENTS_PER_SEC: 30,
  /** A relayed state (players and benches) may be this big; every other client frame stays at `H2H.MAX_FRAME_BYTES`. */
  STATE_MAX_BYTES: 96 * 1024,
} as const;

/** Engine events relayed to the spectators (the ones the match screen's feed, notices and effects read). */
export const WATCH_EVENTS: ReadonlySet<string> = new Set([
  "goalScored", "goalDisallowed", "card", "foul", "freeKickAwarded", "cornerAwarded", "penaltyAwarded", "penaltyResolved",
  "offsideCalled", "injury", "playerSubstituted", "positionsSwapped", "varCheck", "varReview", "halfTime", "extraTimeStart",
  "penaltyKick", "shootoutEnd", "matchStart", "matchEnd", "kickOff", "shot", "shotResolved", "header",
]);
