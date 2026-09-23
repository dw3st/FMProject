# Through Ball — Current Implementation

A through ball is a pass played into space (a *cell*, not a teammate's feet). On
landing the ball is contested — players from both teams may have committed to a
sprint chase before the ball arrives. Phase 5 contested arrivals are resolved
via a physical-trait duel (`resolveLooseBallDuel`).

This document is the source of truth for the current state. The original design
is in [the planning agent's plan output](#); this doc captures what was actually
shipped + what is deferred.

## Files

| File | Role |
|------|------|
| `Configs/ThroughBallConfig.ts` | All tunable weights, sprint constants, per-role chase weights |
| `Domain/ThroughBallCells.ts` | Cell candidate generator + per-cell scoring |
| `Domain/DecisionTree.ts` | `evalThroughBall()` + `through_ball` decision variant + `chase_loose_ball` decision variant |
| `Domain/gameState.ts` | `startThroughBall()`, `commitLooseBallChasers()`, drift physics, `resolveOOBSetPiece()` (throw-in / goal-kick / corner), duel resolution, `chase_loose_ball` movement |
| `Domain/SetPieceLayouts.ts` | All 9 set-piece layouts per formation (already existed; reused for OOB) |
| `Domain/SetPiecePositioning.ts` | `applySetPieceToTeam()` — teleport a team into a layout |
| `Infrastructure/ActionOutcomes.ts` | `resolveLooseBallDuel()` |
| `Infrastructure/EventBus.ts` | `throughBallStarted/Completed/LostInFlight/LostInRace/LostInDuel`, `looseBallWon`, `chaseCommit`, `throughBallScores` |
| `Domain/Statistics.ts` | 6 new stat fields + subscriptions |
| `lab/types.ts` + `lab/balanceWorker.ts` + `lab/scenarioRunner.ts` + `lab/components/PairDetail.tsx` | Through-ball stats propagated through `/lab` |
| `GameInterface/StatsPanel.tsx` | Live `/match` columns: TB / TBC / TB% |
| `GameInterface/DebugPanel.tsx` | Score breakdown panel under "Decision Scores" when holder is selected |
| `GraficsEngine/PixiPitch.tsx` | Heatmap overlay (cells colored by score) + sprint-path overlay during flight |

## Lifecycle

```
[decideBallHolder]
    evalShoot / evalPass / evalCarry / evalDribble / evalThroughBall
    → highest score wins
    ↓ if through_ball
[startThroughBall(state, decision)]
    Pass-error model: Gaussian noise ~ (1 − passingSkill) × MAX_THROUGH_BALL_ERROR
    Snapshots offside status of the intended runner at kick time
    Sets state.pass = { kind:'through', toId:null, toX, toY, intendedRunnerId }
    ↓
[commitLooseBallChasers]
    Top N=2 attackers + top N=2 defenders by ETA → state.decisions[id] = chase_loose_ball
    Role weights gate eligibility; GK chases only if landing point is in own box
    Path field on decisionMemory is set explicitly so commit-reuse path-check passes
    Emits `chaseCommit` for the /test sprint-path overlay
    ↓
[Pass in flight — same physics as a regular pass]
    Each tick advances state.pass.t
    Interception check uses (toX, toY) instead of a receiver player position
    Any defender on the trajectory may intercept → throughBallLostInFlight
    Chasing players move at sprint speed (no formation pull, only pitch bounds)
    Chasers PINNED in the decision loop while s.pass.kind === 'through'
    ↓ on t ≥ 1
[Transition to loose ball]
    state.pass = null
    state.looseBall = { x, y, startTime, fromPasserId, fromTeamLastTouch,
                        intendedRunnerId, receiverOffside }
    Emits `looseBallStarted`
    ↓
[Loose-ball drift — handleLooseBall runs each tick with dt]
    1. Advance ball: x += vx·dt, y += vy·dt
       Decay velocity: speed -= LOOSE_BALL_DECELERATION·dt (clamped to 0)
    2. Out-of-bounds check (x∉[0,PITCH_LENGTH] or y∉[0,PITCH_WIDTH]):
       Touchline   → throw_in   set piece (awarded team = ≠ fromTeamLastTouch)
       Opponent's goal line → goal_kick (defending team's GK takes from the 6-yd line)
       Own goal line       → corner    (winger of opposing team at the corner flag)
       resolveOOBSetPiece() applies the relevant _Attack / _Defend layouts,
       moves the taker on top of the actual ball position, and freezes play
       for 1.0–2.0s before normal AI resumes.
    3. Otherwise persist {x, y, vx, vy} on state.looseBall.
       Players continue sprinting — the decision-loop chase pin uses the
       CURRENT loose-ball position so chasers track the drifting ball.
       Sort non-recovering players by distance to looseBall:
         0 in touch (≤ LOOSE_BALL_TOUCH_RADIUS) → ball keeps drifting (or
           sits if velocity decayed to 0) until someone arrives.
         1 in touch (or top-2 same-team / gap > DUEL_GAP_TRIGGER) → clean pickup
         2 opposing within DUEL_RADIUS, gap ≤ DUEL_GAP_TRIGGER
           → resolveLooseBallDuel — physical-trait 50/50, both enter recovery
       Offside enforced ONLY if the intended runner is the winner AND was offside
       at kick time (Phase 3 simplification — Phase 6 will broaden to per-runner).
    ↓
    if winner.team === fromTeamLastTouch:
        throughBallCompleted (+ looseBallWon)
    else if duel already triggered: throughBallLostInDuel
    else: throughBallLostInRace
```

The ball's behaviour after landing is "physical drift, then arrival or set piece": it carries small residual velocity in the pass direction (initial speed `LOOSE_BALL_INITIAL_SPEED = 4 yds/s`) and decelerates via `LOOSE_BALL_DECELERATION = 2 yds/s²` until it comes to rest (~2 real seconds). Because chase decisions are pinned to the *current* loose-ball position each tick, sprinting players track the moving ball naturally. `getBallPos(state)` continues to return `state.looseBall.{x,y}`, so the rendered ball drifts on screen instead of teleporting.

If the ball drifts past any pitch edge before a player reaches it, `resolveOOBSetPiece` (in gameState.ts) classifies the boundary and applies the matching set piece:
- **Touchline (top/bottom)** → `throw_in`. Awarded to the team that did NOT last touch. Nearest outfield player from that team takes from the touchline at the exit X. Countdown 1.5s.
- **Opponent's goal line** (normal forward through ball that drifts past) → `goal_kick`. Defending GK takes from the six-yard line, centred. Both teams reposition into `goalKick` / `kickOffDefend` shapes. Countdown 1.0s.
- **Passer's own goal line** (rare — backward through ball) → `corner`. Nearest winger of the opposing team takes from the corner flag on the side the ball went out. Countdown 2.0s.

In all three cases, both teams snap into their formation's `_Attack` / `_Defend` set-piece layout, the taker is overridden onto the actual restart position, and the existing set-piece freeze rules apply (taker may pass but cannot carry until the countdown drains).

## Cell Scoring

Each grid cell `(x, y)` (centre of a CrowdGrid cell) is scored in two stages:
a **viability** sum, then a **multiplicative goal-threat buff**.

```
viability =
    raceMargin    × W_RACE        // 0.35 — primary signal
  + spaceQuality  × W_SPACE       // 0.20
  + passerSkill   × W_SKILL       // 0.10
  + pathClear     × W_PATH        // 0.40 — heaviest, TB-only discriminator
  − laneRisk      × W_LANE_RISK   // 0.10
  − offsideRisk   × W_OFFSIDE     // 0.05

cellScore = max(0, viability) × (1 + GOAL_THREAT_BUFF × goalThreat × raceMargin)
```

### Goal threat is a BUFF, not a weight or a penalty

`goalThreat` (∈ [0,1], blends goal proximity + open shooting angle) does **not**
appear in the viability sum. It is applied multiplicatively *after* viability:
a cell that also creates a genuine goal threat is *lifted* above an
equal-viability cell that does not. At `GOAL_THREAT_BUFF = 0.6` a perfect-threat
cell scores up to 1.6× a same-viability zero-threat cell.

Why a buff and not a penalty on bad shooting angles: we sometimes **want** a
pure progression ball into open space with no immediate goal threat (springing
a runner from midfield). Penalising the bad-angle corner would kill those
plays. Instead low-threat cells keep their full viability and good-threat cells
rise above them.

**The buff is gated by `raceMargin`** (`× goalThreat × raceMargin`). Without
this gate the buff resurrects lost-race cells — e.g. a goal-mouth cell with a
wide-open angle (`goalThreat ≈ 0.97`) that the GK reaches first
(`raceMargin ≈ 0`). Multiplying the buff by the race score zeroes the goal
lift on any cell we cannot win, so balls-to-the-keeper never top the list.

Note: `viability` is **lower-clamped to 0** but never upper-clamped, so a clean
high-path channel can exceed raw 1.0 before compression (which handles raw>1.0
fine).

### Phase 1 cull (cheap rejects before scoring)

- Cell behind passer (forward offset < `MIN_FORWARD_PROGRESS` = 5 yds) → skip
- Cell in own half → skip
- Cell beyond passer's vision horizon (25 → 60 yds linear in vision) → skip
- Cell with opponent density > `MAX_OPP_DENSITY` (12) → skip
- **No attacker can run *forward* to the cell** — a through ball is by
  definition a forward run into space. The runner search is restricted to
  attackers currently at least `MIN_RUNNER_FORWARD_PROGRESS` (= 2 yds) behind
  the cell in attack direction. If no teammate qualifies, the cell is
  rejected. This is the structural guard against the "defenders are higher
  than every attacker" case — the engine no longer rewards cells where the
  closest attacker would have to run sideways/backward to receive (those
  belong to `PassLanes`, not `ThroughBallCells`).

### `raceMargin` — central factor

```
eta(p) = dist(p → cell) / sprintSpeed(p)
sprintSpeed(p) = pressSpeed
               + acceleration × SPRINT_ACCEL_BOOST (1.5)
               + speed         × SPRINT_TOP_BOOST   (0.5)

bestAttackerEta = min over attackers (excluding holder, excluding GK)
bestDefenderEta = min over defenders (INCLUDING GK — sweeper-keeper races for deep balls)
raceMargin      = bestDefenderEta − bestAttackerEta

raceMarginScore =
    margin > 0:  min(1, margin / RACE_FAVOUR_HORIZON)   // 1.0s ahead → 1.0
    margin ≤ 0:  max(0, 0.5 + margin / RACE_LOSS_HORIZON) // 1.5s behind → 0
```

### Path-clearness — the TB-only discriminator

`pathClearScoreForCell(cx, cy, attackDir, defOutfield)` sums defending outfield
density in a row band ahead of the cell, normalised by `PATH_DENSITY_SATURATION`.
1 = no defenders between this cell and goal (runner is through the line);
0 = path is choked.

This is what makes a TB structurally different from a pass-to-feet. A regular
pass to Santos's feet doesn't get this bonus — Santos still has to dribble
past the line — but a through ball into the channel lands the ball already
goal-side of the defenders. **`W_PATH = 0.40` is the heaviest TB weight** for
this reason: in a clean-channel scenario with `path ≈ 1.0`, it adds +0.40
raw on top of the other factors and decisively flips TB ahead of the regular
pass. In a blocked-channel scenario (`path ≈ 0.3`), the bonus is small and
the regular pass wins.

### `goalThreatScore` — angle-gated, proximity-scaled

`goalThreatScore(holder, cx, cy)` feeds the buff above. It uses
`PASS_CONFIG.GOAL_PROXIMITY_HORIZON = 55` (shared with PassLanes'
`getGoalProximityBonus`) for the proximity term, and **gates the whole score by
the open shooting angle** so a dead byline corner returns ≈ 0 even though it is
close to goal:

```
proximity = 1 − dist / GOAL_PROXIMITY_HORIZON      // 0..1, clamped
angle     = computeOpenAngle(cx, cy, goalX)
angleFac  = min(1, angle / MAX_OPEN_ANGLE)
goalThreat = angleFac × (0.4 + 0.6 × proximity)
```

The angle gate (`angleFac`) is the multiplier, not an additive term: from the
byline corner `angleFac ≈ 0`, so the cell gets no buff no matter how close it
sits to the goal line. A central cell with a clean shooting angle keeps the
full `0.4 + 0.6 × proximity`.

### Compression to ActionScore

`compress(rawCellScore, THROUGH_BALL_STRONG_RAW=0.9)` so a "great cell" (raw≈0.9)
maps to score 0.632 — comparable to a "great pass" or "great carry" via the same
calibration system used by other actions in `decideBallHolder`.

### Dispatch — TB fires immediately

Through balls fire **before** the post-reception burst in `gameState.tickState`.
The burst exists to create space *before deciding what to play next*; if the
holder has already decided on a TB, we don't waste 0.8s of game time on burst
movement. Dispatch order:

```
shoot → through_ball → post-reception burst → carry → dribble → pass (fallback)
```

### Chasers PINNED for the full TB flight

`COMMIT_TICKS.chase_loose_ball = 6` is the baseline, but for through balls the
decision loop in `tickState` adds a stronger guarantee: while
`s.pass?.kind === 'through'`, any player whose
`decisionMemory.decision.type === 'chase_loose_ball'` is **re-pinned every
tick** with refreshed commit ticks. `decide()` is bypassed entirely for them.

Why this is necessary: the standard commit-reuse path-check
(`mem.path === currentPath`) can fail mid-flight — and even when it passes,
`COMMIT_TICKS.chase_loose_ball = 6` may not cover a long pass (a 30-yard
through ball at 28 yds/s = ~5.4 ticks at 5fps, plus slop). When the commit
expires, `decide()` runs fresh and silently replaces the injected chase
decision with a normal off-ball / defensive intent — chasers stop running,
the duel resolves on whoever happens to be near the cell, and the through
ball appears to "auto-resolve" without anyone visibly sprinting.

The pin releases the moment `state.pass` clears (landing or interception),
so chasers naturally return to their normal decision pipeline.

Also: in `commitLooseBallChasers`, the `decisionMemory.path` is set explicitly
(`'TEAM_WITH_BALL'` for the passer's team, `'TEAM_WITHOUT_BALL'` for the
opposing team) so even if the pin somehow doesn't fire, the next tick's
commit-reuse still works.

## Chase Decision

Per-team commit step in `commitLooseBallChasers`:

1. Rank all non-passer, non-recovering players by ETA to landing point.
2. Apply role weight gate (`CHASE_LOOSE_BALL_WEIGHT_ATTACK` / `_DEFEND`).
3. GK only chases if landing inside own box (sweeper-keeper).
4. Take top `MAX_CHASERS_PER_TEAM = 2` per team within `ETA_HORIZON = 0.6 s` of best.
5. Override `state.decisions[id] = { type:'chase_loose_ball', toX, toY }`.
6. Bump `commitTicks` so the chase doesn't flicker.

### Sprint movement

In `gameState.ts` movement loop, `chase_loose_ball` decisions take priority over
press / off-ball. Move at `sprintSpeed` toward `(toX, toY)`. **No formation pull,
only pitch bounds** — a CB chasing a loose ball mid-pitch may temporarily leave
their CB box.

## Loose-Ball Duel

Triggered when both top arrivals are on opposing teams, within
`DUEL_RADIUS = 2 yds`, gap ≤ `DUEL_GAP_TRIGGER = 1 yd`.

```
playerScore =
    strength      × 0.40
  + dribbling     × 0.25   // first-touch control on the contested ball
  + acceleration  × 0.20
  + arrivalBonus           // +0..0.10 for the closer arrival
  + 0.15                   // base parity

probA = scoreA / (scoreA + scoreB + 0.001)
```

Both participants enter `DUEL_TACKLE_WIN_RECOVERY` regardless of outcome.

## Statistics

| Field | When emitted |
|-------|-------------|
| `throughBallsAttempted` | `throughBallStarted` (always — first event of the lifecycle) |
| `throughBallsCompleted` | Same-team player picks up at landing |
| `throughBallsLostInFlight` | Defender intercepts mid-flight; also fires if intended runner offside |
| `throughBallsLostInRace` | Defender wins by being closer at landing (no duel) |
| `throughBallsLostInDuel` | Defender wins the contested 50/50 |
| `looseBallsWon` | Any player wins the loose ball — counts both intended and unexpected pickups |

All of these flow through `getTeamStats()` and `simulateMatch().teamStats`, so
both the live `StatsPanel` AND the `/lab` `PairDetail` / `ResultsViewer` see
them automatically.

## Test Endpoint Surfaces

`/test` exposes:

- **TestCase** `through-ball-channel` — CM holder, ST runner between two CBs and a CDM, plus a wide LW alt option. Useful baseline for tuning.
- **Overlay toggle** `TB Cells` (purple) — shows the candidate cell heatmap when the ball is held; switches to sprint paths + landing marker during flight.
- **Cell heatmap** — top-30 cells colored red→yellow→green by score, with a gold ring on the best cell.
- **Sprint paths** — line from each committed chaser to the landing point, colored by team. Dual pulsing ring on the landing point.
- **Score breakdown panel** — under "Decision Scores", shows the best cell's score components (race / space / goal / skill / lane / offside) plus race ETAs (A/D/Δ).
- **Debug log entries** — category `throughBall` (purple) for kicks, intercepts, completions, and duels.

## Lab Surfaces

`/lab` `PairDetail` adds three rows: "Through balls", "TB completion%", "Loose balls won". Each propagates through `TeamRawStats` → `balanceWorker` aggregation → `scenarioRunner.perMatchView` → `PerMatchView` → the side-by-side bar chart.

## Configuration

All weights and thresholds live in `ThroughBallConfig.ts`. Notable:

| Constant | Value | Meaning |
|---|---|---|
| `MIN_FORWARD_PROGRESS` | 5 yds | Phase 1 cull — cells at least this far ahead of passer |
| `MIN_RUNNER_FORWARD_PROGRESS` | 2 yds | Phase 1 cull — at least one attacker must be this far behind cell in attack dir (forward run required) |
| `VISION_HORIZON_MIN/MAX` | 25 / 60 yds | Vision-based cull horizon |
| `MAX_OPP_DENSITY` | 12 | Phase 1 cull — opponent footprint sum (3×3) |
| `W_RACE`, `W_SPACE`, `W_SKILL`, `W_PATH`, `W_LANE_RISK`, `W_OFFSIDE` | 0.35, 0.20, 0.10, 0.40, 0.10, 0.05 | Per-cell **viability** weights (additive) |
| `GOAL_THREAT_BUFF` | 0.6 | Multiplicative goal-threat lift — `score = viability × (1 + BUFF × goalThreat × raceMargin)`. NOT a weight, NOT a penalty |
| `RACE_FAVOUR_HORIZON` | 1.0 s | Margin where raceScore reaches 1.0 |
| `RACE_LOSS_HORIZON`   | 1.5 s | Margin where raceScore decays to 0 |
| `THROUGH_BALL_STRONG_RAW` | 0.9 | `compress()` calibration — raw 0.9 → 0.632 |
| `MAX_THROUGH_BALL_ERROR` | 3 yds | Scales landing-point Gaussian noise: `sigma = (1 − passingSkill) × MAX / 2`. Halved from 6 → 3 to compress the inter-tier sigma gap so weak-vs-weak loose-ball races land near 50/50 |
| `SPRINT_ACCEL_BOOST` | 1.5 | Acceleration multiplier on sprint chase |
| `SPRINT_TOP_BOOST` | 0.5 | Speed multiplier on sprint chase |
| `MAX_CHASERS_PER_TEAM` | 2 | Top-N committed per team |
| `ETA_HORIZON` | 0.6 s | Candidate ETA gap from best to be considered |
| `ROLE_CHASE_THRESHOLD` | 0.1 | Minimum role weight to qualify |
| `LOOSE_BALL_TOUCH_RADIUS` | 0.5 yds | Distance at which a player picks up the loose ball |
| `DUEL_RADIUS` | 2 yds | Both arrivals within this radius → contested |
| `DUEL_GAP_TRIGGER` | 1 yd | Arrival gap below which we duel |

## What Is Not Yet Implemented

- **Tactic-driven through-ball preference** (Phase 6). The plan specified
  `applyThroughBallIntent` in `IntentConfig.ts` so `direct` build-up and
  `counter_attack` intent boost through-ball selection. Not wired yet —
  scoring is currently tactic-agnostic.
- **MCP `evaluate_through_ball` tool** — the heatmap can be inspected live in
  `/test` but there's no MCP tool to inspect a through ball from a saved
  snapshot yet.
- **Per-runner offside snapshots.** Today only the *intended runner*'s offside
  status is recorded. If a non-intended teammate (who happened to be onside)
  picks up the ball, no offside is called even if they were offside. Phase 6
  will broaden this to per-runner snapshots.
- **`role.json` migration** for `chaseLooseBallWeight` / `defendChaseWeight`.
  Currently in `ThroughBallConfig.ts` as a TS constant; should move to JSON to
  match `defensiveIntentWeights` / `offBallIntentWeights`.
