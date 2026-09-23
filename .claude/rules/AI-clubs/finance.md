Correct approach. Do **not** simulate full finances for AI clubs — it adds complexity without gameplay value.

You want **controlled, believable behavior**, not realism.

---

# Feature: AI Club Finances (Simplified)

## 1. Business Rules (plain text)

### Core Principle

AI clubs do NOT simulate full finances like the player.

Instead:

* They operate on a **budget tier system**
* Their behavior is **rule-based**, not calculated from revenue

---

### Club Financial Tier

Each club has a predefined level:

* `LOW`
* `MEDIUM`
* `HIGH`
* `ELITE`

This defines:

* Wage limits
* Transfer capacity
* Stability

---

### Budget Model

Instead of balance + revenue:

Each club has:

* `weeklyBudget`
* `maxWageBudget`

Rules:

* These are **derived from tier + popularity**
* Not from actual earnings

---

### Wage Control

AI ensures:

* `wageBill <= maxWageBudget`

If exceeded:

* Stops hiring
* May release weak players (optional later)

---

### Growth / Decline

Budgets change based on performance:

* Good season → tier increases (or budget boost)
* Bad season → slight decrease

---

### No Bankruptcy Simulation

AI clubs:

* Never go bankrupt
* Never get stuck

Instead:

* They **self-correct automatically**

---

## 2. Budget Calculation

### Weekly Budget

```id="ai-weekly-budget"
weeklyBudget = baseByTier * (1 + popularity / 100)
```

---

### Wage Budget

```id="ai-wage-budget"
maxWageBudget = weeklyBudget * wageRatio
```

Recommended:

* `wageRatio ≈ 0.6 – 0.8`

---

## 3. AI Decision Rules

### Transfers / Hiring

AI logic:

* If `wageBill < maxWageBudget`
  → can hire

* If near limit
  → only cheap players

* If exceeded
  → no hiring

---

### Ticket Price (simplified)

Do NOT simulate:

* AI uses fixed price per tier

Example:

* LOW → cheap
* ELITE → expensive

---

### Followers / Popularity

* Update same as player (based on results)
* This keeps consistency in league

But:

* Do NOT connect it to real money for AI

---

## 4. Optional Soft Balancing

To keep league healthy:

### Hidden Boost

* Weak clubs:

  * Slight budget boost

* Strong clubs:

  * Slight limitation

This prevents:

* One team dominating forever

---

## 5. Data Model

```id="ai-club"
AIClub {
  tier                // LOW, MEDIUM, HIGH, ELITE

  popularity

  weeklyBudget
  maxWageBudget

  wageBill
}
```

---

## 6. Practical Notes

* AI must feel:

  * stable
  * competitive
  * predictable

* Player must feel:

  * “I outmanaged them”
  * not “AI cheated”

---

## 7. Key Simplification Decisions

Do NOT simulate for AI:

* Ticket revenue
* Merchandise
* Expenses breakdown
* Balance tracking

Only simulate:

* Budget limits
* Wage control
* Performance → popularity

---

## Final Recommendation

Use:

* **Player → full financial system**
* **AI → budget + rules only**

This gives:

* control
* balance
* low complexity

---

Next step (important):

→ Define **promotion/relegation financial impact**
This is where your system will really start to feel alive.
