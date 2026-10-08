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
- `pitchMirror.ts` — `mirrorX`: the live match draws the pitch mirrored on x when the user (engine team A) plays away (#98, `PixiPitch` `mirror` prop), so the home side attacks the way it is listed. Drawing only: `toPixel` and the click inverse go through it; nothing derived from yards may assume "x = 0 is drawn on the left" (the goal-net bulge reads the drawn side). The `GameState` never changes
- `setPieceTransition.ts` — a restart that repositions the teams (corner, free kick, throw-in, goal kick, offside free kick, penalty; never a kickoff) is drawn as an eased walk from the last drawn positions to the layout instead of a jump (`TELEPORT_YDS`): `min(0.8 s, 80% of the real time left on the countdown)` (skipped under 0.12 s), so it always ends before the kick; clock frozen while paused, none with the tab hidden, cut by a /test state swap. Drawing only (debug overlays still read the engine positions); the engine, `CORNER_COUNTDOWN` and the layouts are unchanged
- `pitchMetrics.ts` — pitch geometry in px (`buildMetrics(w, h, { stadium })`); with the stadium the pitch is drawn ×0.9 (`STADIUM.PITCH_SHRINK`) and `stand` describes the band (`outer` = canvas, `inner` = pitch + run-off)
- `crowd.ts` / `stadiumRender.ts` — stand seat grid and the filled seats (pure; fill = attendance / capacity, home fans on the drawn home side, away block ~12% in the opposite end, neutral venue split at the halfway line); the stand and every fan are drawn ONCE into a `Graphics`, baked with `renderer.generateTexture` into a single `Sprite` under the stripes, re-baked only when fill / home team / venue / mirror change. A home goal pulses its alpha (1 → 0.85 → 1, 0.6 s)
- `officials.ts` / `coaches.ts` / `touchlineRender.ts` — referee (diagonal behind the play, ≥ 6 yd from the ball, smoothed, snaps past 30 yd; after a card its target is locked on the last foul spot for 1.5 s and the card shows over his head), assistants (level with the offside line of their half, flag raised on `offsideCalled`) and both managers (technical areas at 40% / 60% of the drawn pitch, below the bottom touchline; face from the server via `loadFaceCanvas`; gestures on the human's mentality change — `coachCue` — and on a goal). Engine yards in, drawn through `toPixel` (mirror included). Props `officials`, `coaches`, `coachCue`, `stadium` of `PixiPitch` (read at mount: switching the stadium / officials on or off remounts — put it in the `key`)
- `playerAnims.ts` — long shot (≥ 20 yd), header and save animations: an offset / lift / scale / rotation on top of the interpolated marker, on the effects clock; nothing queued with the tab hidden
- Draw meter (`/test`, `perfRef`): FPS and average frame-callback ms every 30 frames. Measured for the stadium + officials (Etapa 38): their per-frame logic costs ~6 µs (headless bench, 3600 frames of `11v11-classic`) and the crowd data for a bake ~8 ms once (4–5k fans); the crowd is one sprite, so no per-frame draw cost. The in-browser FPS before/after could not be read on the dev machine (the automated Chrome tab reports `document.hidden`, so the ticker never runs) — pending a manual read in `/test` (Stadium + Officials, crowd 100%)
