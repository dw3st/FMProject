# Dribbling System (1v1 — Time Advantage Model)

## 1. Business Rules (Behavior)

### 1.1 What Dribbling Does

* Dribbling does **NOT move the player artificially**
* It creates a **time advantage**

> The winner keeps moving
> The loser is delayed (recovery time)

---

### 1.2 Core Principle

> Dribble outcome = who keeps control of time

* Winner → continues normal movement
* Loser → temporarily unable to act

---

### 1.3 Attempt Decision

* Based on:

  * role
  * position
  * 1v1 + forward blocked

* **Dribbling stat does NOT affect attempts**

---

### 1.4 Resolution Rule

```ts
attacker.dribbling vs defender.tackleChance × 0.85
```

* attacker has slight initiative advantage (the 0.85 discount on defender)

---

### 1.5 Outcomes

| Result        | Attacker recovery | Defender recovery | Possession |
| ------------- | ----------------- | ----------------- | ---------- |
| Attacker wins | `DUEL_DRIBBLE_WIN_RECOVERY` (0.4 s) | `DUEL_DRIBBLE_LOSS_RECOVERY` (1.0 s) | Stays with attacker |
| Defender wins | `DUEL_DRIBBLE_LOSS_RECOVERY` (1.0 s) | — | Transfers to defender |

Both participants enter recovery. The winner moves at reduced speed briefly; the loser is fully disabled (no decisions, no tackling, not counted as a pressing threat).

---

## 2. Minimal Implementation Guide

---

### 2.1 Dribble Resolution

```ts
const attackerScore = attacker.runtimeStats.withBall.dribbling;       // 0..1
const defenderScore = defender.runtimeStats.withoutBall.tackleChance * 0.85;

const winProb = attackerScore / (attackerScore + defenderScore + 0.001); // guard div/0
```

---

### 2.2 Resolve

```ts id="7s2k1x"
if (Math.random() < winProb) {
  attackerWins(attacker, defender);
} else {
  defenderWins(attacker, defender);
}
```

---

### 2.3 Outcome Handling

#### Attacker Wins

```ts
attacker.recoveryTime = DUEL_DRIBBLE_WIN_RECOVERY;  // 0.4 s — brief composure pause
defender.recoveryTime = DUEL_DRIBBLE_LOSS_RECOVERY; // 1.0 s — beaten, stumbling
```

* attacker continues forward at reduced speed, then resumes normally
* defender is disabled: no decisions, no tackling, excluded from pressing load calculations

---

#### Defender Wins

```ts
attacker.recoveryTime = DUEL_DRIBBLE_LOSS_RECOVERY; // 1.0 s — dispossessed, stumbling
// possession transfers to defender
```

---

## 3. Recovery Time (Core Mechanic)

### 3.1 Definition

* During `recoveryTime`:

  * player cannot make defensive decisions (returns `idle` immediately)
  * player cannot tackle or be selected as a tackle candidate
  * player is excluded from pressing load calculations (not counted as a threat to the ball carrier)
  * player moves at `DUEL_RECOVERY_SPEED_FACTOR` (35%) of normal speed

---

### 3.2 Constants

```ts
DUEL_DRIBBLE_WIN_RECOVERY  = 0.4  // seconds — winner recovers composure
DUEL_DRIBBLE_LOSS_RECOVERY = 1.0  // seconds — loser stumbles
DUEL_RECOVERY_SPEED_FACTOR = 0.35 // movement multiplier while in recovery
```

---

### 3.3 Why This Works

* No artificial jumps
* Uses your existing movement system
* Creates natural separation between players

---

## 4. Integration with Movement

Your current loop likely has:

```ts
if (player.recoveryTime > 0)
  player.recoveryTime -= deltaTime
```

And:

```ts
if (player.recoveryTime > 0)
  skip movement/decisions
```

That is enough.

---

## 5. Tackle System Integration

The dribbling stat reduces the defender's effective tackle chance during a normal tackle attempt (not a 1v1 dribble duel):

```ts
dribbleReduction   = 1 - holder.dribbling * 0.4
// Full dribbling (1.0) → 40% reduction; zero dribbling → no reduction
```

This reduction is further suppressed by crowd pressure when multiple defenders are pressing nearby. See `tackle.md → Pressing load` for the full formula.

```ts
suppression        = pressingLoad × (1 − holderStrength)
effectiveDribbling = dribbling × (1 − suppression)
dribbleReduction   = 1 − effectiveDribbling × 0.4
```

A 10-strength carrier is immune to crowd pressure suppression and retains full dribbling protection.

---

## 6. What Changes From Before

❌ Remove:

```ts
attacker.x += FORWARD_STEP
```

✅ Replace with:

```ts
loser.recoveryTime = DUEL_RECOVERY_TIME
```

---

## 7. Expected Behavior

* Winning a dribble:

  * creates space naturally
  * attacker “runs past” because defender is frozen

* Losing a dribble:

  * feels like being dispossessed

---

## 8. Future Extensions (Do NOT implement now)

* recoveryTime based on balance (stumble severity varies by contact angle)
* different duel intensities (light touch vs full-body challenge)
* partial wins (smaller delays for narrow victories)

---

## Bottom Line

* Dribble = **1v1 resolution**
* Result = **time advantage**
* No forced movement
* Clean, stable, and easy to tune

---

This aligns very well with your engine — minimal change, high impact.
