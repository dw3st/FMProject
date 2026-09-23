Good. That’s the right simplification.

Drop categories and use **relative strength vs team average**. It’s cleaner and already enough to drive behavior.

---

# Feature: Transfer System (Simplified AI)

## 1. Core Principle

AI decides based on:

* Offer value
* Player strength relative to team
* Club financial pressure
* Squad safety (hard rule)

No roles, no categories.

---

## 2. Player Importance (Relative Strength)

Instead of labels, compute:

```text
relativeStrength = playerRating - teamAverageRating
```

---

### Interpretation

* **+ high** → important player → hard to sell
* **~ 0** → normal player
* **- low** → replaceable → easy to sell

---

### Example

* Team avg = 6.5
* Player = 8.0 → +1.5 → very important
* Player = 6.4 → ~0 → neutral
* Player = 5.5 → -1.0 → expendable

---

## 3. Offer Evaluation

```text
offerScore = offer / expectedValue
```

* < 0.8 → bad
* ~1.0 → fair
* > 1.2 → strong

---

## 4. Financial Pressure

From your AI system:

* Low money → higher willingness to sell
* Good finances → more resistance

Keep it simple:

```text
financialPressure = 0 → 1
```

---

## 5. Decision Formula

```text
decisionScore =
  (offerScore * 0.6)
+ (financialPressure * 0.3)
- (relativeStrength * 0.5)
```

---

### Behavior

* Strong player → negative pressure (harder to sell)
* Weak player → easier to sell
* Good offer → pushes toward acceptance

---

## 6. Hard Rules (Must Have)

### Squad Minimum

```text
if totalPlayers <= minimum:
  reject
```

---

### Position Safety

```text
if playersInPosition <= minimumRequired:
  reject
```

---

## 7. Final Decision

Simple thresholds:

* score > 0.8 → Accept
* score > 0.5 → (optional later: consider)
* else → Reject

Start with just:

→ Accept / Reject

---

## 8. Player Feedback (UI)

Keep it simple and readable.

### Accept

* “Offer was very strong”
* “Club accepted due to financial situation”

### Reject

* “Player is important to the team”
* “Offer is too low”
* “Squad depth is insufficient”

---

## 9. Practical Examples

### Case 1

* Player below average
* Offer = 110%

→ Accept

---

### Case 2

* Player above average (+1.5)
* Offer = 100%

→ Reject

---

### Case 3

* Player slightly above avg
* Offer = 140%

→ Accept

---

### Case 4

* Last player in position

→ Reject (always)

---

## 10. Final Recommendation

Lock this version:

* Relative strength instead of roles
* Simple formula
* Hard squad rules

This gives:

* Clean behavior
* Easy balancing
* No hidden complexity

---
