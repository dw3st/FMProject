/**
 * Real-time delay (ms) before the app navigates to the match-result screen after full time.
 *
 * `matchEnd` freezes the engine entirely (`tickState` no-ops forever in that phase — see
 * `GameEngine/Domain/gameState.ts`), so unlike half-time / extra-time-break there is no engine
 * countdown left to drive the full-time overlay or the navigation away from it — both are timed
 * against this real-time delay instead (see `MatchScreen.tsx`'s `matchEnd` handler).
 *
 * Half-time and extra-time-break do NOT use this function: those overlays are dismissed the
 * instant the engine's own `matchPhase` moves past them (`halfTime` → `secondHalf`,
 * `extraTimeBreak` → `extraTimeFirst` — see `MatchScreen.tsx`'s `matchPhase`-driven dismissal
 * effect), which already tracks the engine's own `presentationCountdown` (itself in game-time, so
 * it already runs faster at higher live-match speed — `advanceSim` feeds more fixed `tickState`
 * steps per real second the higher `gameSpeed` is, see `GraficsEngine/PixiPitch.tsx` →
 * `pumpSimulation`) and needs no separate real-time delay, at any speed, and pauses/resumes
 * together with the match itself.
 */
export function overlayDismissDelayMs(baseMs: number, gameSpeed: number): number {
  if (!Number.isFinite(gameSpeed) || gameSpeed <= 0) return baseMs;
  return baseMs / gameSpeed;
}
