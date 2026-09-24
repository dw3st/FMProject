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

---

# Implementation (what was actually built)

## Files

| File | Role |
|---|---|
| `src/Domain/aiFinance/aiFinanceConfig.ts` | **All constants** (tier thresholds, base budgets, wage ratio, soft balancing, season reaction) |
| `src/Domain/aiFinance/aiClubFinance.ts` | Pure: tier derivation, popularity, `weeklyBudget`, `maxWageBudget`, wage bill, hiring state, `passesWageGate`, `estimateWeeklyWage` |
| `src/Domain/aiFinance/seasonReaction.ts` | Pure: `aiSeasonOutcome`, `followersChange`, `nextFinancialTier`, `applyAISeasonReaction` |
| `src/Domain/transfer/transferNeeds.ts` | `processTeamTransferAttempt` applies the wage gate to AI buyers |
| `src/Domain/transfer/marketRotation.ts` | Human sell-list matching applies the wage gate to the AI buyer |
| `src/backend/advanceDay.ts` | Rollover step 3: `applyTierFinanceChange` then `applyAISeasonReaction` on every AI reset squad |
| `src/backend/FinancialService.ts` | Reuses `estimateWeeklyWage` (single wage formula for player and AI) |

The human club keeps the full financial system and never gets a `financialTier`.

## Data model

- `Squad.financialTier?: "LOW" | "MEDIUM" | "HIGH" | "ELITE"` — stored only on AI clubs, written at
  every season rollover. Before a club's first rollover it is absent and `financialTierOf` uses the
  **natural tier** from income. World data and startKits are untouched (no importer change).
- `popularity` (0–100) is not stored: it is derived from `finances.followers` on a log scale
  (100k → 0, ~316M → 100).
- `weeklyBudget`, `maxWageBudget`, `wageBill` are always computed (`aiClubFinance(squad)`), never saved.
- `finances.budget` (transfer money) keeps its existing role: price caps (`budgetTierFromBudget`),
  fee ≤ budget, fee exchange. It is not simulated as a balance with wages.

## Natural tier (from annual income = broadcasting + commercial)

| Tier | Income | World share at start |
|---|---|---|
| LOW | < €15M | ~25% |
| MEDIUM | ≥ €15M | ~53% |
| HIGH | ≥ €80M | ~19% |
| ELITE | ≥ €200M | ~3% |

Income (not budget) because it already reflects the league tier (importer calibration +
`applyTierFinanceChange`) and does not move with each transfer.

## Budget model (units: € per week, same scale as `estimateWeeklyWage = rating^2.2 × 50`)

```
weeklyBudget  = BASE_WEEKLY_BUDGET[tier] × (1 + popularity/100) × SOFT_BALANCE[tier]
maxWageBudget = weeklyBudget × 0.7
```

| Tier | Base | Soft balance | Cheap-fee cap (tight) | Min transfer budget at rollover |
|---|---|---|---|---|
| LOW | 22 000 | ×1.10 | €2M | €0.5M |
| MEDIUM | 28 000 | ×1.03 | €5M | €2M |
| HIGH | 42 000 | ×1.00 | €12M | €8M |
| ELITE | 50 000 | ×0.95 | €25M | €25M |

At world start ≈ 78% of clubs are `open`, 8% `tight`, 9% `frozen`.

## Wage control (AI transfer market)

`hiring = frozen` if `wageBill ≥ maxWageBudget`, `tight` if `≥ 0.9 × maxWageBudget`, else `open`.

- `frozen` → `processTeamTransferAttempt` returns null (no hiring).
- `tight` → only `cover_need` needs, and only candidates with fee ≤ cheap cap.
- Always: `wageBill + candidateWage ≤ maxWageBudget`.
- The budget-tier price caps and `fee ≤ budget` still apply on top; nothing else in the market changed.
- Same gate for the AI buyer of a human sell-list player. No forced release of players (optional later).

## Season reaction (rollover, per AI club, after the tier income change)

Performance `perf = 1 − 2 × (rank−1)/(n−1)` (+1 champion, −1 last; 0 if no games).

- **Followers:** `+perf × 10%` if good, `+perf × 4%` if bad (slight), champion +5%, promoted +10%,
  relegated −6%. Gains ×{LOW 1.25, MEDIUM 1.1, HIGH 1, ELITE 0.8}, losses ×{0.75, 0.9, 1, 1.2}
  (soft balancing). Floor 1 000.
- **Tier:** promoted +1, relegated −1, otherwise top 15% of the table +1 / bottom 15% −1. Moving
  into ELITE needs a title. The result is clamped to ±1 step around the natural tier of the club's
  new income, so a relegated club follows its income down and tiers self-correct.
- **No bankruptcy:** transfer budget floored at `MIN_BUDGET[newTier]`.

Not simulated for AI: ticket revenue (no per-tier ticket price was needed), merchandise, expenses, balance.

## Tests

`bun test src/Domain/aiFinance src/Domain/transfer` — tier derivation, budget math, wage gate,
season reaction. `scripts/season-rollover-smoke.ts` checks every AI club of the player's country has
a `financialTier` after the rollover and the human club does not.
