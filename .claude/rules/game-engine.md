---
description: Rules for the GameEngine module — pure game logic, no rendering.
globs: "src/GameEngine/**"
alwaysApply: false
---

## Coordinate system
- All positions are in **yards** (`x`, `y` on `GamePlayer`)
- `x` = yards from the **left goal line** (0 → 115); `y` = yards from the **top touchline** (0 → 74)
- Pitch 115 × 74; goal opening `GOAL_Y_MIN = 33` → `GOAL_Y_MAX = 41` (`Domain/pitch.ts`)
- **Never use pixels here.** Conversion lives in `GraficsEngine`

## State
- `GameState` (`types.ts`) is plain data: no Pixi, no DOM, no React
- State updates are pure functions (`tickState`, `startPass`, …) in `Domain/gameState.ts`
- Pass targeting always filters by `team`; never pass to opponents

## Files
| Folder | Files |
|---|---|
| root | `types.ts` (GameState, GamePlayer, PlayerStats, SetPiece…), `FormationSlots.ts`, `PlayerDevelopment.ts` (DP model) |
| `Domain/` | `gameState.ts` (state factory + tick, executes decisions), `DecisionTree.ts` (every player choice), `CarryLaneEval.ts`, `PassLanes.ts`, `ThroughBallCells.ts`, `Aerial.ts`, `OffBallMovement.ts`, `DefensivePositioning.ts`, `AttackingPositioning.ts`, `Positioning.ts`, `PositionalAwareness.ts`, `Offside.ts`, `Fouls.ts`, `SetPieces.ts` / `SetPieceLayouts.ts` / `SetPiecePositioning.ts`, `IntentDetection.ts`, `AiSubstitution.ts`, `TeamLineup.ts` (roster attributes → engine stats), `RuntimeLineup.ts` (fatigue, energy), `roleEngineData.ts` (per-role tuning from `roles.json`), `SimulateMatch.ts` (headless match), `Statistics.ts`, `PlayerRating.ts`, `advanceSim.ts`, `pitch.ts` |
| `Configs/` | One tunable constant set per system: Attack (team pass/carry weights per tactic), Carry, Pass, Defense, DefensiveIntent, OffBall, Intent, ThroughBall, Aerial, Foul, SetPiece, Penalty, Familiarity, PlayerRating, QuickSim |
| `Infrastructure/` | `ActionOutcomes.ts` (every dice roll: shot, save, tackle, interception, dribble, duels), `EventBus.ts`, `CrowdGrid.ts`, `SpatialEvaluation.ts`, `PenaltyShootout.ts` |
| `Support/` | `DebugLog.ts`, `DebugSubscriber.ts`, `TestCases.ts` (`/test` scenarios) |

## Decision ownership
- **All player-level choices** belong in `DecisionTree.ts` (`decide()`); `gameState.ts` only
  executes what the tree returns, never overrides it or adds its own probability gates. This keeps
  the `/test` decision badges in sync with what actually happens.
- **All outcome math** (xG, save, tackle, interception, dribble, aerial duel) belongs in
  `ActionOutcomes.ts`; `gameState.ts` calls it and reads results, never inline formulas.
- Decisions are held for `COMMIT_TICKS[type]` ticks (decision memory) to avoid flicker.

## Player decisions (`DecisionTree.ts`)
| Situation | Decision |
|---|---|
| Ball holder (set-piece taker) | `decideBoxSetPiece` for corners / crossed free kicks, `shoot` on a direct free kick, otherwise pass (or the normal best action where allowed) |
| Ball holder | `decideBallHolder`: compressed scores of `shoot`, `carry`, `pass`, `dribble`, `through_ball`, `cross`, `long_ball`; the best wins (`pass.md`, `carry.md`, `aerial.md`, `through-ball.md`) |
| Attacking teammate | `evaluateOffBall` → `support_run` / `create_space` / `idle` (`offball.md`); GK `idle` |
| Defender in duel recovery | `idle` |
| Defender ≤ `TACKLE_RANGE` (2 yds) | `tackle` |
| Defending GK | `idle` (positioned by `DefensivePositioning`) |
| Other defenders | `evaluateDefensiveDecision` → `press` / `hold_shape` / `track_mark` / `step_into_carry_lane` (`defensive-position.md`) |
| Loose ball / through ball in flight | committed chasers get `chase_loose_ball` (`through-ball.md`) |

## Tick order (`tickState`)
1. **Phase gating:** pre-match, half-time, extra-time break and penalties count down presentation
   time; set-piece countdowns freeze play (`match-flow.md`)
2. **Clock** for the four live periods; period end via `endCurrentPeriod`
3. **Housekeeping:** set-piece phase expiry, per-minute injury risk, AI substitutions, possession
   timer, periodic team-intent re-evaluation, crowd grid and through-ball cell cache
4. **Decisions** for every player (with commitment memory)
5. **Movement** of every non-holder toward its target (formation/positioning, press, chase)
6. **Shot in flight** → `resolveShot` → goal / save / miss and restarts
7. **Loose ball** drift, pickup, duels, out-of-bounds restarts
8. **Ball held:** tackle check (closest tackler, shared cooldown with interceptions), then the
   holder's decision (carry, shoot, pass, through ball, cross, long ball, dribble)
9. **Pass / high ball in flight:** interceptions, arrival, offside, aerial landing

## Player stats
`GamePlayer.stats` (`PlayerStats` in `types.ts`), built per role by `TeamLineup.ts` from the raw
roster attributes; `runtimeStats` is the fatigue-adjusted copy the engine reads:
- `withBall`: `shootAccuracy`, `carrySpeed`, `carryVision`, `speed`, `acceleration`,
  `passingSkill`, `vision`, `firstTouch`, `dribbling`, `strength`
- `withoutBall`: `pressRange`, `pressSpeed`, `speed`, `acceleration`, `tackleChance`, `tackling`,
  `interceptionChance`, `gkPositioning`, `gkReflex`, `gkDiving`, `strength`, `heading`, `jump`

Full map of attribute → stat → effect: `game-engine/player-stats-usage.md`.

## Formations
17 ready formations in `src/Data/formations/*.json` plus the custom formation
(`game/formations.md`, `tatics.md`). Team B is x-mirrored; every role has movement `bounds`
(`game-engine/movement-bounds.md`).

## Debug
- `debugLog(category, message, meta?)` (`Support/DebugLog.ts`), a no-op unless
  `setDebugMode(true)`; categories in `DebugCategory`, colours in `GameInterface/DebugPanel.tsx`
- Score breakdowns (`offBallScores`, `defensiveScores`, `throughBallScores`, `crossScores`,
  `setPieceScores`) are emitted on `gameBus` only while debug is on
- Debug snapshots (`debug/*.json`) are inspected with the `fmproject-engine` MCP (`mcp-debug.md`)

## Events
`GameEvents` in `Infrastructure/EventBus.ts` is the list of match events and their payloads.
`Statistics.ts` turns them into player/team stats for the live match, `/test` and `simulateMatch`
(which `/lab` aggregates). A new observable mechanic needs its event, its `Statistics.ts` field,
a `/test` surface and a `/lab` metric (`CLAUDE.md`).
