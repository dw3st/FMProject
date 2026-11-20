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

## Goleiro ativo (7.7)

O arco e a qualidade de posição agora vêm de `Domain/Keeper.ts` (arco mais adiantado com a bola longe, saída no 1 contra
1 sem punição na qualidade). Ver `.claude/rules/game-engine/keeper.md`.

## 9. 2D penalties (7.8)

Spec: `docs/superpowers/specs/2026-10-28-penalty-2d-design.md`. Pure model in `src/Domain/penalty/penaltyKick.ts`
(`PENALTY_2D`): since 7.9.5 the taker picks one of six areas of the goal (`KICK_WINDOW_S` 6 s, the AI's pick on
timeout), like the keeper's dive. The ball goes to the area's target (`areaTarget`: corners near the woodwork) with a
spread `AIM_SPREAD × (1.2 − finishing)`; strength (`POWER_SAVE`) and finishing (`FINISH_SAVE`) make it harder to save; a
keeper who dived reaches a ball down the middle sometimes (`MID_REACH_LOW/HIGH`). Measured: average taker ~74%, finishing
0.85 ~85%, 0.2 ~64%, strength 0.9 / 0.1 ~78% / ~72%; no aim nor power bar any more (`bun scripts/penalty-2d-measure.ts`).

- Engine: `GameState.penaltyInteractive` (teams that answer their penalties). With it, `startPenalties` builds
  `shootout.live` (order, taken, next) and each kick becomes `pendingPenalty`; `resolveInMatchPenalty` also waits.
  While `pendingPenalty` is set everything holds (clock included). `applyPenaltyOutcome(state, outcome)` answers it
  (shootout kick, early end and sudden death by `shootoutDecided`; a match penalty ends as an automatic one).
  Event `penaltyPending`. Without `penaltyInteractive` nothing changes (simulated matches, quickSim, `/lab`).
- Screen: `GameInterface/Penalty/PenaltyScreen.tsx` (aim, power, choice) drawing `PenaltyPitch.tsx` (7.8.2: crowd in both kits, grass in perspective, a net mesh that bulges, posts with depth, the keeper's face, sway and three-beat dive, the run-up, the ball's curve and ground shadow, rebound on a save or the post, shake and confetti on a goal, floodlights and phones at night; geometry pure in `penaltyScene.ts`), the animation from one requestAnimationFrame loop writing attributes, `PenaltyOverlay.tsx` (solo: the other side is the AI and
  the kick resolves in the browser; between two managers the server resolves it). Choice in the match preview and the
  match room (`PenaltyModeChips`, `localStorage` `fm.match.penaltyMode`).
- `/test`: toggle "Penalties 2D A" and scenario `shootout-2d`.

## 2D penalty in the new art (art phase 6, 8.1.10)

With the new visual and the painted backdrop on the server (`backdrops/penalty/penalty-bg-<day|night|rain|fog|snow>.webp`
of the art volume, announced by `/api/art/faces` as `penaltyBackdrops`), `PenaltyPitch` draws `PenaltyArtScene`: the
backdrop of the match weather (rain, snow, else night or day) and the art's articulated figures (`penaltyRig.ts`, port of
the art preview's `penalty-rig.js`: keeper front view with keyframed joints, ballistic dive, jump, getting up with the
ball; taker from behind with run-up, plant, strike, follow-through and reaction; panelled spinning ball; bulging net).
`rigPlan` turns the decided `KickOutcome` into the animation (dive side and height, the ball's target, saved / post /
miss); nothing about the outcome changes. Without the new visual or the backdrop, the drawn scene of 7.8.

## Pick countdown (8.1.20)

`PenaltyScreen` shows the time left to pick (`PickClock`: big seconds and a draining bar, red in the last 2 s) for the
taker (`KICK_WINDOW_S` 6 s) and the keeper (`DIVE_WINDOW_S` 4 s); out of time the taker's area is the AI's (`aiKick`),
the keeper stays in the middle. The deadline is fixed once per kick (a ref), so a parent re-render never restarts it.
Same screen solo and between two managers (the server's `H2H.PENALTY_CHOICE_S` 20 s only covers an absent side).

## xG do FM (etapa 6, `feat/engine-fm`)

Com `DECISION_FLAGS.FM_XG` (ligado) o `xg` de todo chute (estatística, nota de chutar, entrada do `resolveShot`) vem
da regressão logística do FM (`Domain/FmXg.ts`, `Domain/ShotXg.ts`), não do `computeXG` acima. A resolução ainda sorteia
sobre esse xG até a etapa 7 (chute pela trajetória). Ver `.claude/rules/game-engine/xg.md`.

## Stage 7: the shot by its trajectory (`SHOT_PHYSICS`)

With `DECISION_FLAGS.SHOT_PHYSICS` (on, needs `BALL_3D`) a shot has no dice on the xG: `goalChance` is gone and the
xG is only the statistic and the shooter's decision. The goal comes from the ball against the defenders and the keeper.
Config `Configs/ShotPhysicsConfig.ts` (`SHOT_PHYSICS`, `SHOT_PHYSICS_OVERRIDES`), pure model `Domain/ShotPhysics.ts`
(+ test), engine `physicalShot` / `tickPhysicalShot` in `gameState.ts`. Off = the old path, the same play as before.

- **Technique** (`chooseTechnique`): volley (ball at 0.22+ yd at the strike), lob over a keeper 8+ yd off his line from
  16–38 yd with him 6+ yd ahead, placed (side-foot) within 18 yd with chance 0.35 + 0.4 × finishing, else power. The
  header, the chip (holder move) and the direct free kick choose theirs. Speeds (m/s): power 24 + 6s, placed 17 + 4s,
  volley 22 + 6s, header 10 + 6s; lob, chip and free kick take theirs from the trajectory.
- **Aim** (`aimPoint`): the side with more room past the keeper's shadow (0.6 + 0.35 × skill), inside the post by
  0.4 + 0.4 × (1 − skill) m, low (0.3 m) or high (1.85 m) by technique (high: power 35%, placed 12%, volley 45%,
  header 25%, free kick 70%).
- **Launch**: straight to the aim (`directLaunch`), or a dip over the wall / the advanced keeper (`dipLaunch`: clears
  his hands by 0.4 yd and crosses the line at 1.8 yd). Then FM's launch error on the vector (`shotErrorFactor`,
  `applyShotError`): the stage-4 pass factor × 105/95 × the speed term (10.5 + 0.5·v) / (9.5 + 0.5·v_pass(d)); a free
  kick uses the set-piece base 85 and no pressure, a volley loses 10 points of margin, the long-shot weather scales it.
- **Flight**: the 3D ball on free physics (`stepFree`, `BallState.free`, phase `shot`), sub-stepped every 0.02 s. In
  each sub-step the keeper and the blockers move, the ball flies, then contacts are checked (outfield first, then the
  keeper's hands), then the goal line.
- **Blocks** (stage 5's physical interception): up to 3 outfield defenders that can reach the path (`planShotBlocks`,
  reaction 0.15 s, lunge 4.5 yd/s, reach 0.5 + 0.5 × tackling, up to 2.2 yd high). A ball within reach is touched:
  controlled (0.08 + 0.15 × first touch, less at speed), deflected on toward goal (25% of the rest, 70% of its speed,
  ±25°) or a rebound (loose ball `block`, 25–50% of the speed, ±70° around the way back). `shotBlocked` /
  `shotDeflected`.
- **Keeper**: reacts after 0.3 − 0.15 × reflexes s, then dives at 4 + 4 × diving yd/s toward the point of the path he
  can reach; leaves a ball predicted 0.4+ yd off the frame. Hands 0.9 + 0.5 × diving yd from his centre, up to 3 yd
  high. A ball within his hands: stop chance 0.9 + 0.2 × (handling − 0.5) − 0.5 × offset² − 0.02 × (speed − 18)⁺
  (`saveChances`, 0.05–0.98); stopped = hold, parry (corner) or spill in front by `saveOutcomeChances`; not stopped =
  the ball runs on, 75% of the speed, turned up to 12° (fingertips). Save grade: difficult at offset 0.65+ or 27+ m/s,
  good at 0.35+ or 22+ m/s (`keeperSave.grade`).
- **Line** (`lineCrossing`, `classifyCrossing`): goal; post or bar within 0.19 yd (rebounds at 45%, loose `woodwork`);
  wide or over (corner when a defender or the keeper touched it last, else a goal kick). A stopped ball or 4 s of flight
  is a loose ball; out over a touchline, a throw-in.
- Events: `shotLaunched` (technique, speed, vz, aim, error, distance, on target, blockers), `shotDeflected`,
  `shotWoodwork`; `shotResolved` has `danger` (the old `goalChance`, for the near-miss sound) and `outcome`.
- **2D**: the ball is drawn on its real path (`ballFlightPath.ts` predicts the free flight for the /test overlay); a
  save, a block or the woodwork happens where the ball meets the body.
- **Statistics** (team): `shotsOffTarget`, `shotsWoodwork`, `shotsDeflected`, `shotsSaved`, `saves` / `savesGood` /
  `savesDifficult` (the keeper's team), techniques (`shotPower`, `shotPlaced`, `shotLob`, `shotChip`, `shotVolley`,
  `shotHeaderLaunch`, `shotFreeKick`), launch speed. `/lab` `PairDetail` rows; `fm-targets.ts` section "The shot by its
  trajectory" (with the goal share by distance against FM).
- `/test`: scenarios `shot-blocked`, `shot-long-range`, `shot-lob` (`testPhysicalShot` strikes the shot at once).
- Tests: `Domain/ShotPhysics.test.ts`, `Domain/ShotPhysics.engine.test.ts`; the wall-dice free-kick test runs with the
  flag off (`SetPieces.engine.test.ts`).
- Not calibrated (stage 21). Numbers against FM: `fm-numbers.md` → "Etapa 7".

## Stage 9: which shots are taken

The decision to shoot (the gate of 30 m, × 0.75 / × 0.667, the clean-geometry value, the kick multiplier, the chip only
over a keeper 8+ yd off his line) is in `holder-choice.md` → "Stage 9"; the flight, blocks and keeper above are unchanged.

## Stage 21 calibration

Keeper (`ShotPhysicsConfig.ts`): reaction 0.3 → 0.2 s, dive 4 → 7 yd/s, hands 0.9 → 1.5 yd, stop 0.9 → 0.98, edge
0.5 → 0.3, speed 0.02 → 0.01; `BASE_SHOT` 105 → 98. Saved 46% → ~87% of the shots on target (FM 80%), on target 41%
(FM 35%). Shot value (`ShotGateConfig.ts`): `VALUE_POW` 0.5 → 1.5, `XG_REF` 0.25 → 0.28 (very sensitive), `KICK_MULT`
1/0.36 → 1.6: shots from beyond 25 m 63% → 19%, outside the box 34% (FM 46% R9, 27% R8). Shot volume stays ×1.5–1.9 FM's.
See `fm-numbers.md` → "Etapa 21" for the rounds and the final table.
