# Defensive Positioning — Current Implementation

## Files

| File | Role |
|------|------|
| `Domain/DefensivePositioning.ts` | All positioning: GK arc, shape anchor, intent scoring, mark/carry-lane targets |
| `Configs/DefenseConfig.ts` | Per-team numeric weights; `applyTeamTacticsConfig()`; tactic key storage |
| `Configs/DefensiveIntentConfig.ts` | Static intent scoring constants and tactic multiplier tables |
| `Domain/DecisionTree.ts` | `evaluateDefensiveDecision()` — scores and caches the intent per player |
| `Domain/gameState.ts` | Calls positioning; executes movement |

---

## Entry Point

`computeDefensivePosition(player, ballPos, allPlayers, formation, ballHolderId, playerDecision, markTargetId)`

Called from `computeTargetPosition()` in `Positioning.ts` when the player's team does not have the ball.
Returns `{ x, y }` — hard-clamped to `player.bounds` before returning.

Mark assignments are pre-computed once per tick via `assignMarkTargets(allPlayers, defendingTeam)` in `gameState.ts`.

---

## GK: Angle-Bisector Semicircle Positioning

GKs bypass the entire outfield pipeline. They receive an **early return** at the top of `computeDefensivePosition`:

```ts
if (player.role === 'GK') {
  return computeGKSemicirclePosition(player, ballPos);
}
```

`computeGKSemicirclePosition` positions the GK on the line from the goal centre toward the ball, at a come-out distance that narrows the shooting angle:

```ts
const goalCenterY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
const comeOut = GK_MIN_COME_OUT
  + (GK_MAX_COME_OUT - GK_MIN_COME_OUT) * Math.max(0, 1 - dist / GK_COME_OUT_DIST);

rawX = goalX + (dx / dist) * comeOut;
rawY = goalCenterY + (dy / dist) * comeOut;
```

| Constant | Value | Meaning |
|---|---|---|
| `GK_MIN_COME_OUT` | 0.5 yds | Always slightly off the line |
| `GK_MAX_COME_OUT` | 6.0 yds | Fully extended when attacker is at ≤ 20 yds |
| `GK_COME_OUT_DIST` | 20 yds | Retreat linearly beyond this distance |

Position is bounds-clamped. Constants live in `ActionOutcomes.ts` (shared with `computeGKPositionQuality`).

---

## Outfield: Scored Intent System

Outfield defensive decisions go through a **scored intent pipeline** — not a heuristic stage chain. The intent is computed once per tick in `evaluateDefensiveDecision()` (DecisionTree.ts), cached in `_intentCache[player.id]`, and read here for positioning.

### Active Intents

| Intent | Positioning behaviour |
|---|---|
| `hold_shape` | Shape anchor only — depth track + compactness + lane block |
| `track_mark` | Shape anchor + threat-based mark/lane-cut pull |
| `press_holder` | Shape anchor only — movement executed by gameState (press decision) |
| `step_into_carry_lane` | Intercept point on the ball carrier's path toward own goal |

`cover_pass_lane` is scored but currently maps to shape anchor (not yet a distinct target).

---

## Shape Anchor (`computeDefensiveShapeAnchor`)

The base position all intents start from. Four sequential adjustments:

### X: Ball-Relative Depth Tracking

```ts
const depthOffset = (1.0 - cfg.DEFENSIVE_LINE_HEIGHT) * DEPTH_OFFSET_RANGE + DEPTH_OFFSET_BASE;
const ballLineX   = ballPos.x - player.attackDir * depthOffset;
rawX += (ballLineX - rawX) * X_TRACK_WEIGHT;
```

| Constant | Value |
|---|---|
| `DEPTH_OFFSET_BASE` | 10 yds |
| `DEPTH_OFFSET_RANGE` | 40 yds |
| `X_TRACK_WEIGHT` | 0.6 |

Effective depth behind ball by tactic:

| `defensive_line` | DLH | Depth |
|---|---|---|
| `deep` | 0.40 | ≈ 34 yds |
| `normal` | 0.60 | ≈ 26 yds |
| `high` | 0.75 | ≈ 20 yds |

### Y: Lateral Block Shift

```ts
const blockShiftY = (ballPos.y - base.y) * cfg.BLOCK_SHIFT_WEIGHT * 0.15;
rawY = base.y + blockShiftY;
```

### Y: Horizontal Compactness

```ts
rawY += (PITCH_CENTER_Y - rawY) * cfg.HORIZONTAL_COMPACTNESS * 0.12;
```

### X: Lane Blocking

```ts
const laneTarget = ownGoalX + ballSide * 0.7;
rawX += (laneTarget - rawX) * cfg.LANE_BLOCK_WEIGHT * 0.15;
```

---

## Track Mark Target (`computeTrackMarkTarget`)

Used when intent is `track_mark`. Blends shape anchor toward the ball→mark passing lane, scaled by threat.

Threat uses a non-linear curve for earlier engagement at medium danger:

```ts
const threat       = Math.max(0, 1 - distFromOwnGoal / cfg.THREAT_HORIZON);
const threatCurved = 1 - Math.pow(1 - threat, 1.5);
```

| Constant | Value |
|---|---|
| `MARK_PULL_MAX` | 0.90 |
| `MARK_PULL_MIN` | 0.30 |
| `MARK_LANE_T_CLOSE` | 0.75 |
| `MARK_LANE_T_FAR` | 0.30 |
| `THREAT_HORIZON` | 100 yds |

---

## Carry Lane Intercept (`computeCarryLaneIntercept`)

Used when intent is `step_into_carry_lane`. Projects the ball holder's path toward own goal by `CARRY_LANE_LOOKAHEAD` yards and returns the closest point on that path to the defender.

```ts
// Projects holder CARRY_LANE_LOOKAHEAD yds toward own goal
// Returns the intercept point the defender should move to
```

| Constant | Value |
|---|---|
| `CARRY_LANE_LOOKAHEAD` | 8 yds |
| `CORRIDOR_HALF_WIDTH` | 8 yds |

---

## Intent Scoring (`evaluateDefensiveDecision` in DecisionTree.ts)

Each intent is scored from role weights × tactic multipliers × context signals. The highest-scoring intent is cached and used in `computeDefensivePosition`.

### Tactic multiplier tables (DefensiveIntentConfig.ts)

**`pressing_style`:**

| Style | hold_shape | track_mark | press_holder | step_into_carry_lane |
|---|---|---|---|---|
| `low_block` | 1.4 | 1.2 | 0.3 | 0.6 |
| `mid_block` | 1.0 | 1.0 | 1.0 | 1.0 |
| `high_press` | 0.5 | 0.8 | 1.8 | 1.2 |

**`defensive_line`:**

| Line | hold_shape | track_mark | press_holder | step_into_carry_lane |
|---|---|---|---|---|
| `deep` | 1.3 | 1.2 | 0.6 | 1.1 |
| `normal` | 1.0 | 1.0 | 1.0 | 1.0 |
| `high` | 0.7 | 0.9 | 1.4 | 0.9 |

### Role intent weights (roles.json `engine.defensiveIntentWeights`)

| Role | hold_shape | track_mark | press_holder | step_into_carry_lane |
|---|---|---|---|---|
| CB | 0.80 | 0.90 | 0.15 | 0.75 |
| LB/RB | 0.55 | 0.65 | 0.35 | 0.55 |
| LWB/RWB | 0.40 | 0.50 | 0.50 | 0.45 |
| CDM | 0.50 | 0.65 | 0.75 | 0.55 |
| CM | 0.40 | 0.55 | 0.65 | 0.40 |
| CAM | 0.20 | 0.30 | 0.45 | 0.25 |
| LM/RM | 0.25 | 0.35 | 0.45 | 0.30 |
| LW/RW | 0.20 | 0.25 | 0.40 | 0.20 |
| ST | 0.10 | 0.15 | 0.30 | 0.15 |
| GK | 0.00 | 0.00 | 0.00 | 0.00 (never reaches intent scoring) |

---

## Tackle and Press (DecisionTree.ts)

These are decisions, not positioning intents:

```
dist ≤ TACKLE_RANGE (2.0 yds)  → tackle  (always, no cooldown check needed)
evaluateDefensiveDecision scores press_holder high enough → press
```

GK never receives a press decision (early `idle` return in `decide()`).

Press commit: `press: 8` ticks — prevents the presser abandoning pursuit each re-evaluation.

---

## DefenseConfig — Defaults and Tactic Mappings

### Defaults

| Key | Default | Meaning |
|---|---|---|
| `DEFENSIVE_LINE_HEIGHT` | 0.50 | 0 = deep, 1 = high line |
| `HORIZONTAL_COMPACTNESS` | 0.60 | Y squeeze toward center |
| `PRESS_INTENSITY` | 0.50 | Secondary press range multiplier |
| `PRESS_ACCEL_RANGE_BONUS` | 5 yds | Max extra press reach from acceleration |
| `PRESS_ACCEL_SPEED_BOOST` | 1.0 yds/s | Speed added when pressing |
| `BLOCK_SHIFT_WEIGHT` | 0.80 | Lateral block-follows-ball strength |
| `LANE_BLOCK_WEIGHT` | 0.40 | X nudge toward ball-goal corridor |
| `MARK_PULL_MAX` | 0.90 | |
| `MARK_PULL_MIN` | 0.30 | |
| `THREAT_HORIZON` | 100 yds | |

### Tactic → Config Mappings

**`pressing_style`:**

| Style | PRESS_INTENSITY | TACKLE_AGGRESSION |
|---|---|---|
| `low_block` | 0.20 | 0.25 |
| `mid_block` | 0.50 | 0.40 |
| `high_press` | 0.85 | 0.65 |

**`defensive_line`:**

| Line | DEFENSIVE_LINE_HEIGHT |
|---|---|
| `deep` | 0.40 |
| `normal` | 0.60 |
| `high` | 0.75 |

**`width`:**

| Width | HORIZONTAL_COMPACTNESS | BLOCK_SHIFT_WEIGHT |
|---|---|---|
| `narrow` | 0.80 | 0.70 |
| `normal` | 0.60 | 0.80 |
| `wide` | 0.30 | 0.90 |

---

## What Is Not Yet Implemented

- `TACKLE_AGGRESSION` is configured and stored but unused in decision logic
- `cover_pass_lane` intent is scored but has no distinct target — falls back to shape anchor
- Full press migration from rank/range gate to pure score-based (Phase 8b of migration plan) is pending
