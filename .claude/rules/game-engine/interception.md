# Interception Logic — Business Rules

## Purpose

Interception logic determines when a defending player can steal a pass that is currently in flight between two opponents, and whether that attempt succeeds.

Interceptions are the primary mechanism for **winning possession during a pass**, distinct from tackles which only apply when the ball is held.

---

## When an Interception Can Occur

An interception is only possible while a pass is **in flight** (not when the ball is held).

An interception attempt requires:

* the defender is geometrically **between the ball and the pass receiver** (on the pass line)
* the defender is within their **personal interception corridor** of the passing lane
* no global **tackle cooldown** is active (shared with the tackle system)

---

## Interception Corridor

The interception corridor is the perpendicular distance (yards) a defender can cover to reach a passing lane.

Unlike tackle range (fixed at 2 yards for everyone), the corridor **varies per player** based on their physical attributes. Faster, more explosive players cover more ground to reach a passing lane.

### Formula

```
corridor = BASE (3.0 yds)         // BASE_INTERCEPTION_CORRIDOR
         + speed × 2.0            // SPEED_CORRIDOR_FACTOR
         + acceleration × 2.0     // ACCEL_CORRIDOR_FACTOR
```

| Player type | speed | accel | corridor |
|---|---|---|---|
| Slow    | 0.2 | 0.2 | 3.8 yds |
| Average | 0.5 | 0.5 | 5.0 yds |
| Fast    | 1.0 | 1.0 | 7.0 yds |

The corridor represents the maximum perpendicular distance from the pass line at which a player can realistically intercept.

---

## Geometric Validity

A defender must be geometrically positioned between the ball and the receiver.

The check uses the projection of the defender onto the pass line segment:

* the projection parameter `t` must be between `0.05` and `0.95` — the defender must be ahead of the ball and not past the receiver
* the perpendicular distance from the defender to the pass line must be within their corridor

If the defender is behind the ball, past the receiver, or outside their corridor, no interception is possible.

---

## Interception Chance

The probability of success uses a **square-root falloff** with distance:

```
distFactor = sqrt(max(0, 1 - perpDist / corridor))
chance     = baseInterceptionChance × distFactor
```

* perpDist = 0 → `distFactor = 1.0` → full `baseInterceptionChance`
* perpDist = corridor → `distFactor = 0` → 0%
* Square-root curve: defenders near the corridor edge still get a meaningful chance (gentler falloff than linear)

**Example** (average player, `baseChance = 0.40`, corridor = 5.0 yds, perpDist = 3.0 yds):
```
distFactor = sqrt(1 - 3.0/5.0) = sqrt(0.4) ≈ 0.63
chance     = 0.40 × 0.63 ≈ 25%
```

---

## Base Interception Chance

The `baseInterceptionChance` stat is derived from pressing awareness and vision:

```
baseInterceptionChance = 0.05 + pressing × 0.05 + vision × 0.02
```

Range approximately `0.17–0.75`. This represents the player's anticipation and reading of the game — how well they recognise the pass and get their body in the right position.

---

## Cooldown System

After any interception attempt (success or failure), the **global tackle cooldown** is applied.

This cooldown is shared with the tackle system — a recent tackle delays the next interception window and vice versa.

This prevents constant interception spam and makes each attempt consequential.

---

## Interception Selection

Only **one** defender can attempt an interception per cooldown window.

The first valid candidate found (closest to the ball) gets the attempt. Other defenders in valid positions wait for the next cooldown window.

---

## On Interception Success

When an interception succeeds:

* the defender gains possession immediately
* the pass is cancelled
* the defending team becomes the attacking team

---

## On Interception Failure

When an interception fails:

* the pass continues in flight
* the cooldown is applied — no further attempts until it expires
* the intended receiver will still collect the ball if no further interceptions occur

---

## Relationship to Other Systems

**Tackle:** Shares the global cooldown. A tackle attempt blocks interception attempts for its duration, and vice versa.

**Defensive Positioning / Lane Gravity:** Lane gravity nudges defenders toward passing lanes, increasing their likelihood of being in a valid interception position when a pass occurs.

**Pressing:** Pressing decisions position defenders near the ball holder and in passing corridors — good pressing directly enables interception opportunities.

---

## Design Principles

### Position beats attributes

A slow player right on the passing lane has a better interception chance than a fast player at the edge of their corridor. Physical attributes expand reach; positioning determines base chance.

### Physical attributes expand reach, not guarantee success

Speed and acceleration widen the corridor — how far a defender can stretch to reach a lane — but the base interception chance (positioning) still determines whether the attempt succeeds. A fast defender at the edge of their corridor is worse off than a slow defender right on the lane.

### Shared cooldown preserves game flow

By sharing the cooldown with tackles, the system prevents both systems from firing in rapid succession and crowding the play.

---

# Interception Implementation Guide

## Constants (`ActionOutcomes.ts`)

```ts
export const BASE_INTERCEPTION_CORRIDOR = 3.0;   // flat floor — even the slowest player can reach
export const SPEED_CORRIDOR_FACTOR      = 2.0;   // yards added per unit of speed
export const ACCEL_CORRIDOR_FACTOR      = 2.0;   // yards added per unit of acceleration
export const MAX_INTERCEPTION_CORRIDOR  = 7.0;   // BASE + SPEED + ACCEL (all stats = 1.0)
```

## Per-player corridor (`ActionOutcomes.ts`)

```ts
export function playerInterceptionCorridor(player: GamePlayer): number {
  const { speed, acceleration } = player.runtimeStats.withoutBall;
  return BASE_INTERCEPTION_CORRIDOR
       + speed        * SPEED_CORRIDOR_FACTOR
       + acceleration * ACCEL_CORRIDOR_FACTOR;
}
```

## Geometric validity (`PositionalAwareness.ts`)

```ts
export function getInterceptionPerpDist(
  defender: Pos, ballPos: Pos, receiver: Pos, corridor: number,
): number | null
```

Returns the perpendicular distance if valid, `null` if the defender is out of position.

## Outcome (`ActionOutcomes.ts`)

```ts
export function resolveInterception(
  interceptor: GamePlayer, perpDist: number, corridor: number,
): InterceptionResult {
  const baseChance = interceptor.stats.withoutBall.interceptionChance;
  const distFactor = Math.sqrt(Math.max(0, 1 - perpDist / corridor));  // square-root falloff
  const chance     = baseChance * distFactor;
  const success    = Math.random() < chance;
  return { success, chance };
}
```

## Stat (`TeamLineup.ts`)

```ts
interceptionChance: 0.05 + raw.pressing * 0.05 + raw.vision * 0.02  // ~0.17–0.75
```

## Execution flow (`gameState.ts`)

```ts
if (s.tackleCooldown === 0) {
  for (const player of defenders) {
    // 1. Pre-filter: skip players obviously too far from the ball
    if (distToBall > MAX_INTERCEPTION_CORRIDOR) continue;

    // 2. Compute per-player corridor
    const corridor = playerInterceptionCorridor(player);

    // 3. Check geometric validity — returns perpDist or null
    const perpDist = getInterceptionPerpDist(player, ballPos, receiver, corridor);
    if (perpDist === null) continue;

    // 4. Roll the attempt
    s = { ...s, tackleCooldown: TACKLE_COOLDOWN };
    const { success } = resolveInterception(player, perpDist, corridor);
    if (success) { /* award possession */ }
    break; // one attempt per cooldown window
  }
}
```

## Debug visualisation

In `/test` debug mode, each defending player's interception corridor is rendered as a **cyan ring** around them. The ring radius scales with the player's speed and acceleration, making it immediately visible which players have the widest reach.

---

# Stage 5: physical interception (engine rebuild)

With `PHYSICAL_INTERCEPTION` (`DecisionConfig.ts`, on; needs `PASS_PHYSICS` and `BALL_3D`) a physical ground pass or
through ball (`pass-physics.md`) has **no interception dice**: the corridor + `resolveInterception` above only runs for
non-physical passes (flags off). Constants in `Configs/InterceptConfig.ts` (`INTERCEPT`, env `INTERCEPT_OVERRIDES`),
design values of the model, not fitted to a match volume. With the flag off a match plays exactly as before (same seeds,
same counts).

## Rules

- **Reaching the path** (`Domain/PhysicalInterception.ts` → `interceptPoint`): every tick of the flight the ball's path
  is predicted by free physics (`predictPath`, 3 s, every 0.1 s, cut at the pitch edge or when it stops). A defender
  reaches a point when `reaction + max(0, distance − reach) / sprint ≤ ball time`, with the ball at a height he can
  play (`reachHeight`). Reaction 0.25 s (÷ the anticipation multiplier), 0 once he is running; sprint = the
  `chase_loose_ball` speed; reach = 1.3 yd + 0.6 yd × tackling. Points after the time the receiver (or the runner of a
  through ball) gets there are ignored.
- **Running** (`planInterceptRuns`, the decision loop): the earliest `MAX_RUNNERS` (2) defenders run to their point
  (`chase_loose_ball` with `intercept`, pinned while the pass flies, never counted as race losers); a keeper only inside
  his box. `GameState.interceptRuns` carries them for `/test`.
- **Touch** (`advancePassBall`): every defender not beaten and not in recovery is a catcher at his reach; the first the
  ball passes within reach of (and under his reach height) touches it (`resolveInterceptTouch`). What the touch does is
  one draw over `touchChances`: control = (0.45 + 0.45 × first touch, keeper's hands in his box 0.92) × (1 − 0.6 ×
  offset) × speed factor (1 up to 10 m/s, −1/25 per m/s, floor 0.4) × 0.7 above the knee; offset = the ball's closest
  approach to his body on its line / his reach. Of the rest, `0.6 × offset` runs past him (he can't touch it again:
  `PassState.beaten`), the remainder is a **clearance** within 35 yd of his own goal (offset ≤ 0.6: `clearanceBall`,
  16–28 yd) or a **deflection** (`runLoose` cause `deflection`, 40% of the ball speed, turned up to 70°).
- Control = possession to him at the ball; a clearance, a deflection and a control all count as an interception
  (`interception` success, the player's `interceptions`); a miss is `interception` with success false.
- Events: `interceptionTouch { player, team, passerId, kind, outcome, speedMs, zM, offset, control, flight }`; debug
  category `interception`.

## Surfaces

- `Statistics.ts` team counters (defending team): `cutTouches`, `cutControls`, `cutClears`, `cutDeflects`,
  `cutMisses`, `cutSpeedSum` → `/lab` `TeamRawStats` → `avgCut*`, `cutSpeedMps` → `PairDetail`.
- `fmTargets.ts`: `lossEarly` / `lossLate` (R7's split of the passes whose next holder is an opponent, by the time from
  the kick against FM's expected flight + one tick); `fm-targets.ts` section "Interception": the split, the touches by
  outcome and the interceptions per match and per live minute.
- `/test`: scenarios `pass-intercepted` and `pass-intercept-clear`; overlay **Intercept** shows each defender's reach and
  the runs to the path (green: spare time, amber: just in time) with the flag on, the old corridors with it off.

## Measured (`fm-targets.ts 12 premier_league --chunks 1`, seed 9000, 90 physical minutes)

Before = flag off (identical to the branch before the stage). Full table in `fm-numbers.md` → "Etapa 5".

| Per match, both teams | Before | After | FM |
|---|---|---|---|
| Interceptions (control + clear + deflect) | 29.3 | 129.8 (control + clear 72) | 59 |
| … per live minute | 0.31 | 1.37 | ~0.76 |
| Touches on a pass in flight: control / clear / deflect / ran past | — | 38 / 9.5 / 38 / 15% (152) | — |
| Losses after a pass: in flight / later | 56 / 44% | 70 / 30% | 56 / 44% |
| Regular passes to the receiver 0–5 / 5–9 / 9–13 / 13–18 / 18–22 / 22–27 m | 97 / 97 / 98 / 96 / 94 / 97% | 94 / 92 / 90 / 90 / 87 / 80% | (all kinds) 94 / 92 / 90 / 85 / 87 / 79% |
| All passes to the receiver (opponent) | 81.0% (13.7%) | 76.3% (17.4%) | 82% (13.5%) |
| Goals / shots | 8.0 / 33.2 | 6.8 / 27.4 | 1.5 / 21.5 |

Nothing tuned for volume.

## Limitations

- Interceptions per match are ~2× FM's: the defending shape (stage 15) and the holder's choice (stage 8) still leave
  more passes through defenders; calibration is stage 21.
- Through balls reach the runner 40% of the time (57% before).
- High balls (cross, long ball, clearance) are still contested only where they land (contact in the air is stage 10).
- A tackle on reception is unchanged; the late losses are fewer than FM's (30% against 44%).

## Stage 21 calibration

`INTERCEPT.REACH_BODY_YD` 1.3 → 0.7 and `REACTION_S` 0.25 → 0.45: interceptions 115 → ~93 a match (FM 59; the rest is
the ball crowding, `fm-numbers.md` → "Etapa 21"). The physical-interception tests keep the stage-5 values (their
scenarios were drawn with them).
