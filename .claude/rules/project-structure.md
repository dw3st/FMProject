---
description: Overall project structure and architecture decisions.
alwaysApply: true
---

## Meta rule
**Any structural decision — new layer, new pattern, new cross-cutting contract — must be documented here before or immediately after implementation.** If you add a new event type, a new module boundary, or change how layers communicate, update this file in the same session.

---

## Directory layout
```
FMProject/
├── src/
│   ├── GameEngine/          # Pure game logic (no Pixi, no DOM, no React)
│   │   ├── types.ts         # Shared types (GameState, GamePlayer, PassState…)
│   │   ├── gameState.ts     # State factory + tick functions
│   │   ├── EventBus.ts          # Typed pub/sub — the only cross-layer communication channel
│   │   ├── PositionalAwareness.ts # Spatial math utilities (dot product, interception validity)
│   │   └── Player.ts            # (reserved for per-player behaviour)
│   ├── GraficsEngine/       # Pixi.js rendering layer
│   │   └── PixiPitch.tsx    # Drives game loop via Pixi ticker; emits to gameBus
│   ├── GameInterface/       # HTML/CSS UI — currently React, must stay replaceable
│   │   ├── TeamPanel.tsx    # Dumb component: renders one team's player list
│   │   └── ScoreBar.tsx     # Dumb component: score + timer display
│   ├── App.tsx              # Subscription point: gameBus → React state → UI props
│   ├── frontend.tsx         # React entry point
│   ├── index.html           # HTML shell
│   ├── index.css            # Tailwind base styles
│   └── index.ts             # Bun.serve() server
├── .claude/
│   └── rules/               # Scoped Claude rules (edit here, always keep current)
├── CLAUDE.md                # Root rules (Bun, @ imports)
└── CLAUDE.local.md          # Personal overrides (gitignored)
```

---

## Layer rules
| Layer | Imports from | Never imports |
|---|---|---|
| `GameEngine` | nothing (pure TS) | GraficsEngine, GameInterface, React, Pixi |
| `GraficsEngine` | `GameEngine` (types + state + EventBus) | React, GameInterface |
| `GameInterface` | `GameEngine` types only | GraficsEngine, Pixi |
| `App.tsx` | all three layers | — |

---

## Cross-layer communication: EventBus
**Decision (2025):** All engine-to-UI communication goes through `GameEngine/EventBus.ts`. No callbacks are passed as props into `GraficsEngine` components.

- `GraficsEngine` calls `gameBus.emit('stateChanged', state)` on significant events (pass complete, tackle)
- `GameInterface` / `App.tsx` subscribes with `gameBus.on('stateChanged', handler)`
- This makes the UI layer fully replaceable: swap React's `useEffect + useState` for any other subscription primitive without touching `GameEngine` or `GraficsEngine`

**Adding a new event:**
1. Add the event name + payload type to `GameEvents` in `EventBus.ts`
2. Emit it from `GraficsEngine` at the right moment
3. Subscribe to it wherever the UI needs to react
4. Document the event here under "Active game events"

---

## Decision tree
**Decision (2025):** Player AI is driven by `GameEngine/DecisionTree.ts`, a pure function with no side effects and no imports from `gameState.ts` (avoids circular deps).

```
decide(player, ballHolder, hasBall) → PlayerDecision
```

### Decision branches
| Condition | Decision |
|---|---|
| `hasBall === true` | `pass` — only option currently |
| opponent, dist ≤ `tackleRange` | `tackle` |
| opponent, dist ≤ `pressRange` | `press` (player physically moves) |
| teammate, or out of range | `idle` |

### Player stats
Each `GamePlayer` carries a `stats: PlayerStats` object with two buckets:
- `withBall: WithBallStats` — governs decisions when in possession (currently empty, reserved)
- `withoutBall: WithoutBallStats` — `pressRange`, `pressSpeed`, `tackleRange`, `tackleChance`

Default stats are assigned per role in `statsFor(role)` in `gameState.ts`.

### Tick order (ball-held frames only)
1. **Press movement** — all pressing opponents move toward holder by `pressSpeed * dt` yards
2. **Tackle check** — closest opponent within `tackleRange` gets a chance (`tackleChance`); global 1.2s cooldown
3. **Pass logic** — holder starts a pass to a random teammate

During a pass in flight, only pass advancement runs (no press/tackle).

### Adding a new decision
1. Add a variant to `PlayerDecision` in `DecisionTree.ts`
2. Add the evaluation condition in `decide()`
3. Add the execution branch in `tickState()` (gameState.ts)
4. Add stats fields to `WithBallStats` or `WithoutBallStats` if needed
5. Document here

---

## Positional Awareness
**Decision (2025):** Spatial relationship utilities live in `GameEngine/PositionalAwareness.ts` — a pure math module with no imports beyond types. Used by ActionOutcomes and gameState.

### API
| Function | Purpose |
|---|---|
| `forwardDot(from, to)` | Dot product of A→B with A's attack axis. > 0 = ahead, < 0 = behind |
| `classifyPosition(from, to)` | Returns `'front' \| 'side' \| 'behind'` using ±0.5 thresholds |
| `tackleAngleModifier(tackler, holder)` | Delta to apply to tackle chance: front +0.30, side +0.10, behind −0.30 |
| `isInterceptionValid(defender, ballPos, receiver)` | True when defender is between ball and receiver (t ∈ 0.05..0.95, perpDist ≤ 4 yds) |
| `getFrontPressure(player, opponents, radius)` | 0..1 intensity of forward pressure from nearby opponents |

### Where it plugs in
- `ActionOutcomes.resolveTackle(tackler, holder)` — applies `tackleAngleModifier` to success chance
- `gameState.ts` interception check — gates `resolveInterception` call with `isInterceptionValid`
- Future: marking, fouls, offside logic, through-ball targeting

---

## Debug system
**Decision (2025):** All engine debug output goes through `GameEngine/DebugLog.ts`. Never use `console.log` for game events — use `debugLog()` so the UI can display and the pattern stays consistent.

### Usage
```ts
import { debugLog } from './DebugLog';
debugLog('tackle', 'Silva wins tackle vs Ronaldo', { playerId: 2, data: { success: true } });
```
`debugLog` is a no-op when debug mode is off — no cost in normal play.

### Adding a new log category
1. Add the string literal to `DebugCategory` in `DebugLog.ts`
2. Add a color entry to `CATEGORY_COLOR` in `GameInterface/DebugPanel.tsx`
3. Call `debugLog('your-category', ...)` at the relevant engine point
4. Document it in the table below

### Active log categories
| Category | Color | When emitted |
|---|---|---|
| `pass` | blue | `startPass()` — pass begins |
| `possession` | green | Pass received or tackle wins possession |
| `tackle` | orange | Every tackle attempt (win or lose) |
| `decision` | gray | (reserved — not per-frame logged, derived in UI) |

### Debug UI
- **Toggle**: DEBUG button in header (`App.tsx`)
- **Decision badges**: `TeamPanel` shows each player's current decision (derived from `GameState` via `decide()` — not stored in state)
- **Event log**: `DebugPanel` below the pitch — auto-scrolling, monospace, last 150 entries
- `setDebugMode(true/false)` in `GameEngine/DebugLog.ts` controls the engine side; `App.tsx` calls it on toggle

---

### Active game events
| Event | Payload | Emitted when |
|---|---|---|
| `stateChanged` | `GameState` | Pass completes or tackle changes possession |

---

## UI replaceability contract
`GameInterface` components must stay dumb (props-in, render-out). The subscription logic lives exclusively in `App.tsx` (or equivalent root for other frameworks). To replace React:
1. Remove `App.tsx`'s `useEffect + useState` subscriptions
2. Subscribe the new framework to `gameBus` instead
3. `GameEngine` and `GraficsEngine` are untouched

**Candidate replacements if React becomes a bottleneck:** Solid.js (fine-grained reactivity maps cleanly to `gameBus.on`), or vanilla DOM for minimal HUD overhead.

---

## Current simulation state
- 5v5 (Team A blue, Team B red), positions in yards on a 115×74 yard pitch
- Ball passes randomly among teammates only (team-filtered targeting)
- Tackle mechanic: opponent within 4 yards of holder triggers a 50% chance tackle; 1.2s cooldown per attempt
- Players have visual idle wiggle (pixel-space only, not in GameState)
- Layout: Team A panel | Pitch (640×400) | Team B panel, with score + timer header
