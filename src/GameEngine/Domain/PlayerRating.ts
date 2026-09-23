/**
 * PlayerRating — live match rating tracker.
 *
 * Subscribes to the event bus and updates a per-player rating on each action.
 * Ratings start at BASELINE (6.0) and are clamped to [0, 10].
 *
 * Call initRatings(playerIds) at match start to reset and register players.
 * Read ratings via getPlayerRating(id) or getAllRatings().
 */

import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
import { RATING_WEIGHTS } from '@/GameEngine/Configs/PlayerRatingConfig';

const ratings = new Map<number, number>();

function clamp(v: number): number {
  return Math.max(0, Math.min(10, v));
}

function adjust(playerId: number, delta: number): void {
  const current = ratings.get(playerId) ?? RATING_WEIGHTS.BASELINE;
  ratings.set(playerId, clamp(current + delta));
  gameBus.emit('ratingsUpdated', Object.fromEntries(ratings));
}

// ── Bus subscriptions ─────────────────────────────────────────────────────────

gameBus.on('playerSubstituted', e => {
  if (!ratings.has(e.inId)) ratings.set(e.inId, RATING_WEIGHTS.BASELINE);
});

gameBus.on('goalScored',    e => {
  adjust(e.scorerId, RATING_WEIGHTS.GOAL);
  if (e.assistId != null) adjust(e.assistId, RATING_WEIGHTS.ASSIST);
});
gameBus.on('shot',          e => adjust(e.player,   RATING_WEIGHTS.SHOT));
gameBus.on('passCompleted', e => adjust(e.player,   RATING_WEIGHTS.PASS_COMPLETED));
gameBus.on('passFailed',    e => adjust(e.player,   RATING_WEIGHTS.PASS_FAILED));
gameBus.on('tackle',        e => adjust(e.player,   e.success ? RATING_WEIGHTS.TACKLE_WON : RATING_WEIGHTS.TACKLE_FAILED));
gameBus.on('interception',  e => { if (e.success) adjust(e.player, RATING_WEIGHTS.INTERCEPTION); });

// ── Public API ────────────────────────────────────────────────────────────────

/** Reset all ratings and register the players for the current match. */
export function initRatings(playerIds: number[]): void {
  ratings.clear();
  for (const id of playerIds) {
    ratings.set(id, RATING_WEIGHTS.BASELINE);
  }
}

/** Current rating for a single player (falls back to BASELINE if not registered). */
export function getPlayerRating(id: number): number {
  return ratings.get(id) ?? RATING_WEIGHTS.BASELINE;
}

/** Snapshot of all current ratings. */
export function getAllRatings(): Record<number, number> {
  return Object.fromEntries(ratings);
}
