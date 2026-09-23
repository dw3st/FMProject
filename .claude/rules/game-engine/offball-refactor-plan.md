# Off-Ball Movement Refactor Plan

## Current State (what the code actually does today)

### Entry point
`DecisionTree.ts:315` calls `evaluateOffBall(player, ballHolder, allPlayers, offsideLine)` when:
- player is on the attacking team
- player is not the ball holder
- player is not GK
- `decide()` returned `idle`

The commitment system (`COMMIT_TICKS`) is in `DecisionTree.ts`:
- `support_run: 5`
- `create_space: 5`

Commitment reuse happens in `gameState.ts:465` — if path is unchanged and `commitTicks > 0`, the previous decision is reused without re-evaluation.

### What `evaluateOffBall` does today
1. Computes a base direction toward goal
2. Generates 3–10 candidate **lanes** (directions) based on vision stat
3. Injects one drop lane (`{ dx: -attackDir, dy: 0 }`) when player is ahead of ball
4. For each lane, scores it with three factors:
   - `carryLikeScore * 0.40` — spatial openness (reuses `evaluateCarryLane`)
   - `passScore * 0.35` — `scorePassToReceiver(ballHolder, player, opponents)` — **same value for every lane**
   - `separationScore * 0.25` — anti-clustering at projected target
5. Applies bonuses/penalties: advance penalty, dropLaneBias, widthBias, offside penalty
6. Returns `support_run { dx, dy }`, `create_space { dx, dy }`, or `idle`

### Movement execution (`gameState.ts:524`)
When a player has `support_run` or `create_space`:
```
rawTarget = player.pos + decision.dx/dy * (baseLookahead * roleBias)
target = lerp(formationSlot, rawTarget, 1 - FORMATION_PULL)
target.x clamped to offsideLine
target clamped to player.bounds
```

### Role config today (`roleEngineData.ts + roles.json`)
Each role has in `engine.offBallCarryDeltas`:
- `clearance`, `progress`, `angle`, `crowd` — carry weight adjustments
- `dropLaneBias` — flat bonus on the drop lane
- `widthBias` — flat bonus on lanes toward touchline

And `engine.offBallBias` — scales lookahead distance + gates `create_space` fallback (≥ 0.5).

### Problems with current model
1. `passScore` is computed once for the player's current position but applied to **every lane** — it never differentiates which lane to run into
2. Drop lane is a single hardcoded direction (`-attackDir, 0`) — only straight backward
3. Support behavior is "generic lanes from goal direction" — no concept of *why* or *what kind* of run
4. Width and drop are late bonuses on top of a goal-oriented scan — they fight the carry-like scoring rather than generating their own targets
5. `create_space` fallback is pure "move away from nearest opponent" — no intent
6. No way to express "I should unmark laterally" vs "I should drop for support" vs "I should stretch wide"

---

## Target Architecture

Two-stage pipeline replacing the current single-pass lane loop:

```
Stage 1: selectOffBallIntent(ctx) → OffBallIntent
Stage 2: generateOffBallTargets(intent, ctx) → Vec2[]
         scoreOffBallTarget(intent, target, ctx) → number
```

Commitment, bounds, offside clamping, and movement execution stay unchanged in `gameState.ts`.

---

## Data Structures To Add

### `OffBallIntent` enum
```ts
type OffBallIntent =
  | 'support_behind_ball'   // safe support pocket behind/level with ball
  | 'lateral_unmark'        // clear the lane, separate from markers
  | 'forward_penetration'   // attack depth, run into advanced space
  | 'width_gain';           // stretch defense, wide outlet
```

### `OffBallContext` (internal, computed once per evaluation)
```ts
interface OffBallContext {
  player: GamePlayer;
  ballHolder: GamePlayer;
  opponents: GamePlayer[];
  allPlayers: GamePlayer[];
  offsideLine: number | null;

  // Derived signals
  currentPassScore: number;        // scorePassToReceiver at current position
  isAheadOfBall: boolean;
  relativeAdvance: number;         // yards ahead of ball in attack direction
  localPressure: number;           // 0..1 opponent density near player
  localCrowding: number;           // 0..1 teammate density near player
  visionNorm: number;
  roleBias: number;
  teamWidthTactic: number;         // getTeamAttackWidth() 0.3/0.6/0.9
  buildUpTactic: string;           // 'possession'|'balanced'|'direct'
}
```

---

## Role Config Changes

Add `offBallIntentWeights` to each role in `roles.json` under `engine`:

```ts
offBallIntentWeights: {
  support_behind_ball: number;   // 0..1
  lateral_unmark: number;        // 0..1
  forward_penetration: number;   // 0..1
  width_gain: number;            // 0..1
}
```

Example values by role:

| Role     | support_behind | lateral_unmark | forward_pen | width_gain |
|----------|---------------|----------------|-------------|------------|
| ST       | 0.10          | 0.20           | 0.80        | 0.10       |
| LW / RW  | 0.10          | 0.30           | 0.60        | 0.70       |
| CAM      | 0.30          | 0.40           | 0.60        | 0.10       |
| CM       | 0.60          | 0.50           | 0.30        | 0.10       |
| CDM      | 0.80          | 0.40           | 0.10        | 0.05       |
| LM / RM  | 0.30          | 0.40           | 0.50        | 0.50       |
| LB / RB  | 0.50          | 0.30           | 0.20        | 0.30       |
| LWB/RWB  | 0.40          | 0.30           | 0.20        | 0.60       |
| CB       | 0.70          | 0.30           | 0.05        | 0.10       |

These are **starting weights**, not hard locks. The intent scorer modifies them with context.

---

## Stage 1 — Intent Selection

### `selectOffBallIntent(ctx): OffBallIntent`

Score each intent family, return the highest.

#### Intent score formula
```
intentScore(family) =
  roleWeight(family)
  × tacticMultiplier(family, buildUp, width)
  × contextModifier(family, ctx)
```

#### Context modifiers per family

**`support_behind_ball`**
- `currentPassScore` high → reduce urgency (player already ok, hold or minor drift)
- `currentPassScore` low + player behind/level ball → boost
- `isAheadOfBall` → reduce (support behind ball is less relevant when already advanced)
- CM/CDM roles → natural boost from roleWeight

**`lateral_unmark`**
- `currentPassScore` very low → strong boost (player is a bad option → move to fix it)
- `localPressure` high → boost
- `localCrowding` high → boost
- Any role when heavily marked → natural answer

**`forward_penetration`**
- `isAheadOfBall` false → reduce (don't blindly charge from deep)
- `relativeAdvance` very high → reduce (already far ahead)
- ST/LW/RW roleWeight high
- Direct build-up → boost

**`width_gain`**
- Wide tactic → boost (teamWidthTactic ≥ 0.7)
- Narrow tactic → reduce
- LW/RW/LWB/RWB roleWeight high
- Player already wide → reduce (already in position)

#### Tactic multipliers (applied to role weights before context)

Build-up:
```
possession:
  support_behind_ball  × 1.4
  lateral_unmark       × 1.3
  forward_penetration  × 0.7

direct:
  support_behind_ball  × 0.7
  forward_penetration  × 1.4

balanced:
  all × 1.0
```

Width:
```
wide:
  width_gain × 1.5
narrow:
  width_gain × 0.4
```

---

## Stage 2 — Target Generation

### `generateOffBallTargets(intent, ctx): { x: number; y: number }[]`

Produces 4–8 candidate **positions** (not lane directions).

#### `support_behind_ball`
Generate pockets behind or level with ball position:
```
candidates:
  - ballHolder.x - attackDir * 8,  ballHolder.y
  - ballHolder.x - attackDir * 8,  ballHolder.y + 8
  - ballHolder.x - attackDir * 8,  ballHolder.y - 8
  - ballHolder.x - attackDir * 4,  ballHolder.y + 5
  - ballHolder.x - attackDir * 4,  ballHolder.y - 5
  - ballHolder.x,                  ballHolder.y + 10   (level, wide)
  - ballHolder.x,                  ballHolder.y - 10
```
All offset relative to ball holder. Not relative to player.

#### `lateral_unmark`
Generate positions left/right of current position with slight forward/back variation:
```
candidates:
  - player.x,                player.y + 8
  - player.x,                player.y - 8
  - player.x + attackDir*4,  player.y + 8
  - player.x + attackDir*4,  player.y - 8
  - player.x - attackDir*4,  player.y + 8
  - player.x - attackDir*4,  player.y - 8
```
The lateral offset (8 yards) can be tuned. These feel like "show for the ball" movements.

#### `forward_penetration`
Generate targets ahead in channels, replacing the current lane-from-goal scan:
```
candidates (using current carry lane angles as source):
  - forward straight
  - forward + diagonal left (~30°)
  - forward + diagonal right (~30°)
  - deeper forward (further lookahead)
  - channel-wide variants if vision > 0.6
```
Reuse `buildCandidateLanes` to generate directions, then convert to positions using `lookahead`.

#### `width_gain`
Generate outward targets toward player's touchline:
```
touchlineDir = player.y < PITCH_CENTER_Y ? -1 : 1
candidates:
  - player.x,                player.y + touchlineDir * 10
  - player.x,                player.y + touchlineDir * 15
  - player.x + attackDir*5,  player.y + touchlineDir * 10
  - player.x + attackDir*5,  player.y + touchlineDir * 15
  - player.x - attackDir*4,  player.y + touchlineDir * 10
```

---

## Stage 3 — Target Scoring

### `scoreOffBallTarget(intent, target, ctx): number`

```
score =
  spaceScore        * SPACE_WEIGHT
  + separationScore * SEPARATION_WEIGHT
  - roleFitPenalty  * ROLE_FIT_WEIGHT
  - ballRelPenalty  * BALL_REL_WEIGHT
  - offsidePenalty  * OFFSIDE_WEIGHT
```

#### Space score
Reuse spatial openness logic — how many opponents are near the target, how open the receiving zone is. Can reuse `evaluateCarryLane` pointed at the target direction.

#### Separation score
Keep existing `getSeparationScore(target.x, target.y, player, allPlayers)` — already works well.

#### Role-fit penalty (`getRoleFitPenalty`)
Soft penalty based on how far target is outside the role's expected zone:
```ts
function getRoleFitPenalty(player, target): number {
  const xOverrun = Math.max(0, (target.x - player.bounds.maxX) * player.attackDir);
  const yOverrun = Math.max(0,
    Math.max(target.y - player.bounds.maxY, player.bounds.minY - target.y)
  );
  return (xOverrun + yOverrun) * ROLE_FIT_PENALTY_SCALE;
}
```
This replaces hard movement blocking with a cost. Targets inside bounds have zero penalty. Targets outside bounds are penalized proportionally to how far they go.

Note: bounds still clamp the final executed position — this penalty just steers evaluation away from unreachable targets.

#### Ball-relation penalty
Intent-specific:
- `forward_penetration`: penalize if `relativeAdvance` very high (already too far ahead)
- `support_behind_ball`: penalize if target is farther from ball than needed
- `lateral_unmark`: light penalty if target doesn't improve pass angle geometry

#### Offside penalty
Keep existing formula:
```
overrun = (target.x - safeX) * attackDir
if overrun > 0: score -= overrun * OFFSIDE_AWARENESS * 0.15
```

---

## `scorePassToReceiver` Role After Refactor

Used **only** in `selectOffBallIntent` as a movement-need signal:

```ts
const currentPassScore = scorePassToReceiver(ballHolder, player, opponents);
const movementUrgency  = 1 - currentPassScore;  // high when player is a bad option
```

This feeds into intent scoring (e.g. boosts `lateral_unmark` when score is low).

It is **never** called per-target in Stage 3.

---

## Files To Change

| File | Change |
|------|--------|
| `OffBallMovement.ts` | Full rewrite into 3-stage pipeline |
| `OffBallConfig.ts` | Add tactic multipliers, space/separation/roleFit weights; remove old lane weights |
| `roles.json` | Add `offBallIntentWeights` per role under `engine` |
| `roleEngineData.ts` | Add `offBallIntentWeights` to `RoleEngineTuning` interface |
| `DecisionTree.ts` | No changes — `evaluateOffBall` signature stays the same |
| `gameState.ts` | No changes — commitment + execution path stays the same |
| `PassLanes.ts` | No changes |

---

## Implementation Phases

### Phase 1 — Structure
- Add `OffBallIntent` type
- Define `OffBallContext` and compute it at entry
- Extract `selectOffBallIntent(ctx)` — stub returning role's highest weight for now
- Extract `generateOffBallTargets(intent, ctx)` — implement all 4 families
- Extract `scoreOffBallTarget(intent, target, ctx)` — wire space + separation + offside
- Move `scorePassToReceiver` call to context building only

### Phase 2 — Intent logic
- Implement full `selectOffBallIntent` with context modifiers and tactic multipliers
- Add `offBallIntentWeights` to `roles.json` for all roles
- Add tactic multiplier config to `OffBallConfig.ts`

### Phase 3 — Role discipline
- Implement `getRoleFitPenalty`
- Remove `dropLaneBias` and `widthBias` from carry deltas (replaced by intent weights and width_gain family)
- Keep `offBallCarryDeltas` only for the carry-like spatial score inside `forward_penetration`

### Phase 4 — Cleanup
- Remove `buildCandidateLanes` (or keep only for `forward_penetration` targets)
- Remove `CREATE_SPACE_MIN_BIAS` threshold — replace with intent scoring naturally producing lower urgency for conservative roles
- Update `offball.md` to reflect new architecture

### Phase 5 — Tune
- Tune `offBallIntentWeights` by observing role behavior per tactic
- Add `half_space_show` and `occupy_last_line` intents only after Phase 4 is stable

---

## Non-Negotiables (constraints to preserve)

- `support_run: 5` and `create_space: 5` commit ticks unchanged
- No freeze logic during pass/shot flight
- Bounds clamp in `gameState.ts` execution stays
- Offside hard clamp in `gameState.ts` execution stays
- `scorePassToReceiver` stays as the pass quality signal — not projected
- `evaluateOffBall(player, ballHolder, allPlayers, offsideLine)` signature unchanged
- Return type stays `PlayerDecision` (`support_run | create_space | idle`)
