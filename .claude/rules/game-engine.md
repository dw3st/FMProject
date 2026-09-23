---
description: Rules for the GameEngine module — pure game logic, no rendering.
globs: "src/GameEngine/**"
alwaysApply: false
---

## Coordinate system
- All positions are in **yards** (`x`, `y` on `GamePlayer`)
- `x` = yards from the **left goal line** (0 → 115)
- `y` = yards from the **top touchline** (0 → 74)
- Pitch is 115 × 74 yards (FIFA 11-a-side)
- Goal opening: `GOAL_Y_MIN=33` to `GOAL_Y_MAX=41` (center 37), both goal lines
- **Never use pixels here** — conversion lives in GraficsEngine

## State
- `GameState` is plain data — no Pixi, no DOM, no React
- State updates are **pure functions** (`tickState`, `startPass`, etc.)
- Pass targeting always filters by `team` — never pass to opponents

## Files
- `types.ts` — shared types (`GamePlayer`, `GameState`, `PassState`, `ShotState`, `TeamId`, `PlayerRole`)
- `gameState.ts` — state factory + tick logic (executes decisions & outcomes)
- `DecisionTree.ts` — per-player decision evaluation (carry/shoot/pass/tackle/press/idle)
- `ActionOutcomes.ts` — pure outcome functions (shot aim, GK save, tackle roll, interception roll)
- `Formation.ts` — `ROLE_FORMATION` map: slot position, advance offsets, movement bounds per role
- `TeamLineup.ts` — maps raw player attributes → `PlayerStats` per role
- `Positioning.ts` — computes `targetPosition` per player per phase (attacking/defending)
- `PassLanes.ts` — open/closed lane detection; used by `startPass()` and the debug overlay
- `TestCases.ts` — predefined `GameState` factories for the `/test` screen
- `DebugLog.ts` — engine-side structured log (`debugLog()`, `setDebugMode()`, `clearDebugLog()`)
- `EventBus.ts` — typed pub/sub; only cross-layer communication channel
- `Player.ts` — reserved for future per-player behaviour

## Decision ownership
- **All player-level choices** (carry/shoot/pass, tackle/press, probability rolls) belong in `DecisionTree.ts`
- `gameState.ts` **only executes** what the tree returns — never overrides or adds extra probability gates
- This keeps UI decision badges (which also call `decide()`) in sync with actual game actions

## Action outcomes
- **All outcome math** (GK save chance, shot aim/spread, tackle success, interception chance) belongs in `ActionOutcomes.ts`
- `gameState.ts` calls these functions and reads results — never contains inline formulas

## Tick order (`tickState`, each frame)
1. **Kickoff freeze** — if `kickoffCountdown > 0`, drain it and return early
2. **Compute decisions** — call `decide()` for every player; store in `state.decisions`
3. **Movement** — move all non-holders toward their target:
   - Defending GK overrides to sprint toward `shot.toX/toY` while a shot is in flight
   - Opponents within `pressRange` of the pass trajectory sprint to intercept point during a pass
   - Pressing opponents move toward the holder; others use `computeTargetPosition()`
4. **Shot in flight** — advance `shot.t` by `dt * SHOT_SPEED`; on arrival resolve GK save → goal or save/miss → give GK possession
5. **Tackle check** (ball held only) — closest opponent with `decide=tackle` and `tackleCooldown=0` gets a `resolveTackle()` roll; 1.2 s cooldown
6. **Holder decision** (ball held, no active pass):
   - `shoot` → `startShot()`
   - `carry` → move holder by `carrySpeed * dt` along `(dx,dy)`; stochastic stop via `carryChance`
      - See the carry.md
   - `pass` (or carry bounds hit) → `startPass()`
7. **Pass in flight** — interception check near ball position, then advance `pass.t`; on arrival give possession to receiver

## Player decisions (`DecisionTree.ts`)
| Condition | Decision |
|---|---|
| Ball in flight | `idle` |
| Has ball, in shoot range (probabilistic ramp) | `shoot` |
| Has ball, forward lane clear | `carry { dx, dy }` — goal-directed, avoids opponents |
| Has ball, no clear lane | `pass` |
| Opponent, dist ≤ `tackleRange` | `tackle` |
| Opponent, dist ≤ `pressRange` | `press` |
| Teammate or out of range | `idle` |

### Carry lane selection
- Scans 3 lanes: straight toward nearest goal post (clamped to `[GOAL_Y_MIN, GOAL_Y_MAX]`), ±30°
- Opponents behind the carrier (`forwardDot ≤ -0.5`) are ignored — already beaten
- Picks lane with most clearance; must exceed `MIN_CARRY_CLEARANCE=5 yds` to qualify

## Player stats
Each `GamePlayer` carries `stats: PlayerStats`:
- `withBall`: `shootRange`, `shootAccuracy`, `carrySpeed`, `carryVision`, `carryChance`
- `withoutBall`: `pressRange`, `pressSpeed`, `tackleRange`, `tackleChance`, `interceptionChance`

Stats are assigned per role in `TeamLineup.ts` from raw player attributes.

## Formation (11v11, 4-3-3)
| Role | Slot X | Slot Y |
|------|--------|--------|
| GK   | 5      | 37     |
| LB   | 18     | 11     |
| CB   | 22     | 28/46  |
| RB   | 18     | 63     |
| CDM  | 38     | 37     |
| CM   | 50     | 24/50  |
| LW   | 70     | 8      |
| RW   | 70     | 66     |
| ST   | 80     | 37     |

Team B is x-mirrored. Each role has `bounds` clamping movement.

## Pass lane selection (`PassLanes.ts`)
- `isLaneOpen(from, to, opponents, blockRadius=3.5)` — perpendicular distance check along the pass line
- `evaluatePassLanes(holder, teammates, opponents)` → `PassLaneInfo[]` (each with `open: boolean`)
- `startPass()` prefers open lanes; falls back to all targets if every lane is blocked

## Debug system
- `debugLog(category, message, meta?)` — no-op when debug mode off
- Categories: `pass` (blue), `possession` (green), `tackle` (orange), `interception` (yellow), `shot` (red), `decision` (gray)
- `setDebugMode(bool)` / `clearDebugLog()` for UI control

## Active game events (EventBus)
| Event | Payload | Emitted when |
|---|---|---|
| `stateChanged` | `GameState` | Every tick |
| `goalScored` | `{ team, score }` | Shot resolves as goal |
