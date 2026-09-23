# Shot System (xG-Based) — Current Implementation

## Files

| File | Role |
|------|------|
| `Infrastructure/ActionOutcomes.ts` | `computeXG`, `computeShooterEffect`, `computeGKEffect`, `computeGKPositionQuality`, `resolveShot` |
| `Domain/gameState.ts` | Shot state machine; calls `resolveShot` on arrival |

---

## 1. Shot Quality (xG)

xG is the **pure spatial probability** of a shot — position and pressure only. No player or GK attributes.

```ts
export function computeXG(dist: number, openAngle: number, pressure: number): number {
  const distFactor     = Math.exp(-Math.pow(dist / XG_DIST_SCALE, XG_DIST_POWER));
  const angleFactor    = clamp(openAngle / MAX_OPEN_ANGLE, 0.2, 1);
  const pressureFactor = clamp(1 - pressure * XG_PRESSURE_SCALE, 0.5, 1);
  return clamp(distFactor * angleFactor * pressureFactor, 0, 1);
}
```

### Constants

| Constant | Value | Meaning |
|---|---|---|
| `XG_DIST_SCALE` | 40 yds | Elbow of the power-law distance curve |
| `XG_DIST_POWER` | 10 | Steepness — flat inside ~30 yds, drops sharply beyond |
| `MAX_OPEN_ANGLE` | `PI/4` (~45°) | Reference angle — penalty-spot central shot ≈ 36° scores 0.81 |
| `XG_PRESSURE_SCALE` | 0.2 | Per defender within pressure radius |

### Reference xG values (central, no pressure)

| Distance | xG |
|---|---|
| 6 yds | 1.00 |
| 10 yds | 0.97 |
| 12 yds (penalty spot) | 0.81 |
| 16 yds | 0.62 |
| 20 yds | 0.50 |
| 25 yds | 0.40 |
| 30 yds | 0.32 |
| 35 yds | 0.23 |

The distance factor is essentially flat (≈ 1.0) inside 25 yards and drops steeply beyond 35. **The angle factor drives most xG variation for in-box shots.**

---

## 2. Shooter Effect

Maps `shootAccuracy` (0..0.95 from TeamLineup) to a multiplier. Good finishers beat xG; poor finishers underperform.

```ts
export function computeShooterEffect(shooter: GamePlayer): number {
  const val = SHOOTER_EFFECT_MIN
    + shooter.stats.withBall.shootAccuracy * (SHOOTER_EFFECT_MAX - SHOOTER_EFFECT_MIN) / 0.95;
  return clamp(val, SHOOTER_EFFECT_MIN, SHOOTER_EFFECT_MAX);
}
```

| Constant | Value |
|---|---|
| `SHOOTER_EFFECT_MIN` | 0.7 |
| `SHOOTER_EFFECT_MAX` | 1.3 |

---

## 3. GK Semicircle Positioning

Before a shot arrives the GK moves on the **angle-bisector arc** — the line from the goal centre toward the ball, at a come-out distance that scales with attacker proximity.

```ts
// In computeGKSemicirclePosition() — DefensivePositioning.ts
const comeOut = GK_MIN_COME_OUT
  + (GK_MAX_COME_OUT - GK_MIN_COME_OUT) * Math.max(0, 1 - dist / GK_COME_OUT_DIST);

rawX = goalX + (dx / dist) * comeOut;
rawY = goalCenterY + (dy / dist) * comeOut;
```

| Constant | Value | Meaning |
|---|---|---|
| `GK_MIN_COME_OUT` | 0.5 yds | Always slightly off the line |
| `GK_MAX_COME_OUT` | 6.0 yds | Fully extended when attacker is close |
| `GK_COME_OUT_DIST` | 20 yds | Attacker distance for full extension; retreats linearly beyond |

This is an **early return** inside `computeDefensivePosition` — GKs bypass the entire outfield pipeline.

---

## 4. GK Position Quality

`computeGKPositionQuality` measures how close the GK's actual position is to the optimal arc position. Used inside `computeGKEffect` to scale the positioning component.

```ts
export function computeGKPositionQuality(
  gk: GamePlayer,
  ballPos: { x: number; y: number },
): number {
  // ...compute optimal arc position from goal centre toward ball...
  const deviation = Math.hypot(gk.x - optX, gk.y - optY);
  return Math.max(0, 1 - deviation / GK_MAX_POSITION_DEVIATION);
}
```

| Constant | Value | Meaning |
|---|---|---|
| `GK_MAX_POSITION_DEVIATION` | 8.0 yds | Deviation at which quality reaches 0 |

A GK who scrambled for a corner and hasn't recovered their arc position gets reduced positioning benefit on the next shot.

---

## 5. GK Effect

Reduces `goalChance`. Positioning is weighted by arc quality; reflex/diving are distance-blended. Weights sum to 1.0.

```ts
export function computeGKEffect(
  gk: GamePlayer,
  distToGoal: number,
  ballPos: { x: number; y: number },
): number {
  const closeWeight = clamp(1 - distToGoal / GK_DISTANCE_SCALE, 0, 1);
  const farWeight   = 1 - closeWeight;
  const { gkPositioning, gkReflex, gkDiving } = gk.stats.withoutBall;

  const posQuality = computeGKPositionQuality(gk, ballPos);

  // Weights: positioning 0.50 + reflex/diving 0.50 = 1.0
  const gkSkill = gkPositioning * posQuality * 0.5
    + (gkReflex * closeWeight + gkDiving * farWeight) * 0.5;

  // gkSkill 0..1 → gkEffect 1.0..0.55
  return clamp(1 - gkSkill * 0.45, GK_EFFECT_MIN, GK_EFFECT_MAX);
}
```

| Constant | Value | Meaning |
|---|---|---|
| `GK_DISTANCE_SCALE` | 20 yds | Threshold between close (reflex) and far (diving) |
| `GK_EFFECT_MIN` | 0.55 | Max GK on perfect arc reduces goalChance by 45% |
| `GK_EFFECT_MAX` | 0.90 | Worst GK still reduces goalChance by 10% |

### GK stats source (TeamLineup.ts)

```ts
gkPositioning: role === 'GK' ? raw.pressing     / 10 : 0,
gkReflex:      role === 'GK' ? raw.acceleration / 10 : 0,
gkDiving:      role === 'GK' ? raw.speed        / 10 : 0,
```

---

## 6. Final Resolution

```ts
goalChance = xG × shooterEffect × gkEffect
isGoal     = Math.random() < goalChance
```

The shot is also checked against the post (`shot.toY` must be in `[GOAL_Y_MIN, GOAL_Y_MAX]`) before any probability roll.

### Reference goalChance (penalty spot, no pressure)

| Scenario | xG | shooterEffect | gkEffect | goalChance |
|---|---|---|---|---|
| 10/10 shooter vs 10/10 GK (on arc) | 0.81 | 1.30 | 0.55 | **58%** |
| 10/10 shooter vs avg GK | 0.81 | 1.30 | 0.78 | **82%** |
| Avg shooter vs avg GK | 0.81 | 1.00 | 0.78 | **63%** |

---

## 7. Statistics

Events emitted (EventBus):

```ts
gameBus.emit('shotResolved', { player: shooter.id, xg: shot.xg, goalChance, isGoal, inPosts });
```

Track separately:
- Player: `goals - xG` (overperformance/underperformance)
- GK: `xG conceded - goals conceded` (saves above/below expected)
