# AI Club Transfer Needs System

## Files

| File | Role |
|------|------|
| `src/Domain/transfer/transferNeeds.ts` | Core transfer needs generation + candidate scoring |
| `src/Domain/transfer/sellList.ts` | AI sell list generation |
| `src/Domain/transfer/marketRotation.ts` | Daily market tick + AI transfer orchestration |
| `src/Domain/transfer/transferAcceptance.ts` | Transfer offer evaluation (seller side) |
| `src/backend/transfers.ts` | HTTP endpoints |
| `src/backend/advanceDay.ts` | Game loop integration — calls `dailyMarketTick()` once per day |
| `src/types/transferMarketTypes.ts` | Core data structures |

---

## Core Data Structures

```ts
type TransferIntentType =
  | "cover_need"         // fill weak/thin band — default practical signing
  | "future_investment"  // buy young player with upside (not low-tier clubs)
  | "improvement"        // sign a real upgrade (mid/high-tier clubs only)

interface TransferNeed {
  position: MainRole;             // "GK" | "Defender" | "Midfielder" | "Forward"
  targetMin: number;              // Minimum player rating to target
  targetMax: number;              // Maximum player rating to target
  urgency: number;                // 0–1, how desperately the club needs this
  budgetTier: TransferBudgetTier; // "low" | "mid" | "high"
  intentType: TransferIntentType;
}

interface SquadMarketProfile {
  squadId: string;
  needs: TransferNeed[];
  sellList: SellCandidate[];
  lastUpdateDay: string;
}

interface SellCandidate {
  playerId: string;
  priority: number;  // 0–1: higher = easier to buy
}

interface MarketState {
  shuffledTeamIds: string[];                    // Rotation order of AI squads
  rotationIndex: number;
  profiles: Record<string, SquadMarketProfile>;
  playerSellList: SellCandidate[];              // Human player's sell list
}
```

---

## Budget Tiers

```
budget >= €50M → "high"
budget >= €15M → "mid"
otherwise      → "low"
```

Price caps per tier when buying:

| Tier | Price cap |
|------|-----------|
| `high` | None |
| `mid` | €40M |
| `low` | €15M |

---

## Transfer Needs Generation (`generateTransferNeeds`)

Each band can produce up to one need of each intent type. Global caps per refresh: **2 cover_need, 1 future_investment, 1 improvement**. Needs are sorted by urgency within each type before caps are applied.

### cover_need

Generated when `urgency ≥ 0.3`:
```
base urgency = 0.2
if count < 2:                  urgency = 1.0  (critical shortage)
if bandAvg < teamAvg - 0.3:   urgency = 0.6  (weak depth)
urgency += (rng() - 0.5) × 0.15
urgency = clamp(urgency, 0, 1)
```

Target range:
```
targetMin = teamAvg - 0.3 + jitter
targetMax by tier:
  "high": teamAvg + 1.0 + rng() × 0.4
  "mid":  teamAvg + 0.6 + rng() × 0.3
  "low":  teamAvg + 0.3 + rng() × 0.2
```

### future_investment

Generated only when: `tier != "low"`, `count >= 2`, `urgency < 1.0` (no emergency).

```
targetMin = teamAvg - 0.8 + jitter
targetMax = teamAvg + 0.2 + jitter
```

Hard filter: candidates with `age > 23` are rejected in `findCandidates`.

### improvement

Generated only when: `tier == "mid" | "high"`, `count >= 2`, `urgency < 1.0`.

```
targetMin = teamAvg + 0.4 + jitter
targetMax = teamAvg + 1.5 + rng() × 0.2
```

---

## Sell List Generation (`generateSellList`)

**Minimum band depth (never sell below this):**

| Band | low | mid | high |
|------|-----|-----|------|
| GK | 3 | 3 | 3 |
| Defender | 7 | 8 | 9 |
| Midfielder | 7 | 8 | 9 |
| Forward | 4 | 5 | 6 |

**Players always protected from sale:**
- Rating > teamAvg + 0.5 (star players)
- Age < 23 (young players)
- Selling would breach minimum band depth
- Only player at their exact detailed position

**Sell priority accumulation:**

| Condition | Priority added |
|-----------|---------------|
| Band is over depth + player is in bottom 50% | 0.3–0.5 |
| Age ≥ 23 AND rating < teamAvg − 0.5 | 0.25–0.45 |
| Age > 30 AND rating < teamAvg | 0.2–0.5 |
| Financial pressure (`low` tier: +0.2, `mid`: +0.1) | 0–0.2 |
| Small noise | ±0.025 |

Maximum 5 players per sell list, sorted by priority descending.

---

## Transfer Candidate Scoring (`scoreCandidate`)

Dispatches to an intent-specific formula. `sellScore` = candidate's priority on seller's sell list.

### cover_need
```
fit   = 1 - |rating - targetMid| / 2
total = fit × 0.35 + priceScore × 0.25 + sellScore × 0.20 + ageScore × 0.10 + urgency × 0.10 + noise

ageScore: < 24 → 1.0 / < 28 → 0.85 / < 32 → 0.65 / else → 0.40
```

### future_investment
```
youthScore: ≤19 → 1.0 / ≤21 → 0.85 / ≤23 → 0.55 / >23 → 0.10 (filtered out by findCandidates)
upsideFit  = 1 - |rating - targetMax| / 2      (prefer players near upper end of range)
currentFit = 1 - |rating - targetMid| / 2

total = youthScore × 0.40 + upsideFit × 0.25 + priceScore × 0.15 + sellScore × 0.10 + currentFit × 0.10 + noise
```

### improvement
```
improvementValue = clamp(rating - buyerTeamAvg, 0, 1.5) / 1.5
fit = 1 - |rating - targetMid| / 2

total = improvementValue × 0.40 + fit × 0.25 + priceScore × 0.15 + sellScore × 0.10 + ageScore × 0.10 + noise

ageScore: < 24 → 1.0 / < 28 → 0.90 / < 30 → 0.70 / ≥ 30 → 0.20
```

---

## Player Price Formula (`Player.valueMillions`)

```
base = rating² × 0.8

ageFactor:
  age ≤ 24: × 1.3
  age ≤ 28: × 1.0
  age ≤ 32: × 0.7
  age >  32: × 0.4

price = round(base × ageFactor) × 1_000_000
```

Negotiated fee = `fairPrice × (0.9 + rng() × 0.25)` — AI pays 90–115% of fair value.

---

## Transfer Offer Evaluation (`evaluateTransferOffer`)

**Hard rejections:**
- Squad < 15 players
- Selling would leave position with ≤ 1 player at that band

**Score formula:**
```
offerScore      = fee / expectedValue
relativeStrength = playerRating - teamAvg
financialPressure:
  budget < €10M → 1.0
  budget < €50M → 0.5
  otherwise     → 0.1

decisionScore = offerScore × 0.6 + financialPressure × 0.3 - relativeStrength × 0.5

if player is on sell list:
  decisionScore += sellPriority × 0.5
```

**Accept if** `decisionScore > 0.8`, else reject.

Extra hard reject: rating > teamAvg + 0.5 AND offerScore < 0.8 — star players need a premium offer.

---

## Daily Market Tick (`dailyMarketTick`)

Called once per game day from `advanceDay.ts`.

**Phase 1 — Refresh AI profiles** (10 teams/day, rotated):
- `generateTransferNeeds()` + `generateSellList()` for each team
- Uses Fisher–Yates rotation so all clubs are updated gradually

**Phase 2 — AI transfer attempts** (10 random teams/day):
- Pick highest-urgency need
- Score all candidates across other squads
- Calculate fee (fairPrice × random multiplier)
- If fee ≤ buyer's budget: attempt offer → evaluate → complete if accepted

**Phase 3 — Human sell list matching** (checked daily):
- Tries to find an AI buyer for any player the human has listed
- Same evaluation path as Phase 2

---

## Key Configuration Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `BUDGET_HIGH` | €50M | High-tier threshold |
| `BUDGET_MID` | €15M | Mid-tier threshold |
| `PRICE_CAP_MID` | €40M | Max price for mid-tier AI |
| `PRICE_CAP_LOW` | €15M | Max price for low-tier AI |
| `TEAMS_PER_DAY_NEEDS` | 10 | Profiles refreshed per day |
| `TEAMS_PER_DAY_ATTEMPTS` | 10 | Transfer attempts per day |
| `MAX_SELL_LIST` | 5 | Max players on an AI sell list |
| `SELL_ABOVE_AVG_PROTECTION` | 0.5 | Rating gap above avg to protect |
| `SELL_YOUNG_PROTECTION` | 23 | Age below which players are never listed |
| `SELL_AGE_THRESHOLD` | 30 | Age above which aging penalty applies |
