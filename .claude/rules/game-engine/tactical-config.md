# Tactical Config System

## Core Principle

Every tactic setting maps directly to **existing engine config weights** — it never adds new bias fields.

The pattern is:

```
base config (PASS_CONFIG, CARRY_CONFIG, ...)
  + team's tactic settings
  = effective team config
```

Consumers always read from the effective team config, never from the base global config directly.

---

## Architecture

### Three apply functions — one per side of the game + attack width

```ts
applyTeamTacticsConfig(team, tactics)  // DefenseConfig.ts  — pressing, line, width (defense side)
applyTeamAttackConfig(team, tactics)   // AttackConfig.ts   — build_up → pass + carry weights, width → attack width
```

Both are called together whenever tactics change (e.g. in the TestScreen `useEffect`).

### Per-team storage

Each system (defense, attack) keeps two independent config objects — one per team.

When Team A uses `high_press` and Team B uses `low_block`, the engine reads the correct config for each player's team on every tick.

### Getters for consumers

```ts
getDefenseConfig(team)     // DefenseConfig.ts  → DefenseConfigValues  (positioning, pressing, tackle)
getTeamPassConfig(team)    // AttackConfig.ts   → typeof PASS_CONFIG   (pass scoring weights)
getTeamCarryConfig(team)   // AttackConfig.ts   → typeof CARRY_CONFIG  (carry lane weights)
getTeamAttackWidth(team)   // AttackConfig.ts   → number 0..1          (width multiplier for off-ball runs)
```

**Key rule**: consumers that run when a player has the ball (PassLanes, carry, off-ball) import from `AttackConfig`. Consumers that run when a player is defending import from `DefenseConfig`.

---

## Tactic → Weight Mapping

### `pressing_style` → defense config

| Style       | PRESSING_LINE_HEIGHT | PRESS_INTENSITY | TACKLE_AGGRESSION |
|-------------|---------------------|-----------------|-------------------|
| low_block   | 0.28                | 0.20            | 0.25              |
| mid_block   | 0.55                | 0.50            | 0.40              |
| high_press  | 0.80                | 0.85            | 0.65              |

### `defensive_line` → defense config

| Line   | DEFENSIVE_LINE_HEIGHT |
|--------|-----------------------|
| deep   | 0.20                  |
| normal | 0.50                  |
| high   | 0.72                  |

### `width` → defense config

| Width  | HORIZONTAL_COMPACTNESS | BLOCK_SHIFT_WEIGHT |
|--------|------------------------|--------------------|
| narrow | 0.80                   | 0.70               |
| normal | 0.60                   | 0.80               |
| wide   | 0.30                   | 0.90               |

### `width` → attacking width multiplier

| Width  | `getTeamAttackWidth()` |
|--------|------------------------|
| narrow | 0.3 |
| normal | 0.6 |
| wide   | 0.9 |

Used by `OffBallMovement.ts` to scale `widthBias` on off-ball runs — narrow tactics suppress wide runs; wide tactics amplify them.

### `build_up` → pass scoring weights

Positive weights (PROGRESS + LANE + SPACE + GOAL) sum to exactly **1.0** per style so `baseScore` never exceeds 1.0. Ratios preserved from design intent; DISTANCE_PENALTY and MIN_PASS_SCORE scaled by the same factor.

| Style      | PROGRESS_WEIGHT | LANE_WEIGHT | RECEIVER_SPACE_WEIGHT | GOAL_PROXIMITY_WEIGHT | DISTANCE_PENALTY_WEIGHT | MIN_PASS_SCORE |
|------------|-----------------|-------------|----------------------|-----------------------|------------------------|----------------|
| possession | 0.12            | 0.38        | 0.38                 | 0.12                  | 0.19                   | 0.38           |
| balanced   | 0.30            | 0.26        | 0.18                 | 0.26                  | 0.13                   | 0.39           |
| direct     | 0.44            | 0.15        | 0.11                 | 0.30                  | 0.04                   | 0.26           |

**possession** — safe, patient passing. Lane clarity and receiver space dominate. Long passes penalised more. Higher bar before a pass is attempted.

**direct** — progressive play. Forward progress dominates. Tight lanes and long balls are acceptable. Lower bar to attempt a pass.

`RECEIVER_ROLE_WEIGHT` (also a `TeamPassWeights` field) scales the receiver-role routing term (roles.json `passTargetWeight`, see pass.md → "Midfield as the Circulation Hub"):

| Style      | RECEIVER_ROLE_WEIGHT |
|------------|----------------------|
| possession | 0.14 — routes the most through midfield |
| balanced   | 0.10 |
| direct     | 0.06 — skips midfield more readily |

### `build_up` → carry lane weights

| Style      | CLEARANCE_WEIGHT | PROGRESS_WEIGHT | ANGLE_WEIGHT | CROWD_PENALTY_WEIGHT | MIN_TOTAL_SCORE |
|------------|-----------------|-----------------|--------------|---------------------|----------------|
| possession | 0.50            | 0.15            | 0.15         | 0.45                | 0.55           |
| balanced   | defaults        | defaults        | defaults     | defaults            | defaults       |
| direct     | 0.25            | 0.50            | 0.15         | 0.15                | 0.35           |

**possession** — safety first; clearance and crowd avoidance dominate. Only carry when clearly safe.

**direct** — progress dominates; less worried about clearance/crowd. More willing to carry in tight situations.

---

## How to Add a New Tactic Effect

### 1. Identify which config the tactic should modify

- Defensive behaviour → `DefenseConfigValues` in `DefenseConfig.ts`
- Pass selection → `TeamPassWeights` in `AttackConfig.ts`
- Carry decisions → `TeamCarryWeights` in `AttackConfig.ts`
- Off-ball width runs → `TEAM_ATTACK_WIDTH` in `AttackConfig.ts`

### 2. Add the mapping

Add a new entry to the appropriate map (`BUILD_UP_PASS`, `BUILD_UP_CARRY`, or `WIDTH_ATTACK_WIDTH` in `AttackConfig.ts`; `mapTacticsToDefense` in `DefenseConfig.ts`). Use the existing config's field names directly — do not invent new "bias" or "modifier" fields.

### 3. Update the consumer

The consumer reads from `getDefenseConfig(player.team)`, `getTeamPassConfig(holder.team)`, `getTeamCarryConfig(team)`, or `getTeamAttackWidth(team)`. No other changes are needed — the effective config is already read per-team per tick.

### 4. Update this document

Add the new tactic → weight row to the relevant table above.

---

## What NOT to do

- **Do not add bias fields** (e.g. `PROGRESS_BIAS`) that sit on top of existing weights. Instead, directly change the weight that represents that dimension.
- **Do not hardcode tactical logic in consumers** (PassLanes.ts, DecisionTree.ts, OffBallMovement.ts, etc.). All tactical influence belongs in the config mapping tables.
- **Do not read from global base configs** (e.g. `PASS_CONFIG.PROGRESS_WEIGHT`) in places where team-specific tactics should apply. Use `getTeamPassConfig(team)` instead.
