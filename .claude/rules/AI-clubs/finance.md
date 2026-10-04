Do **not** simulate full finances for AI clubs — it adds complexity without gameplay value.

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

Promotion/relegation financial impact: `applyTierFinanceChange` (`.claude/rules/game/membership.md`
→ "Pirâmide e virada por país").

---

# Implementation (what was actually built)

## Files

| File | Role |
|---|---|
| `src/Domain/aiFinance/aiFinanceConfig.ts` | **All constants** (tier thresholds, `WAGE_REVENUE_SHARE`, wage ratio, transfer budget, soft balancing, season reaction) |
| `src/Domain/aiFinance/aiClubFinance.ts` | Pure: tier, popularity, `weeklyBudget`, `maxWageBudget` (from revenue), wage bill, hiring state, `passesWageGate`, `estimateWeeklyWage`, seasonal transfer budget (`aiTransferBudgetOf`, `applyAITransferSpend/Sale`), `transferBudgetTierOf`, `aiFinancialPressure` |
| `src/Domain/finance/wages.ts` | Pure: `weeklyWage` (curve), `clubWageFactor`/`carryForwardWageFactor`, `clubAnnualRevenue`, `wageFactorOf`/`wageRevenueBasisOf` — shared by the human club and `aiClubFinance`. See `.claude/rules/game/finances.md` |
| `src/Domain/finance/prizes.ts` | Pure: `leaguePrize`, `cupStagePrize`/`cupRunnerUpPrize`, `continentalPrize`/`continentalStagePrizesFromEvents`, `aiBudgetWithPrize` (the AI's capped share of any prize) |
| `src/Domain/aiFinance/seasonReaction.ts` | Pure: `clubSeasonOutcome` (now takes an optional `continental` good/title set), `followersChange`, `nextFinancialTier`, `applyAISeasonReaction`, `applyHumanSeasonReaction` |
| `src/Domain/aiFinance/financeRows.ts` | Pure: `buildClubFinanceRows` for the UI endpoint |
| `src/Domain/transfer/transferNeeds.ts` | Needs use `transferBudgetTierOf`; `processTeamTransferAttempt` pays from `aiTransferBudgetOf` and applies the wage gate |
| `src/Domain/transfer/sellList.ts` | Depth minimums / financial bonus from `transferBudgetTierOf` |
| `src/Domain/transfer/transferAcceptance.ts` | AI seller pressure from its tier; `{ humanSeller: true }` keeps the budget-based pressure for the human club |
| `src/Domain/transfer/marketRotation.ts` | Human sell-list matching: AI buyer needs transfer budget + wage room |
| `src/backend/FinancialService.ts` | `executeTransferFee` / pure `transferFeeSquads`: human <-> `finances.budget` (ledger `transfer_in`/`transfer_out`), AI <-> `aiTransferBudget`; `recordMoney` (the ledger's single write point) |
| `src/backend/continentalWorld.ts` | `continentalGoodClubsThisSeason` — finals/titles already drawn on disk, read once per country rollover for `clubSeasonOutcome` |
| `src/backend/advanceDay.ts` | Prize awards (cup/continental, on the day; league, at rollover) via `awardClubPrize`; rollover step 3: `applyTierFinanceChange`, then `applyAISeasonReaction` (AI) or `applyHumanSeasonReaction` (human) + inbox line |
| `src/backend/routes.ts` | `GET /api/saves/:id/leagues/:slug/ai-finances`, `GET /api/saves/:id/ledger` |
| `src/GameInterface/Components/ClubFinancesTable.tsx` | "Finances" tab of the league screen (`LeagueTableScreen`) |

See `.claude/rules/game/finances.md` for the wage curve calibration, the player's ledger, gate
revenue and the full prize tables — this file only covers the AI-specific budget/hiring/season-
reaction rules that consume them.

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

## Weekly budget and wage cap (from revenue, not a per-tier base amount — since 2026-09-27, #12)

`estimateWeeklyWage`/`playerWeeklyWage` now come from the shared real-euro curve + per-club factor
(`src/Domain/finance/wages.ts`, `weeklyWage(rating) x clubWageFactor(...)`, carried forward every
rollover — see `.claude/rules/game/finances.md` § "Salários"), the SAME formula the human club uses.
The AI's wage cap is a share of the club's own estimated revenue, using the exact same
`wageRevenueBasis` stored on the squad the wage factor was last set against — never a fresh
`clubAnnualRevenue` with a guessed league size, or the cap and the real wage bill land on different
bases:

```
maxWageBudget = WAGE_REVENUE_SHARE x wageRevenueBasis / 52 x SOFT_BALANCE[tier]
weeklyBudget  = maxWageBudget / WAGE_RATIO   (WAGE_RATIO = 0.8 — the headline figure, not itself a cap)
```

| Tier | Cheap-fee cap (tight) | Financial pressure (as seller) |
|---|---|---|
| LOW | EUR 2M | 1.0 |
| MEDIUM | EUR 5M | 0.5 |
| HIGH | EUR 12M | 0.25 |
| ELITE | EUR 25M | 0.1 |

`WAGE_REVENUE_SHARE = 0.72` (not the `0.67` closest to the 92/5/3 open/tight/frozen target by sum
of squares — at 0.67 the ELITE tier's bill/cap ratio sits at/above the 0.9 `NEAR_LIMIT_RATIO`
threshold, so every one of the world's 40 ELITE clubs reads "tight" permanently regardless of how
it spends; 0.72 pushes every tier's ratio below 0.9). World start (2026-09-27, 1273 clubs,
`bun scripts/wage-calibrate.ts`): **99.0% open / 0.5% tight / 0.5% frozen**; by tier: LOW 95.7%
open / 2.3% tight / 2.0% frozen, MEDIUM/HIGH/ELITE 100% open.

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

## Prize money into the transfer budget (#12 follow-up, 2026-09-27)

League merit (at rollover), national cup stage prizes (on the day a stage is won) and continental
prizes (participation/group result/stage reached/title, on the day) all pay the AI club through
`aiBudgetWithPrize(current, prize, seasonalGrant)` (`src/Domain/finance/prizes.ts`):
`AI_PRIZE_SHARE = 0.5` of the prize is added to `aiTransferBudget`, capped at
`MAX_BALANCE_RATIO x seasonalGrant` (the same 1.5x cap `applyAITransferSale` already respects for
sale proceeds), never lowering a budget already at or above that cap. `seasonalGrant` is always
recomputed from the club's CURRENT tier + popularity at the moment of the award — a league prize
specifically is applied AFTER `applyAISeasonReaction` has already re-granted the new season's
seasonal budget, so the prize stacks on top of the fresh grant, never a stale one. See
`.claude/rules/game/finances.md` § "Premiação" for the full prize tables.

## Wage factor pull-back and contracts (#23, Etapa 7)

- At every rollover, after `carryForwardWageFactor`, the factor is pulled toward its target:
  `factor += TARGET_PULL (0.3) x (target - factor)`, `target = clubWageFactor(new revenue, curve bill)`
  (`pullWageFactorToTarget`). A club that overspent no longer keeps an inflated factor forever.
- The bill is now the sum of fixed contract wages. Expiring contracts are renewed (if the new wage fits the
  cap) or released, and the squad is refilled afterwards with free agents that fit under
  `cap x (0.9 - REFILL_HEADROOM 0.03)`, then filler youth. Daily, 10 AI clubs also try the free pool with the
  same headroom. See `.claude/rules/game/contracts.md`.
- 3-season simulation (`bun scripts/contracts-sim.ts 3`), hiring state sampled monthly: LOW 93.0% open,
  MEDIUM 93.6%, HIGH 92.3%, ELITE 97.3% (ELITE no longer permanently `tight`); average squad 26.9 / 25.2 / 24.4.

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
- **Transfer budget (AI only):** new seasonal grant from the new tier + popularity (then, if the
  club also earned a league prize this rollover, boosted further — see "Prize money" above).
- The human club never gets `financialTier` / `aiTransferBudget`.
- **Continental good season / title (#12 follow-up, 2026-09-27):** reaching a continental final
  counts as `continentalGood` — the SAME weight as a top-15% domestic finish, for both the tier
  step above and the followers reaction (`ClubSeasonOutcome.continentalGood`, floors the
  performance fraction at `TOP_FRAC`). Only WINNING it sets `continentalTitle`, the strict
  equivalent of being domestic champion for the ELITE-entry gate (reaching the final alone never
  unlocks ELITE). Both flags come from `continentalGoodClubsThisSeason` (`continentalWorld.ts`),
  read once per country rollover from the continental competitions' metas still on disk — a final
  needs `stages.find(final).drawn`, a title needs `continental.championId` set.
  **Known timing gap:** a continental final is typically drawn well after most domestic leagues
  end (semis run into April/May), so in practice this only reliably fires for the countries whose
  own rollover happens LATE enough in the year — chiefly the calendar-year European leagues
  (Belarus, Finland, Georgia, Iceland, Norway, Sweden — roll over in December, well after the
  continental final; see `.claude/rules/game/continental.md`). A cross-year league (Aug-May, e.g.
  Premier League) rolls over in the summer, generally also after the final, so it isn't excluded
  either — but the set is read at the EXACT moment that country's own rollover runs, so a country
  that rolls unusually early relative to the continental calendar can still miss a final decided
  later. Not fixed — flagged for whoever revisits this. This same `ClubSeasonOutcome` (continental
  flags included) is shared by `applyHumanSeasonReaction`, so a human finalist/champion gets the
  identical followers boost an AI one would.

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

`bun test src/Domain/aiFinance src/Domain/finance src/Domain/transfer src/backend/FinancialService.test.ts src/backend/continentalWorld.test.ts`.
`scripts/season-rollover-smoke.ts` checks every AI club of the player's country has a tier and a
fresh transfer budget after the rollover, the human has neither, the human followers match
`applyHumanSeasonReaction`, the inbox has the followers line, plus a whole "Finanças" section (see
`.claude/rules/game/finances.md` § "Testes"): the player's ledger sums to its budget, at least one
league prize was paid, no AI transfer budget anywhere exceeds `MAX_BALANCE_RATIO x` its seasonal
grant, and every squad in the world has a numeric `wageFactor`/`wageRevenueBasis`.
