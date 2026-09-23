# Defensive Decision Migration Plan

## Goal

Replace the current staged heuristic pipeline with a scored defensive-intent system. Focus:

* threshold/rank-only logic → scored choices
* `track_mark` stays as the default backbone
* `step_into_carry_lane` as the main override when the ball carrier becomes more dangerous than the assigned mark
* tactics and role both visibly affect behavior
* preserve what works: bounds, depth tracking, compactness, marking, tackle system, commitment

---

## Non-Negotiable Constraints

* **Keep bounds clamping** — already the final legality layer in `computeDefensivePosition()`, stays there
* **Keep mark assignment** — greedy 1:1 `assignMarkTargets()` stays; not a full rewrite
* **Keep tackle separate** — close-range duel system, own priority/cooldown/recovery, not folded into positioning
* **Reuse commitment** — `press: 8` ticks stays
* **Don't delete the current shape logic** — depth track, compactness, lane block become the shape anchor input

---

## Five Defensive Intents (First Migration)

| Intent | Meaning |
|---|---|
| `hold_shape` | Stay compact, preserve the block — scored version of current depth track + compactness |
| `track_mark` | Default: mark an opponent, scale pull by threat (current threat-based marking, now a scored option) |
| `press_holder` | Actively close the ball holder — replaces rank/range press trigger with urgency score |
| `cover_pass_lane` | Screen the most dangerous immediate pass route without fully leaving structure |
| `step_into_carry_lane` | Abandon mark-following when ball carrier entering the corridor is the bigger danger |

---

## Files to Change

| File | Change Type | Phases |
|---|---|---|
| `Domain/DefensivePositioning.ts` | Modify (primary work) | 1, 2, 3, 5, 7, 8a |
| `Configs/DefenseConfig.ts` | Modify — add tactic key storage + multiplier tables | 4 |
| `Configs/DefensiveIntentConfig.ts` | **Create new** — static intent scoring constants | 4 |
| `Domain/roleEngineData.ts` | Modify — add `defensiveIntentWeights` to interface | 4 |
| `Data/roles.json` | Modify — add `defensiveIntentWeights` to all 14 roles | 4 |
| `Infrastructure/EventBus.ts` | Modify — add `defensiveScores` debug event | 6 |
| `Domain/DecisionTree.ts` | Modify — press trigger → scored | 8b |

`Positioning.ts` and `gameState.ts` — **no changes needed**. `computeDefensivePosition()` signature is preserved.

---

## Implementation Order

```
Phase 1 (extract shape anchor)
  → Phase 2 (extract track mark target)
    → Phase 3 (context builder + DefensiveIntent type)
      → Phase 4 (role weights + tactic multiplier tables)
        → Phase 6 (EventBus defensiveScores — compile must pass before Phase 5 emits)
        → Phase 5 (selectDefensiveIntent — 3 intents: hold_shape, track_mark, press_holder)
          → Phase 7 (step_into_carry_lane)
            → Phase 8a (cover_pass_lane)
          → Phase 8b (DecisionTree press trigger migration)
```

---

## Phase 1 — Extract `computeDefensiveShapeAnchor()`

**File**: `Domain/DefensivePositioning.ts`

Pull the pure shape/block computation into a named, exported function. No behavior change.

Extract from `computeDefensivePosition()`:
- Base formation slot resolution
- X: ball-relative depth tracking (DEPTH_OFFSET_BASE/RANGE, X_TRACK_WEIGHT, ballSupportScale)
- Y: lateral block shift
- Y: horizontal compactness
- X: lane blocking nudge

```ts
export function computeDefensiveShapeAnchor(
  player: GamePlayer,
  ballPos: { x: number; y: number },
  formation: Formation,
  cfg: DefenseConfigValues,
): { x: number; y: number }
```

After extraction, `computeDefensivePosition()` becomes:
1. Call `computeDefensiveShapeAnchor()` → `{ rawX, rawY }`
2. Apply threat-based marking pull (unchanged)
3. Clamp to bounds and return

**No other files change.**

---

## Phase 2 — Extract `computeTrackMarkTarget()`

**File**: `Domain/DefensivePositioning.ts`

Extract the threat-based marking logic (current Stage 5) into a named function. No behavior change.

```ts
export function computeTrackMarkTarget(
  shapeAnchor: { x: number; y: number },
  player: GamePlayer,
  ballHolder: GamePlayer,
  markTarget: GamePlayer,
  cfg: DefenseConfigValues,
): { x: number; y: number; threat: number; pull: number }
```

Returns the target position plus `threat` and `pull` scalars — these feed into `buildDefensiveIntentContext()` in Phase 3 as `markThreat`.

After extraction, `computeDefensivePosition()` calls this if `playerDecision !== 'press' && playerDecision !== 'tackle'` and mark/holder exist.

**No other files change.**

---

## Phase 3 — Add `DefensiveIntent` Type and `buildDefensiveIntentContext()`

**File**: `Domain/DefensivePositioning.ts`

Add at the top of the file:

```ts
export type DefensiveIntent =
  | 'hold_shape'
  | 'track_mark'
  | 'press_holder'
  | 'cover_pass_lane'
  | 'step_into_carry_lane';

type DefensiveIntentContext = {
  player: GamePlayer;
  ballHolder: GamePlayer | null;
  markTarget: GamePlayer | null;
  shapeAnchor: { x: number; y: number };
  cfg: DefenseConfigValues;
  allPlayers: GamePlayer[];
  formation: Formation;
  ballPos: { x: number; y: number };
  ownGoalX: number;
  distToHolder: number;
  distToMark: number;
  holderThreat: number;    // how dangerous the ball carrier is — advancement + centrality
  markThreat: number;      // how dangerous the assigned mark is — proximity to own goal
  holderInMyCorridor: boolean;       // |ballHolder.y - player.y| < CORRIDOR_HALF_WIDTH
  canGetGoalSideOfHolder: boolean;   // player is already closer to own goal than holder
  holderHasBeatenFrontDefender: boolean;  // no back-line defender is ahead of the holder (goal-side)
  rolePressBias: number;
  roleCarryLaneBias: number;
  roleMarkBias: number;
};
```

New builder function:

```ts
function buildDefensiveIntentContext(
  player, ballHolder, markTarget, allPlayers, formation, ballPos, cfg
): DefensiveIntentContext
```

Key computation notes:
- `ownGoalX = player.attackDir === 1 ? 0 : PITCH_LENGTH`
- `holderThreat` / `markThreat` — same core formula as current marking: `Math.max(0, 1 - distFromOwnGoal / cfg.THREAT_HORIZON)`
- `holderInMyCorridor` — `Math.abs(ballHolder.y - player.y) < CORRIDOR_HALF_WIDTH` (constant from `DefensiveIntentConfig`)
- `canGetGoalSideOfHolder` — defender's X is already between holder and own goal
- `holderHasBeatenFrontDefender` — no teammate with `ballSupportScale < 0.25` is goal-side of the holder
- Role bias fields: stub as `0.5` until Phase 4 adds them to `roles.json`

---

## Phase 4 — Role Defensive Intent Weights + Tactic Multiplier Tables

### New file: `Configs/DefensiveIntentConfig.ts`

Static constants for intent scoring (analogous to `OffBallConfig.ts`):

```ts
type DefIntentKey = 'hold_shape' | 'track_mark' | 'press_holder' | 'cover_pass_lane' | 'step_into_carry_lane';
type DefIntentMultMap = Record<DefIntentKey, number>;

export const INTENT_PRESSING_STYLE: Record<'low_block' | 'mid_block' | 'high_press', DefIntentMultMap> = {
  low_block:  { hold_shape: 1.4, track_mark: 1.2, press_holder: 0.3, cover_pass_lane: 0.8, step_into_carry_lane: 0.6 },
  mid_block:  { hold_shape: 1.0, track_mark: 1.0, press_holder: 1.0, cover_pass_lane: 1.0, step_into_carry_lane: 1.0 },
  high_press: { hold_shape: 0.5, track_mark: 0.8, press_holder: 1.8, cover_pass_lane: 1.2, step_into_carry_lane: 1.2 },
};

export const INTENT_DEFENSIVE_LINE: Record<'deep' | 'normal' | 'high', DefIntentMultMap> = {
  deep:   { hold_shape: 1.3, track_mark: 1.2, press_holder: 0.6, cover_pass_lane: 1.0, step_into_carry_lane: 1.1 },
  normal: { hold_shape: 1.0, track_mark: 1.0, press_holder: 1.0, cover_pass_lane: 1.0, step_into_carry_lane: 1.0 },
  high:   { hold_shape: 0.7, track_mark: 0.9, press_holder: 1.4, cover_pass_lane: 1.1, step_into_carry_lane: 0.9 },
};

export const DEFENSIVE_INTENT_CONFIG = {
  CORRIDOR_HALF_WIDTH:       8,   // yds — lateral corridor for holderInMyCorridor check
  CARRY_LANE_LOOKAHEAD:      8,   // yds — how far ahead to project holder's carry path
  CARRY_LANE_INTERCEPT_RADIUS: 6, // yds — how close to the intercept point counts as coverage
  PRESS_SCORE_THRESHOLD:     0.35, // minimum press_holder score to trigger press in DecisionTree
} as const;
```

### `Configs/DefenseConfig.ts`

Add parallel tactic key storage (safe — doesn't change the numeric `DefenseConfigValues` type):

```ts
const TEAM_TACTIC_KEYS: Record<TeamId, {
  pressingStyle: 'low_block' | 'mid_block' | 'high_press';
  defensiveLine: 'deep' | 'normal' | 'high';
}> = {
  A: { pressingStyle: 'mid_block', defensiveLine: 'normal' },
  B: { pressingStyle: 'mid_block', defensiveLine: 'normal' },
};

export function getDefenseTacticKeys(team: TeamId) {
  return TEAM_TACTIC_KEYS[team];
}
```

`applyTeamTacticsConfig()` also writes the new `TEAM_TACTIC_KEYS[team]`.

### `Domain/roleEngineData.ts`

Add to `RoleEngineTuning` interface:

```ts
defensiveIntentWeights: {
  hold_shape:           number;
  track_mark:           number;
  press_holder:         number;
  cover_pass_lane:      number;
  step_into_carry_lane: number;
};
```

### `Data/roles.json`

Add `defensiveIntentWeights` to every role's `engine` block. Initial values:

| Role | hold_shape | track_mark | press_holder | cover_pass_lane | step_into_carry_lane |
|------|-----------|-----------|-------------|-----------------|---------------------|
| GK   | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| CB   | 0.80 | 0.90 | 0.15 | 0.40 | 0.75 |
| LB/RB | 0.55 | 0.65 | 0.35 | 0.45 | 0.55 |
| LWB/RWB | 0.40 | 0.50 | 0.50 | 0.45 | 0.45 |
| CDM  | 0.50 | 0.65 | 0.75 | 0.80 | 0.55 |
| CM   | 0.40 | 0.55 | 0.65 | 0.70 | 0.40 |
| CAM  | 0.20 | 0.30 | 0.45 | 0.55 | 0.25 |
| LM/RM | 0.25 | 0.35 | 0.45 | 0.50 | 0.30 |
| LW/RW | 0.20 | 0.25 | 0.40 | 0.40 | 0.20 |
| ST   | 0.10 | 0.15 | 0.30 | 0.35 | 0.15 |

These are starting values for tuning, not final.

---

## Phase 5 — `selectDefensiveIntent()` (3 Intents: hold_shape, track_mark, press_holder)

**File**: `Domain/DefensivePositioning.ts`
**Also requires**: Phase 6 EventBus addition (must compile before Phase 5 emits)

```ts
function selectDefensiveIntent(ctx: DefensiveIntentContext): {
  intent: DefensiveIntent;
  scores: Record<DefensiveIntent, number>;
  carryLaneBonus: number;
}
```

Scoring formulas:

**`hold_shape`**:
```
score = roleWeight × pressingMult × lineMult
score *= (1.0 + (1.0 - holderThreat) × 0.5)   // boost when threats are low
if (holderInMyCorridor && distToHolder < 15) score *= 0.6
```

**`track_mark`**:
```
score = roleWeight × pressingMult × lineMult
score *= (0.5 + markThreat × 0.5)   // scales with mark danger
if (!markTarget) score *= 0.2
```

**`press_holder`**:
```
score = roleWeight × pressingMult × lineMult
// Rank-based range gate (preserves current press eligibility)
rank = position among defenders by dist to holder
accelBonus = player.acceleration × PRESS_ACCEL_RANGE_BONUS
maxPressRange = rank 0 → pressRange + accelBonus; rank 1 → 20 × PRESS_INTENSITY + accelBonus × 0.5; else 0
if (distToHolder > maxPressRange) score *= 0.05
else score *= (1.0 - distToHolder / maxPressRange)
score *= (0.5 + holderThreat × 0.5)
```

**`cover_pass_lane`** and **`step_into_carry_lane`**: return 0 (stubs).

Tiebreak: `track_mark` wins over `hold_shape`.

**Refactor `computeDefensivePosition()`** into orchestration:

```ts
const cfg = getDefenseConfig(player.team);

// Hard bypass for active press/tackle (no intent selection needed)
if (playerDecision === 'press' || playerDecision === 'tackle') {
  const anchor = computeDefensiveShapeAnchor(player, ballPos, formation, cfg);
  return clampToBounds(anchor, player.bounds);
}

const ballHolder = allPlayers.find(p => p.id === ballHolderId) ?? null;
const markTarget = markTargetId != null ? allPlayers.find(p => p.id === markTargetId) ?? null : null;

const ctx = buildDefensiveIntentContext(player, ballHolder, markTarget, allPlayers, formation, ballPos, cfg);
const { intent, scores, carryLaneBonus } = selectDefensiveIntent(ctx);

// Debug
if (isDebugEnabled()) gameBus.emit('defensiveScores', { ... });

let rawX = ctx.shapeAnchor.x;
let rawY = ctx.shapeAnchor.y;

if (intent === 'track_mark' && ballHolder && markTarget) {
  const result = computeTrackMarkTarget(ctx.shapeAnchor, player, ballHolder, markTarget, cfg);
  rawX = result.x; rawY = result.y;
}
// hold_shape and press_holder use shape anchor as-is
// (press movement is still handled by DecisionTree → gameState, not by positioning)

return clampToBounds({ x: rawX, y: rawY }, player.bounds);
```

Add imports to `DefensivePositioning.ts`:
```ts
import { isDebugEnabled } from '@/GameEngine/Suport/DebugLog';
import { gameBus } from '@/GameEngine/Infrastructure/EventBus';
```

---

## Phase 6 — Add `defensiveScores` to EventBus

**File**: `Infrastructure/EventBus.ts`

Add to `GameEvents` (after `offBallScores`):

```ts
/** Emitted every tick for each defending player when debug mode is on. */
defensiveScores: {
  playerId:     number;
  playerName:   string;
  chosenIntent: DefensiveIntent;
  scores: {
    hold_shape:           number;
    track_mark:           number;
    press_holder:         number;
    cover_pass_lane:      number;
    step_into_carry_lane: number;
  };
  holderThreat:   number;
  markThreat:     number;
  carryLaneBonus: number;
};
```

**Must land before Phase 5 emits** to avoid TypeScript compile errors.

---

## Phase 7 — `step_into_carry_lane` Intent

**File**: `Domain/DefensivePositioning.ts`

**Scoring** in `selectDefensiveIntent()`:

```ts
let carryLaneScore = roleWeight.step_into_carry_lane × pressingMult × lineMult;
if (!holderInMyCorridor) carryLaneScore *= 0.2;
if (!holderHasBeatenFrontDefender) carryLaneScore *= 0.3;
carryLaneScore *= (0.3 + holderThreat × 0.7);
if (canGetGoalSideOfHolder) carryLaneScore *= 1.4;
```

**Target generator** — new private function:

```ts
function computeCarryLaneIntercept(
  player: GamePlayer,
  ballHolder: GamePlayer,
  ownGoalX: number,
): { x: number; y: number }
```

Projects ball holder's movement toward own goal by `CARRY_LANE_LOOKAHEAD` yards. Returns the point on that path closest to the defender's current position (intercept point). This makes the defender step across the carry path rather than chasing the holder.

In `computeDefensivePosition()` dispatch:

```ts
if (intent === 'step_into_carry_lane' && ballHolder) {
  const intercept = computeCarryLaneIntercept(player, ballHolder, ctx.ownGoalX);
  rawX = intercept.x; rawY = intercept.y;
}
```

The `carryLaneBonus` for debug is the value added by `canGetGoalSideOfHolder` multiplier.

**This is the Petrov/Okeke fix**: Okeke's `track_mark` score on Rossi gets outscored by `step_into_carry_lane` on Petrov when Petrov beats the front line and enters the central corridor.

---

## Phase 8a — `cover_pass_lane` Intent

**File**: `Domain/DefensivePositioning.ts`

**Scoring**:

```ts
let passLaneScore = roleWeight.cover_pass_lane × pressingMult × lineMult;
passLaneScore *= (0.3 + holderThreat × 0.4 + markThreat × 0.3);
if (!markTarget) passLaneScore *= 0.3;
if (holderHasBeatenFrontDefender) passLaneScore *= 0.5;  // carry_lane already handles this case
```

**Target**: Point at `MARK_LANE_T_FAR` along the ball→mark lane — reuses the interpolation already inside `computeTrackMarkTarget()` but biased toward the lane midpoint.

---

## Phase 8b — Press Trigger Migration in `DecisionTree.ts`

**File**: `Domain/DecisionTree.ts`

Replace rank-and-range if-else chain with a scored press decision:

```ts
const pressScore = computePressScore(player, ballHolder, allPlayers, cfg);
if (pressScore > PRESS_SCORE_THRESHOLD) {
  return { type: 'press', targetId: ballHolder.id };
}
return { type: 'idle' };
```

`computePressScore()` — new private function in `DecisionTree.ts`:
- Computes rank among defenders (rank=0 still gets highest base)
- Applies `pressRange + accelBonus` as a score decay instead of binary gate
- Multiplies by `roleEngine(player.role).defensiveIntentWeights.press_holder`
- Multiplies by `holderThreat` (recomputed here from basic distance to own goal)

`PRESS_SCORE_THRESHOLD = 0.35` lives in `DefensiveIntentConfig.ts`.

`COMMIT_TICKS.press = 8` — unchanged.
Tackle close-range check — unchanged.

**Do NOT migrate press fully in one step**: Phase 8b keeps the rank-based range gate as a score modifier (not a score overrider). Full rank removal is Phase 9 (not in this migration).

---

## Debug Panel Update (After Phase 6)

The debug panel (`DebugPanel.tsx`) already handles `offBallScores` with intent badge + 4 score bars.

After Phase 6, add an analogous view for `defensiveScores`:
- Show chosen intent (badge)
- 5 bars: SHAPE / MARK / PRESS / LANE / STEP (with colors: gray / blue / orange / yellow / red)
- Show `holderThreat` and `markThreat` as small indicators

This is UI work — implement after the engine phases are stable.

---

## Acceptance Criteria

The migration is done when:

* Defenders keep coherent shape when no immediate danger exists
* `track_mark` remains the most common default behavior
* CBs abandon strict marking to block dangerous central carries
* `step_into_carry_lane` fires when a carrier beats the front line in a defender's corridor
* Forwards don't press constantly unless `high_press` tactic is active
* Midfielders are the most active pressure layer
* `defensive_line` setting affects willingness to step up vs delay
* `pressing_style` materially changes the distribution of `press_holder` vs screening/marking
* `TACKLE_AGGRESSION` influences closing behavior without causing tackle spam
* **Petrov/Okeke resolves correctly**: Okeke drops Rossi and steps into Petrov's carry path
