---
description: Rules for the GraficsEngine module — Pixi.js rendering layer.
globs: "src/GraficsEngine/**"
alwaysApply: false
---

## Responsibilities
- Renders `GameState` to the canvas — reads game state, never owns it
- Converts game-space yards → canvas pixels using `pitchToPixel(x, y)`
- Idle/visual motion is pixel-space only and does not affect `GameState`

## Pixi conventions
- Use Pixi v8 (`Application`, `Graphics`, `Container` from `pixi.js`)
- Init is async: `await app.init({...})`
- Always destroy the app and remove canvas on React cleanup
- Add player graphics to a `Container` (`world`), not directly to `app.stage`

## Coordinate conversion
- `pitchToPixel(x, y)` lives here (depends on canvas constants)
- Canvas is fixed at 900 × 520 px
- `scale = Math.min(900 / 115, 520 / 74)` — uniform pixels-per-yard

## Files
- `PixiPitch.tsx` — React component wrapping the Pixi canvas
