# Tackle Logic — Business Rules

## Purpose

Tackle logic determines when a defending player attempts to dispossess the ball carrier, and whether that attempt succeeds.

A tackle is the primary mechanism for **transferring possession from the attacking team to the defending team** through direct physical challenge.

Tackles are controlled, infrequent, and consequential — not a constant pressure mechanic.

---

## When a Tackle is Triggered

A tackle attempt is only possible when:

* the defending player is within **tackle range** of the ball holder
* no global **tackle cooldown** is active

Tackle range is **fixed at 2 yards for all players**. Players are roughly the same physical size — tackle range does not vary by attribute.

---

## Tackle Priority

The tackle decision takes **priority over pressing**.

If a defender is within tackle range, they attempt a tackle rather than continuing to press.

This means a player transitions from pressing behavior to tackle behavior the moment they enter tackle range.

---

## Cooldown System

After any tackle attempt (success or failure), a **global cooldown** is applied.

No further tackle attempts can happen until the cooldown expires.

The cooldown applies across the entire defending team — it is not per-player.

This prevents constant tackle spam and gives the ball carrier breathing room after surviving a challenge.

The same cooldown is shared with the **interception system** — a recent interception attempt delays the next tackle window and vice versa.

---

## Tackle Selection

When multiple defenders are within tackle range simultaneously, only **one** attempts the tackle per cooldown window.

The closest defender to the ball holder gets the attempt.

Other defenders within tackle range hold their position and wait for the next opportunity.

---

## Tackle Outcome

The outcome of a tackle attempt is probabilistic.

Each player has a **tackle chance** (0..1) derived from their tackling attribute.

### Positional angle modifier

The tackle chance is modified by the tackler's approach angle relative to the holder's direction of travel:

* Tackler in front of the attacker → +0.30 bonus
* Tackler to the side → +0.10 bonus
* Tackler chasing from behind → −0.30 penalty

### Strength scaling (angle modifier)

A stronger defender closes the gap between their angle modifier and the front bonus (+0.30). Computed from `defender.strength − holder.strength` (both 0–1), clamped to ±1.

At maximum strength advantage (+1.0):

* Side → +0.30 (debuff fully negated)
* Behind → −0.05 (barely a penalty)

At maximum disadvantage (−1.0):

* Side → −0.10 (backfires against a stronger carrier)
* Behind → −0.55 (desperate lunge against a powerful carrier)

Front is unaffected — position already gives full advantage.

### Pressing load (crowd pressure)

When additional defenders are pressing the holder nearby (within 6 yards, not the tackler), the holder is under crowd pressure. This has **two independent effects**, both mitigated by the holder's strength:

**Effect 1 — dribbling suppression:**
Crowd presence reduces the holder's effective dribbling resistance. A distracted carrier can't execute a clean 1v1.

```
suppression        = pressingLoad × (1 − holderStrength)
effectiveDribbling = dribbling × (1 − suppression)
dribbleReduction   = 1 − effectiveDribbling × 0.4
```

**Effect 2 — tackle bonus:**
Crowd pressure directly improves the tackling attempt. Maximum bonus: +0.20 at `pressingLoad=1, holderStrength=0`.

```
pressBonus = suppression × 0.20
```

**Combined formula:**

```
chance = clamp((base + angleMod + pressBonus) × dribbleReduction, 0, 1)
```

**Reference table (max-dribble holder, base tackleChance = 0.5, front tackle):**

| Scenario | pressingLoad | holderStrength | effectiveDribbling | dribbleReduction | pressBonus | chance |
|---|---|---|---|---|---|---|
| Solo, weak carrier | 0 | 0.0 | 1.0 | 0.60 | 0 | 0.48 |
| Solo, strong carrier | 0 | 1.0 | 1.0 | 0.60 | 0 | 0.48 |
| Crowd (load=1), weak carrier | 1 | 0.0 | 0.0 | 1.00 | +0.20 | 0.70 |
| Crowd (load=1), strong carrier | 1 | 1.0 | 1.0 | 0.60 | 0 | 0.48 |
| Crowd (load=0.6), avg carrier | 1 | 0.5 | 0.7 | 0.72 | +0.06 | 0.40 |

A 10-strength carrier is immune to crowd pressure. A 0-strength carrier under two pressers loses all dribbling protection and the tackler gains a direct bonus.

---

## On Tackle Success

When a tackle succeeds:

* possession transfers immediately to the tackler
* the ball holder loses the ball
* the defending team becomes the attacking team
* **both the tackler and the dispossessed player enter a recovery phase** — they move at reduced speed for a short period

Recovery durations:

* Tackler (winner): `0.3 seconds` at `35% speed` — regaining composure after the challenge
* Holder (loser): `1.5 seconds` at `35% speed` — stumbling after being dispossessed

---

## On Tackle Failure

When a tackle fails:

* the ball holder retains possession
* the tackle cooldown is still applied — the tackler cannot retry immediately
* **the failed tackler enters a recovery phase** — they were off balance from the missed lunge

Recovery:

* Tackler (failed): `1.0 seconds` at `35% speed`

A failed tackle still costs the defending team time and space.

---

## Goalkeeper Tackling

Goalkeepers **never press** and are excluded from the coordinated press system.

However, if a goalkeeper is within tackle range of the ball holder, they **can still attempt a tackle**.

In practice this rarely occurs given the goalkeeper's positioning, but the rule applies consistently.

---

## Relationship to Other Systems

**Pressing:** Pressing moves a defender toward the holder. Tackling is the result of successfully closing distance — it triggers when the presser enters tackle range.

**Interception:** Interceptions use the same cooldown as tackles. Both are physical challenge mechanics. An interception attempt during a pass in flight delays the next tackle window.

**Carry / Dribble:** The carrier's `dribbling` stat reduces the effective tackle chance. A fully skilled dribbler reduces tackle success by 40% — but this protection is suppressed by crowd pressure (see Pressing load above).

**Strength:** Both tackler and holder strength affect the outcome — tackler strength closes the angle debuff gap; holder strength mitigates crowd pressure suppression.

---

## Design Principles

### Tackles should be rare and impactful

The cooldown system ensures tackles are spaced out and feel meaningful rather than constant.

### Only the closest defender gets the attempt

This prevents multiple defenders from simultaneously winning the ball and creates natural 1v1 situations.

### Outcome is attribute-driven but stochastic

A better tackler wins more often, but never guaranteed. Positional angle also matters.

### Fixed tackle range

All players have the same tackle range (2 yards). This reflects physical reality — everyone has roughly the same reach. Only the probability of success scales with the tackling attribute.

### Recovery phase enforces consequence

Both participants are briefly slowed after a tackle. This makes tackles feel physically impactful and prevents the winner from immediately sprinting away.

---

# Tackle Implementation Guide

## Constants (`ActionOutcomes.ts`)

```ts
export const TACKLE_RANGE    = 2.0;  // yards — fixed for all players
export const TACKLE_COOLDOWN = 1.2;  // seconds — global cooldown shared with interception

export const DUEL_TACKLE_WIN_RECOVERY    = 0.3;   // seconds — tackler regains composure
export const DUEL_TACKLE_LOSS_RECOVERY   = 1.5;   // seconds — dispossessed player stumbles
export const DUEL_TACKLE_FAILED_RECOVERY = 1.0;   // seconds — missed lunge, off balance
export const DUEL_RECOVERY_SPEED_FACTOR  = 0.35;  // movement multiplier during recovery
```

## Stat (`TeamLineup.ts`)

```ts
tackleChance: 0.1 + raw.tackling * 0.07  // ~0.17–0.80
```

Only `tackleChance` is derived from attributes. There is no per-player `tackleRange`.

## Player field (`types.ts`)

```ts
recoveryTime: number  // seconds remaining on post-tackle speed debuff
```

Drained each tick: `recoveryTime = Math.max(0, recoveryTime - dt)`

Speed during recovery: `speed * TACKLE_RECOVERY_SPEED_FACTOR`

## Decision (`DecisionTree.ts`)

```ts
import { TACKLE_RANGE } from '@/GameEngine/ActionOutcomes';

if (dist <= TACKLE_RANGE) {
  return { type: 'tackle', targetId: ballHolder.id };
}
```

## Outcome (`ActionOutcomes.ts`)

`pressingLoad` is computed in `gameState.ts` before the call: sum of linear distance falloffs from pressing defenders (not the tackler) within 6 yards, capped at 1.

```ts
export function resolveTackle(tackler: GamePlayer, holder: GamePlayer, pressingLoad = 0): TackleResult {
  const base     = tackler.runtimeStats.withoutBall.tackleChance;
  const rawAngle = tackleAngleModifier(tackler, holder);

  // Strength-adjusted angle modifier
  const defStr      = tackler.runtimeStats.withoutBall.strength ?? 0.5;
  const attStr      = holder.runtimeStats.withBall.strength     ?? 0.5;
  const strengthAdv = clamp(defStr - attStr, -1, 1);
  const gap         = 0.30 - rawAngle;                    // gap to front bonus
  const angleMod    = rawAngle + strengthAdv * gap * 0.5;

  // Crowd pressure — suppresses dribbling and adds a direct tackle bonus
  const holderStrength     = holder.runtimeStats.withBall.strength ?? 0.5;
  const suppression        = pressingLoad * (1 - holderStrength);
  const effectiveDribbling = holder.runtimeStats.withBall.dribbling * (1 - suppression);
  const dribbleReduction   = 1 - effectiveDribbling * 0.4;
  const pressBonus         = suppression * 0.20;

  const chance  = clamp((base + angleMod + pressBonus) * dribbleReduction, 0, 1);
  const success = Math.random() < chance;
  return { success, chance };
}
```

## Known Gaps

| Gap | Description | Priority |
|---|---|---|
| Foul system | No foul risk on tackle attempts (tackles from behind should risk a foul) | Future |
