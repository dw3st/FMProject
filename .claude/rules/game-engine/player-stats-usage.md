# Player Stats Usage Map

How every roster attribute flows through the engine: what it becomes, where it is read, and what effect it actually has on gameplay.

---

## Part 1 — Roster Attributes → Engine Stats

`TeamLineup.ts` converts raw roster attributes (0–10 scale) into engine stats. The same player fielded in different roles gets different engine stats.

| Roster attribute | Engine stat(s) | Formula | Notes |
|---|---|---|---|
| `finishing` | `withBall.shootAccuracy` | `min(0.95, finishing / 10)` | GK always 0 |
| `speed` | `withBall.carrySpeed` | `2 + (speed/10) * 0.70` | ~2.1–9 yds/s; acceleration burst added in gameState when under pressure |
| `speed` | `withoutBall.pressSpeed` | `2 + (speed/10) * 0.70` | ~2.1–9 yds/s; acceleration burst added in gameState when pressing |
| `vision` | `withBall.carryVision` | `6 + vision * 1.2` | ~7–18 yds; GK always 0 |
| `speed` | `withBall.speed` | `speed / 10` | 0..1 |
| `acceleration` | `withBall.acceleration` | `acceleration / 10` | 0..1 |
| `passing` | `withBall.passingSkill` | `passing / 10` | 0..1 |
| `vision` | `withBall.vision` | `vision / 10` | 0..1 |
| `dribbling` | `withBall.firstTouch` | `dribbling / 10` | Proxies receiver control |
| `dribbling` | `withBall.dribbling` | `dribbling / 10` | 0..1 |
| `speed` | `withoutBall.speed` | `speed / 10` | 0..1 |
| `acceleration` | `withoutBall.acceleration` | `acceleration / 10` | 0..1 |
| `tackling` | `withoutBall.tackleChance` | `0.1 + tackling * 0.07` | Range ~0.17–0.80 |
| `pressing` + `vision` | `withoutBall.interceptionChance` | `0.05 + pressing*0.05 + vision*0.02` | Range ~0.17–0.75 |
| `pressing` | `withoutBall.gkPositioning` | `pressing / 10` | GK only; 0 for others |
| `reflex` | `withoutBall.gkReflex` | `reflex / 10` | GK only; 0 for others |
| `jump` | `withoutBall.gkDiving` | `jump / 10` | GK only; 0 for others |
| `strength` | `withBall.strength` | `strength / 10` | 0..1; defaults to 0.5 if missing |
| `strength` | `withoutBall.strength` | `strength / 10` | 0..1; defaults to 0.5 if missing |

**Not yet wired to any engine stat:** `stamina`, `heading`

---

## Part 2 — Engine Stats: Full Usage Map

---

### `withBall.shootAccuracy`

**Where:** `ActionOutcomes.ts → computeShooterEffect()`

```ts
SHOOTER_EFFECT_MIN + shootAccuracy * (SHOOTER_EFFECT_MAX - SHOOTER_EFFECT_MIN) / 0.95
// = 0.7 + shootAccuracy * 0.632
```

**Output:** Multiplier 0.7–1.3 applied to `goalChance = xG × shooterEffect × gkEffect`

**Range effect at 10/10 finishing:** `shooterEffect = 1.3` → 30% boost over xG
**Range effect at 0/10 finishing:** `shooterEffect = 0.7` → 30% drag below xG

**Influence level: HIGH** — directly shifts every goal chance by up to ±30%.

---

### `withBall.carrySpeed`

**Where:** `gameState.ts` — carry movement and dribble approach

```ts
// Carry movement per tick:
step = (carrySpeed + accelBurst) * recoveryMult * dt

// Dribble approach:
step = min(carrySpeed * recoveryMult * dt, distToDefender)
```

**accelBurst** = `acceleration * CARRY_ACCEL_SPEED_BOOST (1.0)` when under pressure
**recoveryMult** = `DUEL_RECOVERY_SPEED_FACTOR (0.35)` during post-tackle recovery

**Influence level: MEDIUM** — controls how far the ball moves per tick during carry, not whether the carry decision is made.

---

### `withBall.carryVision`

The most multi-purpose "with ball" stat. Appears in four separate systems.

**1. Carry lane clearance cone** (`CarryLaneEval.ts → getClearanceScore`)
Vision defines the lookahead distance for detecting defenders in the carry cone. Higher = can see threats further ahead.

**2. Vision bonus on carry score** (`CarryLaneEval.ts → getVisionBonus`)
```ts
visionNorm = min(1, carryVision / 18)
bonus = visionNorm * avg(progressScore, angleScore) * VISION_WEIGHT (0.14)
```
Flat bonus added to the carry lane score. Max contribution: +0.14.

**3. Crowd penalty reduction** (`CarryLaneEval.ts → evaluateCarryLane`)
```ts
crowdPenalty *= (1 - visionNorm * VISION_CROWD_REDUCTION (0.25))
```
High vision players are less penalised for carrying into crowded zones.

**4. Off-ball lane unlocking** (`OffBallMovement.ts → buildCandidateLanes`)

| visionNorm | Extra lanes unlocked |
|---|---|
| > 0.40 | ±15° angles |
| > 0.60 | ±45° angles |
| > 0.80 | ±60° and lateral (−90°) |

**5. Off-ball lookahead distance** (`gameState.ts`)
```ts
lookahead = BASE_LOOKAHEAD (8) + (MAX_LOOKAHEAD (16) - 8) * visionNorm
```

**Influence level: MEDIUM-HIGH** — affects carry decision quality, off-ball intelligence, and the range of runs players attempt.

---

### `withBall.speed` and `withBall.acceleration`

**`speed`:** Not directly used in any decision formula. Comment in code: *"speed and acceleration are execution qualities... they belong in the physics/movement layer, not here."*

**`acceleration`:** One use — pressure escape burst during carry:
```ts
accelBurst = acceleration * CARRY_ACCEL_SPEED_BOOST (1.0)  // when opponent is pressing
```

**Influence level: LOW** — both feed into `carrySpeed` at definition time but have no independent decision-level effect. `acceleration` adds a small speed burst under pressure.

---

### `withBall.passingSkill`

**Where:** `PassLanes.ts → scorePassToReceiver()`

```ts
rawModifier = passingSkill * PASSING_SKILL_WEIGHT (0.15)
            + vision       * VISION_WEIGHT (0.15)
            + receiver.firstTouch * RECEIVER_CONTROL_WEIGHT (0.10)

playerModifier = rawModifier * laneScore   // gated by lane clearance
```

`passingSkill` can contribute up to **+0.15** to a pass score — but only when the lane is clear. A fully blocked lane (laneScore=0) gets no benefit regardless of skill.

**Influence level: LOW-MEDIUM** — the 0.15 ceiling is modest and gated. On a perfectly clear lane to a good receiver, the full player modifier is ~+0.40 (all three stats at max). On a blocked lane, it's zero.

---

### `withBall.vision`

**Where:** `PassLanes.ts → scorePassToReceiver()` — same formula as `passingSkill`

Contributes up to **+0.15** to pass score, gated by lane clearance.

**Influence level: LOW-MEDIUM** — same ceiling and gating as `passingSkill`. Together they share the player modifier budget.

---

### `withBall.firstTouch`

**Where:** `PassLanes.ts → scorePassToReceiver()` — receiver side of the same formula

```ts
receiver.stats.withBall.firstTouch * RECEIVER_CONTROL_WEIGHT (0.10)
```

Contributes up to **+0.10** to the score of passes aimed at this player, gated by lane clearance.

**Note:** Derived from `dribbling`, same as `withBall.dribbling`.

**Influence level: LOW** — smallest weight in the pass modifier; no effect on blocked lanes.

---

### `withBall.dribbling`

**Where 1:** `ActionOutcomes.ts → resolveDribble()` — attacker side
```ts
attackerScore = dribbling
defenderScore = defender.tackleChance * 0.85
winProb = attackerScore / (attackerScore + defenderScore + 0.001)
```

At max (1.0) vs average defender (tackleChance ≈ 0.45): winProb ≈ 72%.
At min (0.1) vs same defender: winProb ≈ 20%.

**Where 2:** `ActionOutcomes.ts → resolveTackle()` — defender side
```ts
dribbleReduction = 1 - dribbling * 0.4
chance = (tackleChance + angleMod) * dribbleReduction
```

A 10/10 dribbler reduces tackle success by 40%.

**Influence level: HIGH** — directly controls 1v1 outcomes and makes the player significantly harder to dispossess.

---

### `withoutBall.pressSpeed`

**Where 1:** `gameState.ts` — GK shot sprint
```ts
step = min(pressSpeed * recoveryMult * dt, distToShotTarget)
```

**Where 2:** `gameState.ts` — all defensive movement
```ts
baseSpeed = pressSpeed
step = (baseSpeed + accelBurst) * recoveryMult * dt
```

Same formula as `carrySpeed`. Controls how fast any non-ball-holder moves.

**Influence level: MEDIUM** — governs raw defensive movement speed; high-speed defenders close ground faster when pressing.

---

### `withoutBall.pressRange`

**Where:** `DefensivePositioning.ts → effectivePressRange()` and press intent scoring

```ts
effectiveRange = pressRange + PRESS_RANGE_TACTIC_DELTA[pressingStyle]
// low_block: 8 - 4 = 4 yds
// mid_block: 8 + 0 = 8 yds
// high_press: 8 + 4 = 12 yds
```

Used as the gate for whether a player can score the `press_holder` intent high enough to trigger pressing.

**Note:** Currently all players have the same base value (8 yards). Differentiation comes only from tactics.

**Influence level: LOW** — flat value with no per-player variation. Tactic-driven, not stat-driven.

---

### `withoutBall.speed` and `withoutBall.acceleration`

**`speed`:** `ActionOutcomes.ts → playerInterceptionCorridor()`
```ts
corridor = BASE (3.0) + speed * 2.0 + acceleration * 2.0
// Max corridor = 7.0 yds (all at 1.0)
```

**`acceleration`:**
1. Same interception corridor formula (same contribution as `speed`)
2. `gameState.ts` — press burst:
```ts
accelBurst = acceleration * PRESS_ACCEL_SPEED_BOOST (1.0)  // when pressing
```

**Influence level: LOW-MEDIUM** — `speed` only affects interception corridor; `acceleration` also adds movement burst when pressing. The corridor range (3–7 yards) meaningfully changes who can intercept passes.

---

### `withoutBall.tackleChance`

**Where 1:** `ActionOutcomes.ts → resolveTackle()`
```ts
chance = (tackleChance + tackleAngleModifier) * (1 - dribbling * 0.4)
// tackleAngleModifier: front +0.30, side +0.10, behind -0.30
```

Range with angle bonus at front: `(0.17 + 0.30) = 0.47` to `(0.80 + 0.30) = 1.0 → clamped`

**Where 2:** `ActionOutcomes.ts → resolveDribble()` — defender side
```ts
defenderScore = tackleChance * 0.85
```

**Influence level: HIGH** — directly determines tackle success and dribble resistance. The spread (0.17–0.80) is large enough to meaningfully differentiate good and poor tacklers.

---

### `withoutBall.interceptionChance`

**Where:** `ActionOutcomes.ts → resolveInterception()`
```ts
baseChance = interceptionChance       // 0.17–0.75
distFactor = sqrt(max(0, 1 - perpDist / corridor))
chance = baseChance * distFactor
```

At perpDist=0 (on the line): `chance = interceptionChance` directly.
At perpDist=corridor: `chance = 0`.
Square-root falloff keeps meaningful probability near the corridor edge.

**Influence level: MEDIUM** — determines base interception rate. But a player must first be geometrically valid (on the pass line, within corridor) before this matters.

---

### `withoutBall.gkPositioning`, `gkReflex`, `gkDiving`

All three feed into `computeGKEffect()` in `ActionOutcomes.ts`:

```ts
posQuality = computeGKPositionQuality(gk, ballPos)   // 0..1 — arc position quality

gkSkill = gkPositioning * posQuality * 0.50
        + (gkReflex * closeWeight + gkDiving * farWeight) * 0.50

gkEffect = clamp(1 - gkSkill * 0.45, 0.55, 0.90)
```

| | Weight | Distance dominance |
|---|---|---|
| `gkPositioning` | 0.50 | All distances; multiplied by arc position quality |
| `gkReflex` | up to 0.50 | Close shots (< 20 yds) — `closeWeight = 1 - dist/20` |
| `gkDiving` | up to 0.50 | Far shots (> 20 yds) — `farWeight = 1 - closeWeight` |

**Max-stat perfectly positioned GK:** `gkEffect = 0.55` → reduces goalChance by 45%
**Zero-stat GK:** `gkEffect = 0.90` → reduces goalChance by 10%

**Influence level: HIGH** — largest single multiplier on shot outcomes after xG. A well-positioned elite GK halves shot conversion compared to a weak one.

---

### `withBall.strength` and `withoutBall.strength`

Both derive from the roster's `strength` attribute (`strength / 10`, default 0.5 if missing).

**`withBall.strength` (holder/carrier):**

1. `ActionOutcomes.ts → computeWeightedPressure()` — xG pressure calculation. Strength mismatch scales each defender's contribution: a 10-str defender on a 1-str shooter contributes ~99%; the reverse ~1%.

2. `ActionOutcomes.ts → resolveTackle()` — **pressing load mitigation**. When multiple defenders press nearby, `holderStrength` determines how much their crowd effect is suppressed.
   - `suppression = pressingLoad × (1 − holderStrength)`
   - `strength=1.0` → fully immune to crowd pressure on both dribbling and tackle bonus

**`withoutBall.strength` (tackler/defender):**

1. `ActionOutcomes.ts → resolveTackle()` — **angle modifier scaling**. A stronger tackler closes the gap between their approach angle and the front bonus (+0.30).
   - `strengthAdv = defStr − attStr` (clamped ±1)
   - `angleMod = rawAngle + strengthAdv × (0.30 − rawAngle) × 0.5`
   - At +1.0 advantage: side becomes +0.30, behind becomes −0.05

**Influence level: MEDIUM** — meaningful in contested physical duels. Strength determines how much a carrier can resist crowd pressure and how much a side/behind tackler is penalised by their approach angle.

---

## Part 3 — Dead Roster Attributes (not wired to any engine behaviour)

| Roster attribute | Status |
|---|---|
| `stamina` | Not used |
| `heading` | Not used |

These attributes exist on the roster but `TeamLineup.ts` never reads them.

---

## Part 4 — Stats with Shared Source (Collision Risk)

Two engine stats derive from `dribbling`:

| Engine stat | Effect |
|---|---|
| `withBall.dribbling` | 1v1 win rate + tackle resistance |
| `withBall.firstTouch` | Receiver pass value (+0.10 max) |

A player with high `dribbling` is simultaneously a great dribbler and a good receiver. There is no way to have one without the other.

`withBall.carryVision` now derives from `vision` — a smart carrier is now a player with good vision, not dribbling.

Similarly, `speed` and `acceleration` feed into both `carrySpeed` and `pressSpeed` identically — all players run at the same speed with and without the ball.

---

## Part 5 — Influence Summary

| Stat | Real influence on outcomes |
|---|---|
| `withBall.dribbling` | **HIGH** — 1v1 duels and tackle resistance |
| `withBall.shootAccuracy` | **HIGH** — ±30% on every goal chance |
| `withoutBall.tackleChance` | **HIGH** — large spread; directly determines tackle and dribble defense |
| `withoutBall.gkPositioning/Reflex/Diving` | **HIGH** — single largest modifier on shots after xG |
| `withBall.carryVision` | **MEDIUM-HIGH** — carry quality + off-ball intelligence |
| `withBall.carrySpeed` / `withoutBall.pressSpeed` | **MEDIUM** — raw movement speed, no decision effect |
| `withoutBall.interceptionChance` | **MEDIUM** — meaningful when geometrically valid |
| `withoutBall.speed` / `acceleration` | **LOW-MEDIUM** — interception corridor; acceleration burst |
| `withBall.passingSkill` | **LOW-MEDIUM** — small ceiling (0.15), gated by lane clearance |
| `withBall.vision` | **LOW-MEDIUM** — same as passingSkill |
| `withBall.firstTouch` | **LOW** — smallest weight (0.10), gated |
| `withBall.strength` / `withoutBall.strength` | **MEDIUM** — xG press weighting; tackle angle scaling; crowd pressure immunity |
| `withBall.speed` | **LOW** — no decision use; absorbed into carrySpeed |
| `withBall.acceleration` | **LOW** — only pressure escape burst |
| `withoutBall.pressRange` | **LOW** — flat value, tactic-driven not stat-driven |
