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
getTeamAttackWidth(team)   // AttackConfig.ts   → number 0..1          (lateral spread of the attacking slots, attackingAnchor)
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
| deep   | 0.40                  |
| normal | 0.60                  |
| high   | 0.75                  |

### `width` → defense config

| Width  | HORIZONTAL_COMPACTNESS | BLOCK_SHIFT_WEIGHT |
|--------|------------------------|--------------------|
| narrow | 0.80                   | 0.70               |
| normal | 0.60                   | 0.80               |
| wide   | 0.30                   | 0.90               |

### `width` → attacking width (lateral spread)

| Width  | `getTeamAttackWidth()` | spread of the attacking slots |
|--------|------------------------|-------------------------------|
| narrow | 0.45 | ×0.75 (pulled toward y 37) |
| normal | 0.60 | ×1 — the formation as drawn |
| wide   | 0.72 | ×1.2 (toward the touchlines, clamped 1 yd inside) |

Read by `attackingAnchor` (`AttackingPositioning.ts`, Etapa 19 / 3.4), the single attacking anchor
used by `computeAttackingPosition`, the off-ball run execution in `gameState.ts` (formation pull)
and the `hold_space` intent (`OffBallMovement.ts`): `y = 37 + (slot y − 37) × width / 0.6`. The same
helper then closes forward slots in on the box as the ball reaches the final third
(`ATTACK_CONFIG.BOX_CONVERGENCE`, see `.claude/rules/game/formations.md` → "Equilíbrio entre
formações"). Between the off-ball refactor to intents and 3.4 the attacking side of `width` had no
effect at all (`getTeamAttackWidth` was never read); only the defensive side (compactness, block
shift) and the `INTENT_WIDTH` hold_space multiplier worked.

Measured with `bun scripts/width-measure.ts` (PL, 4-3-3, both teams on the same width — so the
defensive side of the axis moves too):

| Width | matches | goals/match | shots/match | crosses/match | mean lateral distance of the team in possession from y 37 |
|---|---|---|---|---|---|
| narrow | 400 | 2.30 | 5.34 | 17.2 | 11.7 yd |
| normal | 400 | 2.41 | 5.63 | 16.9 | 13.5 yd |
| wide | 400 | 2.55 | 5.74 | 17.3 | 15.1 yd |

(two runs of 200 summed; the spread column is from the second run only.) The shape follows the
setting clearly; goals and shots move a few percent (narrow fewer, wide more), within the engine's
noise per run (±3–4%). Crosses don't change: they come from the wingers, whose touchline slot is
already near the edge.

### `build_up` → pass scoring weights

Positive weights (PROGRESS + LANE + SPACE + GOAL) sum to exactly **1.0** per style so `baseScore` never exceeds 1.0. Ratios preserved from design intent; DISTANCE_PENALTY and MIN_PASS_SCORE scaled by the same factor.

| Style      | PROGRESS_WEIGHT | LANE_WEIGHT | RECEIVER_SPACE_WEIGHT | GOAL_PROXIMITY_WEIGHT | DISTANCE_PENALTY_WEIGHT | MIN_PASS_SCORE |
|------------|-----------------|-------------|----------------------|-----------------------|------------------------|----------------|
| possession | 0.12            | 0.38        | 0.38                 | 0.12                  | 0.19                   | 0.38           |
| balanced   | 0.30            | 0.26        | 0.18                 | 0.26                  | 0.13                   | 0.39           |
| direct     | 0.44            | 0.15        | 0.11                 | 0.30                  | 0.04                   | 0.26           |

**possession** — safe, patient passing. Lane clarity and receiver space dominate. Long passes penalised more. Higher bar before a pass is attempted.

**direct** — progressive play. Forward progress dominates. Tight lanes and long balls are acceptable. Lower bar to attempt a pass.

`LONG_BALL_WEIGHT` (also a `TeamPassWeights` field) multiplies the raw long-ball score
(`DecisionTree.evalLongBall`, `.claude/rules/game-engine/aerial.md`):

| Style      | LONG_BALL_WEIGHT | Long balls / match (PL, both teams) | Keeper restarts played long |
|------------|------------------|--------------------------------------|-----------------------------|
| possession | 0.6              | ~0.7 | ~10% |
| balanced   | 1.0              | ~6.4 | ~43% |
| direct     | 1.3              | ~15.2 | ~86% |

The long-ball score is situational (pressure on the holder, marked short options, numbers at the
landing point), so the share moves with the game rather than flipping at a threshold.

`RECEIVER_ROLE_WEIGHT` (also a `TeamPassWeights` field) scales the receiver-role routing term (roles.json `passTargetWeight`, see pass.md → "Midfield as the Circulation Hub"):

| Style      | RECEIVER_ROLE_WEIGHT |
|------------|----------------------|
| possession | 0.14 — routes the most through midfield |
| balanced   | 0.10 |
| direct     | 0.06 — skips midfield more readily |

### `build_up` → carry lane weights

| Style      | CLEARANCE_WEIGHT | PROGRESS_WEIGHT | ANGLE_WEIGHT | CROWD_PENALTY_WEIGHT | MIN_TOTAL_SCORE |
|------------|-----------------|-----------------|--------------|---------------------|----------------|
| possession | 0.90            | 0.15            | 0.10         | 0.45                | 0.55           |
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
- Attacking lateral spread → `WIDTH_ATTACK_WIDTH` in `AttackConfig.ts` (read through `getTeamAttackWidth` by `attackingAnchor`)

### 2. Add the mapping

Add a new entry to the appropriate map (`BUILD_UP_PASS`, `BUILD_UP_CARRY`, or `WIDTH_ATTACK_WIDTH` in `AttackConfig.ts`; `mapAxesToDefense` in `DefenseConfig.ts`). Use the existing config's field names directly — do not invent new "bias" or "modifier" fields.

### 3. Update the consumer

The consumer reads from `getDefenseConfig(player.team)`, `getTeamPassConfig(holder.team)`, `getTeamCarryConfig(team)`, or `getTeamAttackWidth(team)`. No other changes are needed — the effective config is already read per-team per tick.

### 4. Update this document

Add the new tactic → weight row to the relevant table above.

---

## What NOT to do

- **Do not add bias fields** (e.g. `PROGRESS_BIAS`) that sit on top of existing weights. Instead, directly change the weight that represents that dimension.
- **Do not hardcode tactical logic in consumers** (PassLanes.ts, DecisionTree.ts, OffBallMovement.ts, etc.). All tactical influence belongs in the config mapping tables.
- **Do not read from global base configs** (e.g. `PASS_CONFIG.PROGRESS_WEIGHT`) in places where team-specific tactics should apply. Use `getTeamPassConfig(team)` instead.

---

## Mentalidade (live-match shift)

`Mentality = "attacking" | "balanced" | "defensive"` (`src/types/tacticsTypes.ts`) is a
**temporary, unsaved** shift a user can flip mid-match on top of the team's chosen
`TacticalStyle` — it never replaces the style. `axesWithMentality(style, mentality)` is the pure
function that combines them into the `TacticalAxes` actually applied:

| Mentality | pressing_style | defensive_line | width | build_up |
|---|---|---|---|---|
| `attacking` | one step up (saturates at `high_press`) | one step up (saturates at `high`) | forced `wide` | forced `direct` |
| `balanced` | `axesFor(style)` — unchanged | unchanged | unchanged | unchanged |
| `defensive` | one step down (saturates at `low_block`) | one step down (saturates at `deep`) | forced `narrow` | unchanged (keeps the style's build_up) |

"Step" walks `["low_block", "mid_block", "high_press"]` / `["deep", "normal", "high"]` by one
index in the given direction, clamped at the array ends — e.g. `high_press` style + `attacking`
mentality stays at `high_press` (already at the top), and `counter_attack` style (`low_block`) +
`attacking` mentality steps to `mid_block`, not straight to `high_press`.

`applyTeamTacticsConfig(team, style, mentality = "balanced")` and
`applyTeamAttackConfig(team, style, mentality = "balanced")` both take the optional `mentality`
parameter and call `axesWithMentality` internally instead of `axesFor` directly. Every existing
call site that only ever passed `style` keeps working unchanged (mentality defaults to
`"balanced"`, a no-op).

**The style, not the mentality, still drives team-intent detection.** `applyTeamAttackConfig`
always records the *style* in `TEAM_TACTICAL_STYLE[team]` (read by `getTeamTacticalStyle` /
`IntentDetection`) — mentality only reshapes the derived axes, it is invisible to intent gating.

**Where it's wired up:**
- `MatchScreen` — three buttons (attacking / balanced / defensive) apply to team A only; team B
  (AI) always stays `balanced`. Resets to `balanced` every match; never saved.
- `/test` (`TestScreen`) — a per-team mentality button row next to the tactical-style selector.
- `/lab` — `Variant.mentality?: Mentality` (optional, default `balanced` when absent — this is lab
  scenario config, not a game save, so no migration is needed for older saved scenarios). Set in
  `VariantEditor`, applied in `balanceWorker.ts` alongside the style, shown in the auto-generated
  variant label (`generateVariantLabel`) only when it isn't `balanced`.

---

## Familiaridade com o estilo (Etapa 15)

`applyTeamTacticsConfig`/`applyTeamAttackConfig` aceitam um 5º parâmetro opcional `familiarity`
(`FamiliarityLevels`). Depois de montar os pesos do estilo (e da mentalidade), aplicam os ajustes da
tabela `STYLE_FAMILIARITY_EFFECTS` (`src/GameEngine/Configs/FamiliarityConfig.ts`) escalados por
`familiarityFactor` — só sobre pesos que o estilo já dirige, nenhum campo novo de viés. Familiaridade 50 /
ausente = pesos idênticos. `DefenseConfigValues.PRESS_STAMINA_MULT` (1,10 em `high_press`) é o custo de
fôlego do press. O mesmo `applyTeamAttackConfig` define o multiplicador de execução do time (atributos), lido
na montagem do estado. Ver `.claude/rules/game/style-training.md`.
