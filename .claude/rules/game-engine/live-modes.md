# Live match modes: whole match (A) and highlights (B)

Engine rebuild stage 19 (solo live match) and stage 22 (the match between two managers, on the server, and the
broadcast). The engine is the same in both modes: 0.2 s steps, `clockScale` 1.

## Mode A: whole match ("Inteira")

The presentation clock speeds up: the pitch runs at `speed × MODE_A_SPEED` (6,5 since 12.31, `artPrefs.ts`; 13 before, too fast to watch), so 1× is ~14 real
minutes for the 90. The goal celebration and the replay keep the label speed (`PixiPitch presentationSpeed`).

## Mode B: only the highlights ("Só os lances")

- A browser Worker (`forecastWorker.ts`, served bundled by `backend/forecastWorkerAsset.ts` at
  `/assets/forecast-worker/<version>.js`; Bun's HTML bundler does not follow `new Worker(new URL(...))`) runs
  `ForecastCore` ahead from a snapshot of the page's match, in 30 ms slices.
- `LiveSnapshot` = `GameState` (the seeded generator lives in `state.rng`) + Statistics + ratings + the engine's module
  memory (`EngineMemory`: per-team tactic configs, decision flags, held actions, shoulder runs, intent caches, last
  shape, the highlight tracker). Every module with cross-tick state outside `GameState` registers there
  (`registerEngineMemory`); a new one must too, or a restored snapshot drifts. Two tests watch this:
  `engineMemoryGuard.test.ts` fails on a new top-level `let`, Map, Set, WeakMap or per-team record in `src/GameEngine`
  that is neither registered nor listed with a reason, and `LiveSnapshot.test.ts` ("tick by tick") restores a snapshot
  after another future and names the first field that parts. The state goes whole (the through-ball cell cache too:
  it is reused for two ticks) and the Statistics snapshot carries the counters' cross-event memory (`carry`) and the
  decision telemetry.
- The forecast posts the highlight windows (`highlights.md`) as they become final, each with the snapshot of its start,
  the engine events in between (feed, cards for the friends) and the possession accumulators. It stops at a frontier:
  the end (one step before the whistle), a pending 2D penalty, or a human injury under manual subs.
- `HighlightPlayback` (pure rule `decidePlayback`): inside a window of the chosen level the page plays at the label
  speed; outside, it jumps to the next window's snapshot (`restoreLiveSnapshot`), the clock and the news jump with it
  ("Do 12' ao 31'"); with nothing known yet it freezes ("Simulando…"). After a frontier the page plays live and the
  forecast restarts once the manager has decided.
- Levels: principais / estendidos / completos (`highlightsAtLevel`). "Próximo lance" ends the current window.
- **Orders:** every manager order changes the state outside a tick (substitution, mentality, tactic, formation,
  instruction, marking, position swap): the pitch calls `invalidate` (after a `testCommand` that changed the state,
  on `tacticsChanged`, on a `matchStateSync` with UI-owned fields). The playback drops the forecast and starts again
  from the new state; the same order at the same minute gives the same match (test).
- **Resume:** the `matchResume` snapshot carries `memory`, `ui.mode` and `ui.level`.
- Same result: a match played in mode B (any jumps, any orders) equals the straight run from the same seed and the same
  orders (`LiveSnapshot.test.ts`), so the `PlayedMatchRecording` is the one of mode A.

## Screens

- Preview: chips PARTIDA (Inteira / Só os lances), `fm.match.mode`; level `fm.match.highlightLevel` (default
  estendidos).
- Match: the mode tabs, the level tabs (hidden on phone), "Próximo lance", the timeline (`HighlightStrip`: windows by
  level, the forecast's reach, the cursor).
- `/test`: chips "Lances off / main / extended / full" (forces the 90' match), "Next (B)" and a line with the lances
  known, the forecast's reach and the first answer's latency. Mode A is the "90' match" chip.

## Measurements (2026-11-19, dev build, Chrome 158, Premier League, 1×)

| | CPU main thread | FPS |
|---|---|---|
| Desktop 1586×906, mode A | 42% | 57 |
| Desktop, mode B | 40% | 58 |
| 840×390 (phone emulation), mode A | 48% | 57 |
| 840×390, mode B | 57% | 57 |

- Main-thread CPU from `Performance.getMetrics` (TaskDuration), the Worker apart; the dev bundle is unminified.
- Forecast cost: 0.46 ms per 0.2 s step (plain tick 0.43 ms, snapshot 0.05 ms): ~12× real time at 1×, a whole match
  in ~13 s of Worker time.
- Time to the first highlight after a start or an order: 47–191 ms in `/test` (one run 996 ms right after the page
  loaded, while the Worker bundle compiled).

## Limitations

- Statistics of the skipped stretch arrive with the jump (the summary panel catches up at once).
- The skipped stretch's goals are always windows (main level), so they are never skipped.
- The broadcast shows what the player sees (mode B jumps included) but not the timeline of the lances.

## Between two managers (stage 22)

The server's H2H worker (`h2hMatch.ts`) runs the same two modes: mode A at real time × speed × `MODE_A_SPEED`
(`src/Domain/match/liveModes.ts`, shared with the page); mode B with the same `HighlightPlayback`, its forecast in a
nested Bun Worker (`forecastWorker.ts`; tests: an inline port that mutes the forwarded events). Both managers see the
same lances; an order of either one re-forecasts from the order's state and the other gets `h2h_order` ("Fulano mudou a
tática"); "next lance" needs every manager in charge of his side (a side on the assistant does not hold it). The mode
is chosen in the match room: mode B only when both ask for it, at the more complete of the two levels
(`matchPlayMode`, `matchHighlightLevel`). Details: `.claude/rules/game/multiplayer.md` → "Parte 7" → "90 minutos".

## Stage 21: `OffBallMovement.lastSupport` registered

The last (holder, supporter) pair of the "support comes short" event was allow-listed as a debug dedupe, but it gates
the `supportShort` team stat: a restored snapshot counted one more. It is now an engine-memory part.
