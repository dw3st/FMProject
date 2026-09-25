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
| `src/Domain/aiFinance/aiFinanceConfig.ts` | **All constants** (tier thresholds, base budgets, wage ratio, transfer budget, soft balancing, season reaction) |
| `src/Domain/aiFinance/aiClubFinance.ts` | Pure: tier, popularity, `weeklyBudget`, `maxWageBudget`, wage bill, hiring state, `passesWageGate`, `estimateWeeklyWage`, seasonal transfer budget (`aiTransferBudgetOf`, `applyAITransferSpend/Sale`), `transferBudgetTierOf`, `aiFinancialPressure` |
| `src/Domain/aiFinance/seasonReaction.ts` | Pure: `clubSeasonOutcome`, `followersChange`, `nextFinancialTier`, `applyAISeasonReaction`, `applyHumanSeasonReaction` |
| `src/Domain/aiFinance/financeRows.ts` | Pure: `buildClubFinanceRows` for the UI endpoint |
| `src/Domain/transfer/transferNeeds.ts` | Needs use `transferBudgetTierOf`; `processTeamTransferAttempt` pays from `aiTransferBudgetOf` and applies the wage gate |
| `src/Domain/transfer/sellList.ts` | Depth minimums / financial bonus from `transferBudgetTierOf` |
| `src/Domain/transfer/transferAcceptance.ts` | AI seller pressure from its tier; `{ humanSeller: true }` keeps the budget-based pressure for the human club |
| `src/Domain/transfer/marketRotation.ts` | Human sell-list matching: AI buyer needs transfer budget + wage room |
| `src/backend/FinancialService.ts` | `executeTransferFee` / pure `transferFeeSquads`: human <-> `finances.budget`, AI <-> `aiTransferBudget` |
| `src/backend/advanceDay.ts` | Rollover step 3: `applyTierFinanceChange`, then `applyAISeasonReaction` (AI) or `applyHumanSeasonReaction` (human) + inbox line |
| `src/backend/routes.ts` | `GET /api/saves/:id/leagues/:slug/ai-finances` |
| `src/GameInterface/Components/ClubFinancesTable.tsx` | "Finances" tab of the league screen (`LeagueTableScreen`) |

## Data model

- `Squad.financialTier?: "LOW" | "MEDIUM" | "HIGH" | "ELITE"`: AI clubs only, written at every
  rollover. Absent before a club's first rollover, so the **natural tier** from income is used (`financialTierOf`).
- `Squad.aiTransferBudget?: number` (EUR): AI clubs only, the transfer money left this season. Absent
  means the full seasonal grant (`aiTransferBudgetOf`). World data and startKits carry neither field.
- `popularity` (0-100) is derived from `finances.followers` (log scale: 100k is 0, ~316M is 100).
- `weeklyBudget`, `maxWageBudget`, `wageBill` are always computed (`aiClubFinance`), never saved.
- **AI clubs never use `finances.budget`**: no balance, no TV/commercial accumulation (the old
  "AI broadcasting into budget" at rollover is gone). `finances.budget` is the human club's balance only.

## Natural tier (annual income = broadcasting + commercial)

| Tier | Income | World share at start |
|---|---|---|
| LOW | < EUR 15M | 24% |
| MEDIUM | >= EUR 15M | 53% |
| HIGH | >= EUR 80M | 19% |
| ELITE | >= EUR 200M | 3% |

## Weekly budget and wage cap (EUR/week, same scale as `estimateWeeklyWage = rating^2.2 x 50`)

```
weeklyBudget  = BASE_WEEKLY_BUDGET[tier] x (1 + popularity/100) x SOFT_BALANCE[tier]
maxWageBudget = weeklyBudget x 0.8
```

| Tier | Base weekly | Soft balance | Cheap-fee cap (tight) | Financial pressure (as seller) |
|---|---|---|---|---|
| LOW | 22 000 | x1.10 | EUR 2M | 1.0 |
| MEDIUM | 28 000 | x1.03 | EUR 5M | 0.5 |
| HIGH | 42 000 | x1.00 | EUR 12M | 0.25 |
| ELITE | 50 000 | x0.95 | EUR 25M | 0.1 |

World start with `WAGE_RATIO = 0.8`: **92.3% open, 5.1% tight, 2.6% frozen** (1227 clubs). Measured on
the intermediate 2024/25 world (see `.claude/rules/data/openfootball-import.md`); not re-measured
since the world moved to 2026/27 via `importEspn` (1273 clubs, see `.claude/rules/data/espn-import.md`).

## Seasonal transfer budget (AI money comes from the tier)

```
seasonal = BASE_SEASONAL[tier] x (1 + popularity/100) x SOFT_BALANCE[tier]
BASE_SEASONAL = LOW EUR 3M, MEDIUM EUR 12M, HIGH EUR 40M, ELITE EUR 100M
```

World start ranges: LOW EUR 3.9-6.4M, MEDIUM EUR 12-21M, HIGH EUR 52-71M, ELITE EUR 144-190M.

- Granted in full at every rollover (replacing whatever was left) and implied at world start.
- A fee paid leaves the budget (never below 0). A sale gives back 50% of the fee, never lifting
  the budget above 1.5 x seasonal (a budget already above it is not reduced).
- Nothing else feeds it: no TV, commercial or ticket money for AI. No club stays stuck: the next
  rollover always refills it, and sales refill it within the season.
- Market consistency: price caps and sell-list depth use `transferBudgetTierOf` (LOW is low,
  MEDIUM is mid, HIGH/ELITE are high); a fee must fit `aiTransferBudgetOf`; an AI seller's
  `financialPressure` comes from its tier. `budgetTierFromBudget` was removed.
- Human finances are unchanged: the human pays/receives on `finances.budget`, and its listed
  players are evaluated with the budget-based pressure (`{ humanSeller: true }`).

## Wage control (AI transfer market)

`hiring = frozen` if `wageBill >= maxWageBudget`, `tight` if `>= 0.9 x maxWageBudget`, else `open`.
`frozen`: no attempt. `tight`: only `cover_need` and fee <= cheap cap. Always:
`wageBill + candidateWage <= maxWageBudget`. Same gate for the AI buyer of a human sell-list
player. No forced release of players.

## Season reaction (rollover, after the tier income change)

Performance `perf = 1 - 2 x (rank-1)/(n-1)` (+1 champion, -1 last; 0 if no games).

- **Followers (AI and human):** `+perf x 10%` if good, `+perf x 4%` if bad, champion +5%,
  promoted +10%, relegated -6%. Gains x{LOW 1.25, MEDIUM 1.1, HIGH 1, ELITE 0.8}, losses
  x{0.75, 0.9, 1, 1.2} by tier (for the human: the natural tier of its new income). Floor 1 000.
  The human gets an inbox `season` message of kind `followers` when the number changed.
- **Tier (AI only):** promoted +1, relegated -1, otherwise top 15% +1 / bottom 15% -1; into ELITE
  only with a title; clamped to +-1 step around the natural tier of the new income.
- **Transfer budget (AI only):** new seasonal grant from the new tier + popularity.
- The human club never gets `financialTier` / `aiTransferBudget`.

## UI

League screen (`/leagues/:slug`), **Finances** tab next to Table / Fixtures, using the existing
league selector. One row per club: tier badge, popularity bar, weekly budget, wage bill vs cap
(bar coloured by hiring state), hiring state, transfer budget left / seasonal grant. The human's
row shows only popularity and wage bill. Data: `GET /api/saves/:id/leagues/:slug/ai-finances`
(~20 small rows, computed server-side with `aiClubFinance`). i18n: `leagues.finances.*` (en, pt-BR).

## Also fixed

The human transfer route (`src/backend/transfers.ts`) used to save both squads again after
`executeTransferFee`, overwriting the fee exchange (the human never paid, the AI never received).
`executeTransferFee` now always persists both squads and the route no longer re-saves them.

## Tests

`bun test src/Domain/aiFinance src/Domain/transfer src/backend/FinancialService.test.ts`.
`scripts/season-rollover-smoke.ts` checks every AI club of the player's country has a tier and a
fresh transfer budget after the rollover, the human has neither, the human followers match
`applyHumanSeasonReaction`, and the inbox has the followers line.
