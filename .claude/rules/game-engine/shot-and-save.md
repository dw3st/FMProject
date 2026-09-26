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

---

## 8. Penalty Shootout

### Files

| File | Role |
|------|------|
| `Configs/PenaltyConfig.ts` | Tuning constants |
| `Infrastructure/PenaltyShootout.ts` | `penaltyChance`, `resolvePenaltyShootout` — pure, shared by the full engine and quickSim |

A shootout is not shot-by-shot xG — it's a separate, simpler probability model (`penaltyChance`)
tuned so two average sides convert ~75%, close to the real-world penalty conversion rate.

### `penaltyChance(accuracy, keeper)`

```ts
shooter  = SHOOTER_MIN + (clamp(accuracy, 0, 0.95) / 0.95) * (SHOOTER_MAX - SHOOTER_MIN)
keeperFx = keeper ? 1 - ((keeper.reflex + keeper.diving) / 2) * GK_WEIGHT : 1
chance   = clamp(BASE * shooter * keeperFx, MIN_CHANCE, MAX_CHANCE)
```

`accuracy` is the taker's `runtimeStats.withBall.shootAccuracy` (engine) or
`finishing / 10` capped at 0.95 (quickSim) — the same 0..0.95 scale used for open play. `keeper`
is `null` for an empty goal (used only in the degenerate forfeit case below), otherwise the facing
GK's `reflex`/`diving` (engine: `gkReflex`/`gkDiving`; quickSim: `reflex`/`jump` attributes ÷ 10).

| Constant | Value | Meaning |
|---|---|---|
| `ROUNDS` | 5 | Kicks per side before sudden death |
| `MAX_SUDDEN_DEATH_ROUNDS` | 30 | Safety cap; after it the winner is a coin flip |
| `BASE` | 0.85 | Calibrated so two average sides convert ~75% |
| `SHOOTER_MIN` / `SHOOTER_MAX` | 0.85 / 1.15 | Shooter multiplier range, linear in `accuracy` |
| `GK_WEIGHT` | 0.25 | Keeper multiplier = `1 − avg(reflex, diving) × GK_WEIGHT` → 0.75..1 |
| `MIN_CHANCE` / `MAX_CHANCE` | 0.55 / 0.92 | Final clamp |

Reference: average shooter (0.5) vs average keeper (0.5/0.5) → chance ≈ 0.85 × 1.0 × 0.875 ≈ 74%,
within the calibrated 70–80% band measured over 10,000 shootouts.

### `resolvePenaltyShootout(sideA, sideB, rng)`

Generic over `Id` (`number` in the full engine, `string` in quickSim) so both callers share one
implementation. The whole shootout is resolved **up front** in a single call — the caller (the
engine's `startPenalties`, or quickSim directly) presents the returned kicks however it needs to
(the engine reveals them one at a time on a countdown; quickSim just reads the final score).

**Kick order** (`kickOrder`): outfield takers sorted by `accuracy` descending (best finisher
first), goalkeeper(s) always last. Ties keep array order (stable sort).

**Regulation** (`ROUNDS = 5`): kicks alternate strictly A, B, A, B… Each side's `taken`/`score`
tally is checked after every single kick — the shootout stops the moment one side mathematically
cannot catch up even if they scored every remaining kick:

```ts
decided = score.A + (ROUNDS - taken.A) < score.B || score.B + (ROUNDS - taken.B) < score.A
```

e.g. 3–0 after 6 kicks with B down to 2 remaining kicks (`0 + 2 < 3`) ends the shootout right
there — it never plays out to a full 5 rounds each once the result is mathematically settled.

**Sudden death**: once level after `ROUNDS`, kicks continue in A/B pairs (both take a kick every
round — no early stop within a sudden-death round) until someone is ahead, capped at
`MAX_SUDDEN_DEATH_ROUNDS = 30` pairs.

**`rng()` is called exactly once per kick** — this determinism is relied on by tests and makes a
shootout reproducible from a seed.

**A shootout always produces a winner and a non-tied score.** Three degenerate cases, all
practically unreachable (a shootout only ever follows 120 minutes with a full XI including a GK on
both sides) but handled explicitly so the function's contract never breaks:
- **Both sides have zero takers** — returns `kicks: []`, `score: { A: 1, B: 0 }`, winner `A`. The
  only case where `score` does not equal the scored-kick counts in `kicks` (there is no player on
  either side to attribute a synthetic kick to).
- **Exactly one side has zero takers** — that side forfeits: a single synthetic scored kick
  (`chance: 1`) is pushed for the other side's first taker in kick order, so `score` still equals
  the scored-kick counts in `kicks`.
- **Still level after `MAX_SUDDEN_DEATH_ROUNDS`** — a coin flip (`rng() < 0.5`) picks the winner,
  who gets one more synthetic scored kick (`chance: 1`) appended so `score` keeps agreeing with
  `kicks`.

### `PenaltyKick<Id>` fields

```ts
{ team: "A" | "B"; takerId: Id; keeperId: Id | null; scored: boolean; chance: number }
```

`keeperId` is the *facing* keeper (the other side's GK), `null` only when that side has no GK on
the pitch. `chance` is the exact `penaltyChance` used for that kick's roll (or `1` for a synthetic
forfeit/coin-flip kick) — the engine's `/test` debug panel shows it per kick.

### Where it's called

- **Full engine** (`gameState.ts` → `startPenalties`): builds one `PenaltySide<number>` per team
  from the 11 players on the pitch, calls `resolvePenaltyShootout(..., Math.random)` once, then
  presents `result.kicks` one at a time via `GameState.shootout` (see
  `.claude/rules/match-flow.md` → "Knockout Matches").
- **quickSim** (`src/Domain/advanceDay/quickSim.ts` → `shootoutSide` + the `knockout` branch of
  `quickSimMatch`): builds a `PenaltySide<string>` per side from the same starting XI used for the
  match (`finishing`/`reflex`/`jump` attributes), calls `resolvePenaltyShootout` with the match's
  own seeded `rng`, and reads only the final `score` — no kick-by-kick presentation. See
  `.claude/rules/non-player-games.md` → "quickSim (ligas não seguidas)".
