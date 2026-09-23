Understood. Below is a **complete, structured resume** of the Player Development system, ready for implementation.

No unnecessary complexity, all parts connected.

---

# Feature: Player Development System

## 1. Core Principles

* No hidden potential
* Growth is driven by:

  * Match performance (main)
  * Age
  * Role
* Attributes range: **0 → 10**
* Progression becomes harder at higher levels
* Players peak around **28**
* Decline starts after and becomes inevitable at **32+**

---

## 2. Data Model

```text
Player {
  age
  role

  attributes {
    shooting
    passing
    defending
    positioning
    physical
  }

  progress {
    shootingDP
    passingDP
    defendingDP
    positioningDP
    physicalDP
  }
}
```

---

## 3. DP Generation (Performance-Based)

After each match:

```text
earnedDP = baseDP * performanceMultiplier * minutesFactor
```

### Performance Multiplier (based on match rating)

* 8.5+ → 2.0
* 7.0+ → 1.0
* 6.0+ → 0.5
* <6.0 → 0

### Minutes Factor

* Full match → 1.0
* Partial → proportional
* No play → 0

---

## 4. Age System (Growth + Decline)

### Growth Multiplier

```text
16–18  → 1.8
19–21  → 1.5
22–25  → 1.2
26–27  → 0.8
28     → 0.4
29–31  → 0.1
32+    → 0.0
```

---

### Age Decay (per update)

```text
16–27  → 0
28     → low
29     → low+
30–31  → medium
32–34  → high
35+    → very high
```

---

### Final DP

```text
netDP = (earnedDP * ageGrowthMultiplier) - ageDecay
```

* Can be positive (growth) or negative (decline)

---

## 5. Role-Based Distribution

Each role defines how DP is split.

### Example

#### Striker (ST)

* Shooting → 45%
* Positioning → 25%
* Physical → 15%
* Passing → 10%
* Defending → 5%

#### Midfielder (CM)

* Passing → 35%
* Positioning → 25%
* Physical → 15%
* Defending → 15%
* Shooting → 10%

#### Defender (CB)

* Defending → 45%
* Positioning → 30%
* Physical → 15%
* Passing → 10%
* Shooting → 0–5%

---

## 6. Performance Modifier (Simple)

You chose: **based only on final match rating**

This affects total DP (not per attribute):

```text
totalDP = baseDP * performanceMultiplier
```

No per-action complexity.

---

## 7. Attribute Progression Scaling

Each attribute has increasing cost.

```text
dpRequired = baseCost * (1 + value^2 * scale)
```

### Effect

* 0 → 1 = easy
* 5 → 6 = medium
* 9 → 10 = very hard

---

## 8. High Attribute Slowdown (Soft Cap)

Reduce effectiveness at high values:

```text
effectiveDP = netDP * (1 - (value / 10)^2)
```

---

## 9. Progress System

Each attribute tracks its own DP:

```text
progressDP += effectiveDP
```

---

### Level Up

```text
if progressDP >= requiredDP:
  value += 1
  progressDP -= requiredDP
```

---

### Level Down (Decline)

```text
if progressDP < 0:
  value -= 1
  progressDP += requiredDP(previous level)
```

---

## 10. Full Update Flow

For each player after match/week:

1. Calculate `earnedDP` (performance + minutes)
2. Apply age growth multiplier
3. Subtract age decay → `netDP`
4. Apply high-attribute penalty
5. Split DP using role weights
6. Add DP to each attribute
7. Resolve level up/down per attribute

---

## 11. Lifecycle Result (Expected Behavior)

* Young players improve quickly
* Mid-age players improve slowly
* Peak at ~28
* 29–31 → must perform to maintain
* 32+ → decline inevitable
* High stats (8–10) are rare and hard to sustain

---

## 12. Constraints (Important)

* No random growth
* No hidden potential
* No per-action stat system (for now)
* Role defines identity
* Performance defines speed

---

## Final Summary

This system guarantees:

* Predictable progression
* Emergent player stories
* Controlled balance
* Low complexity

---
