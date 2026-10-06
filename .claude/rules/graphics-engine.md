---
description: Rules for the GraficsEngine module — Pixi.js rendering layer.
globs: "src/GraficsEngine/**"
alwaysApply: false
---

## Responsibilities
- Renders `GameState` to the canvas — reads game state, never owns it
- Converts game-space yards → canvas pixels with `toPixel(x, y)` (built from `buildMetrics`)
- Idle/visual motion is pixel-space only and does not affect `GameState`

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
