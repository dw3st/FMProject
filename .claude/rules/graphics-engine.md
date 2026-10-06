---
description: Rules for the GraficsEngine module — Pixi.js rendering layer.
globs: "src/GraficsEngine/**"
alwaysApply: false
---

## Responsibilities
- Renders `GameState` to the canvas — reads game state, never owns it
- Converts game-space yards → canvas pixels with `toPixel(x, y)` (built from `buildMetrics`)
- Idle/visual motion is pixel-space only and does not affect `GameState`
- Pitch effects listen to gameBus events (shotResolved, goalScored, foul, card, offsideCalled) inside PixiPitch and are skipped while the tab is hidden; spec docs/superpowers/specs/2026-10-06-match-pitch-visual-design.md

## Pixi conventions
- Use Pixi v8 (`Application`, `Graphics`, `Container` from `pixi.js`)
- Init is async: `await app.init({...})`
- Always destroy the app and remove canvas on React cleanup
- Add player graphics to a `Container` (`world`), not directly to `app.stage`

## Coordinate conversion
- `buildMetrics(canvasW, canvasH)` (`PixiPitch.tsx`) sizes the pitch to the canvas the component gets
- `scale = Math.min(canvasW / (115 + 2 × net depth), canvasH / 74)` — uniform pixels-per-yard; `toPixel` adds the margins

## Files
- `PixiPitch.tsx` — React component wrapping the Pixi canvas
- `simClock.ts` + `pump.ts` — keep the match ticking while the tab is hidden (Worker pulse, shared real-time pump)
- `matchStateSync.ts` — stops a React state echo from rewinding the pitch's simulation
- `playerFaces.ts` — face SVGs rasterised once into circular sprites
- `pitchStyle.ts` — every visual constant of the live pitch (stripes, shadows, stamina bar, ball, effects)
- `markerInfo.ts` — stamina bar colour/fill, booked players (card badge)
- `ballHeight.ts` — illustrative ball height for high balls and shots (raised ball + ground shadow)
- `pitchEffects.ts` — pure effect queue (shot, goal, foul, card, offside) and ball trail, on a real-time clock frozen while paused
- `effectsRender.ts` — Pixi drawing of the effects and the trail
- `renderInterp.ts` — drawing between sim steps: players and ball are drawn at `lerp(prev, cur, carry / step)`; the engine never sees these positions
- `ballSpin.ts` — pure seam-spin angle of the ball (distance rolled / radius; none paused or on a jump)
- `GameInterface/uiStateThrottle.ts` — throttles React state echoes of the match so a fast simulation does not re-render every step
