/**
 * Real-time delay (ms) before a match presentation overlay (half-time / extra-time /
 * full-time) is dismissed, or before the app navigates away after a finished match.
 *
 * The engine's own presentation pauses (halfTime, extraTimeBreak, penalties — see
 * `PRESENTATION_DURATION` in `GameEngine/Domain/gameState.ts`) are counted in game-time,
 * so they already run faster at higher live-match speed: `advanceSim` feeds more fixed
 * `tickState` steps per real second the higher `gameSpeed` is (see
 * `GraficsEngine/PixiPitch.tsx` → `pumpSimulation`), and each step drains
 * `presentationCountdown` by the same fixed step regardless of speed.
 *
 * The UI's own overlay-dismissal timers must scale the same way. Without this, at 2x/4x
 * the overlay (and, for full time, the delay before navigating to the match-result screen)
 * keeps showing in real time for as long as at 1x, well after the underlying pause (or the
 * whole match) has already moved on underneath it.
 */
export function overlayDismissDelayMs(baseMs: number, gameSpeed: number): number {
  if (!Number.isFinite(gameSpeed) || gameSpeed <= 0) return baseMs;
  return baseMs / gameSpeed;
}
