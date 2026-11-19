# Defensive Positioning — Current Implementation

## Files

| File | Role |
|------|------|
| `Domain/DefensivePositioning.ts` | All positioning: GK arc, shape anchor, intent scoring, mark/carry-lane targets |
| `Configs/DefenseConfig.ts` | Per-team numeric weights; `applyTeamTacticsConfig()`; tactic key storage |
| `Configs/DefensiveIntentConfig.ts` | Static intent scoring constants and tactic multiplier tables |
| `Domain/DecisionTree.ts` | `evaluateDefensiveDecision()` — scores and caches the intent per player |
| `Domain/gameState.ts` | Calls positioning; executes movement |

---

## Entry Point

`computeDefensivePosition(player, ballPos, allPlayers, formation, ballHolderId, playerDecision, markTargetId)`

Called from `computeTargetPosition()` in `Positioning.ts` when the player's team does not have the ball.
Returns `{ x, y }` — hard-clamped to `player.bounds` before returning.

Mark assignments are pre-computed once per tick via `assignMarkTargets(allPlayers, defendingTeam)` in `gameState.ts`.

---

## GK: Angle-Bisector Semicircle Positioning

GKs bypass the entire outfield pipeline. They receive an **early return** at the top of `computeDefensivePosition`:

```ts
if (player.role === 'GK') {
  return computeGKSemicirclePosition(player, ballPos);
}
```

`computeGKSemicirclePosition` positions the GK on the line from the goal centre toward the ball, at a come-out distance that narrows the shooting angle:

```ts
const goalCenterY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;
const comeOut = GK_MIN_COME_OUT
  + (GK_MAX_COME_OUT - GK_MIN_COME_OUT) * Math.max(0, 1 - dist / GK_COME_OUT_DIST);

rawX = goalX + (dx / dist) * comeOut;
rawY = goalCenterY + (dy / dist) * comeOut;
```

| Constant | Value | Meaning |
|---|---|---|
| `GK_MIN_COME_OUT` | 0.5 yds | Always slightly off the line |
| `GK_MAX_COME_OUT` | 6.0 yds | Fully extended when attacker is at ≤ 20 yds |
| `GK_COME_OUT_DIST` | 20 yds | Retreat linearly beyond this distance |

Position is bounds-clamped. Constants live in `ActionOutcomes.ts` (shared with `computeGKPositionQuality`).

---

## Outfield: Scored Intent System

Outfield defensive decisions go through a **scored intent pipeline** — not a heuristic stage chain. The intent is computed once per tick in `evaluateDefensiveDecision()` (DecisionTree.ts), cached in `_intentCache[player.id]`, and read here for positioning.

### Active Intents

| Intent | Positioning behaviour |
|---|---|
| `hold_shape` | Shape anchor only — depth track + compactness + lane block |
| `track_mark` | Shape anchor + threat-based mark/lane-cut pull |
| `press_holder` | Shape anchor only — movement executed by gameState (press decision) |
| `step_into_carry_lane` | Intercept point on the ball carrier's path toward own goal |

`cover_pass_lane` is scored but currently maps to shape anchor (not yet a distinct target).

---

## Shape Anchor (`computeDefensiveShapeAnchor`)

The base position all intents start from. Four sequential adjustments:

### X: Ball-Relative Depth Tracking

```ts
const depthOffset = (1.0 - cfg.DEFENSIVE_LINE_HEIGHT) * DEPTH_OFFSET_RANGE + DEPTH_OFFSET_BASE;
const ballLineX   = ballPos.x - player.attackDir * depthOffset;
rawX += (ballLineX - rawX) * X_TRACK_WEIGHT;
```

| Constant | Value |
|---|---|
| `DEPTH_OFFSET_BASE` | 10 yds |
| `DEPTH_OFFSET_RANGE` | 40 yds |
| `X_TRACK_WEIGHT` | 0.6 |

Effective depth behind ball by tactic:

| `defensive_line` | DLH | Depth |
|---|---|---|
| `deep` | 0.40 | ≈ 34 yds |
| `normal` | 0.60 | ≈ 26 yds |
| `high` | 0.75 | ≈ 20 yds |

### Y: Lateral Block Shift

```ts
const blockShiftY = (ballPos.y - base.y) * cfg.BLOCK_SHIFT_WEIGHT * BLOCK_SHIFT_SCALE; // 0.45
rawY = base.y + blockShiftY;
```

`BLOCK_SHIFT_SCALE` was 0.15 until 3.4 (Etapa 19, #63): the block slid only ~12% of the ball's
lateral offset, so each formation defended where its slots were drawn and the shape alone decided
matches (narrow shapes unbeatable, wide shapes leaving the centre open). At 0.45 (× the `normal`
width's 0.8 = 36%) a far-side winger tucks in ~20 yards when the ball is on the other flank. See
`.claude/rules/game/formations.md` → "Equilíbrio entre formações".

### Y: Horizontal Compactness

```ts
rawY += (PITCH_CENTER_Y - rawY) * cfg.HORIZONTAL_COMPACTNESS * COMPACTNESS_SCALE; // 0.12
```

### X: Lane Blocking

```ts
const laneTarget = ownGoalX + ballSide * 0.7;
rawX += (laneTarget - rawX) * cfg.LANE_BLOCK_WEIGHT * 0.15;
```

---

## Track Mark Target (`computeTrackMarkTarget`)

Used when intent is `track_mark`. Blends shape anchor toward the ball→mark passing lane, scaled by threat.

Threat uses a non-linear curve for earlier engagement at medium danger:

```ts
const threat       = Math.max(0, 1 - distFromOwnGoal / cfg.THREAT_HORIZON);
const threatCurved = 1 - Math.pow(1 - threat, 1.5);
```

| Constant | Value |
|---|---|
| `MARK_PULL_MAX` | 0.90 |
| `MARK_PULL_MIN` | 0.30 |
| `MARK_LANE_T_CLOSE` | 0.75 |
| `MARK_LANE_T_FAR` | 0.30 |
| `THREAT_HORIZON` | 100 yds |

---

## Carry Lane Intercept (`computeCarryLaneIntercept`)

Used when intent is `step_into_carry_lane`. Projects the ball holder's path toward own goal by `CARRY_LANE_LOOKAHEAD` yards and returns the closest point on that path to the defender.

```ts
// Projects holder CARRY_LANE_LOOKAHEAD yds toward own goal
// Returns the intercept point the defender should move to
```

| Constant | Value |
|---|---|
| `CARRY_LANE_LOOKAHEAD` | 8 yds |
| `CORRIDOR_HALF_WIDTH` | 8 yds |

---

## Intent Scoring (`evaluateDefensiveDecision` in DecisionTree.ts)

Each intent is scored from role weights × tactic multipliers × context signals. The highest-scoring intent is cached and used in `computeDefensivePosition`.

### Tactic multiplier tables (DefensiveIntentConfig.ts)

**`pressing_style`:**

| Style | hold_shape | track_mark | press_holder | step_into_carry_lane |
|---|---|---|---|---|
| `low_block` | 1.4 | 1.2 | 0.3 | 0.6 |
| `mid_block` | 1.0 | 1.0 | 1.0 | 1.0 |
| `high_press` | 0.75 | 0.9 | 1.4 | 1.1 |

**`defensive_line`:**

| Line | hold_shape | track_mark | press_holder | step_into_carry_lane |
|---|---|---|---|---|
| `deep` | 1.3 | 1.2 | 0.6 | 1.1 |
| `normal` | 1.0 | 1.0 | 1.0 | 1.0 |
| `high` | 0.7 | 0.9 | 1.4 | 0.9 |

### Role intent weights (roles.json `engine.defensiveIntentWeights`)

Current values (corrected 2026-10-05, Etapa 27 — the earlier table predated a retune):

| Role | hold_shape | track_mark | press_holder | step_into_carry_lane |
|---|---|---|---|---|
| CB | 0.70 | 0.50 | 0.50 | 0.50 |
| LB/RB | 0.70 | 0.50 | 0.50 | 0.50 |
| LWB/RWB | 0.70 | 0.50 | 0.50 | 0.50 |
| CDM | 0.50 | 0.50 | 0.70 | 0.50 |
| CM | 0.50 | 0.50 | 0.70 | 0.50 |
| CAM | 0.50 | 0.50 | 0.50 | 0.50 |
| LM/RM | 0.50 | 0.50 | 0.50 | 0.50 |
| LW/RW | 0.50 | 0.50 | 0.50 | 0.50 |
| ST | 0.10 | 0.50 | 0.50 | 0.50 |
| GK | 0.00 | 0.00 | 0.00 | 0.00 (never reaches intent scoring) |

The weights are read per player through `engineOf(player)` / `defensiveWeightsOf(player)`: a slot
instruction (role variant, individual pressing) replaces or scales them, and a man-marker defends
with `track_mark` 0.9 / `hold_shape` 0.3 (`MAN_MARK_CONFIG`, `.claude/rules/game/player-instructions.md`).

---

## Tackle and Press (DecisionTree.ts)

These are decisions, not positioning intents:

```
dist ≤ TACKLE_RANGE (2.0 yds)  → tackle  (always, no cooldown check needed)
evaluateDefensiveDecision scores press_holder high enough → press
```

GK never receives a press decision (early `idle` return in `decide()`).

Press commit: `press: 8` ticks — prevents the presser abandoning pursuit each re-evaluation.

---

## DefenseConfig — Defaults and Tactic Mappings

### Defaults

| Key | Default | Meaning |
|---|---|---|
| `DEFENSIVE_LINE_HEIGHT` | 0.50 | 0 = deep, 1 = high line |
| `HORIZONTAL_COMPACTNESS` | 0.60 | Y squeeze toward center |
| `PRESS_INTENSITY` | 0.50 | Secondary press range multiplier |
| `PRESS_ACCEL_SPEED_BOOST` | 0.8 yds/s | Speed added when pressing |
| `BLOCK_SHIFT_WEIGHT` | 0.80 | Lateral block-follows-ball strength |
| `LANE_BLOCK_WEIGHT` | 0.40 | X nudge toward ball-goal corridor |
| `MARK_PULL_MAX` | 0.90 | |
| `MARK_PULL_MIN` | 0.30 | |
| `THREAT_HORIZON` | 100 yds | |

### Tactic → Config Mappings

**`pressing_style`:**

| Style | PRESS_INTENSITY | TACKLE_AGGRESSION |
|---|---|---|
| `low_block` | 0.20 | 0.25 |
| `mid_block` | 0.50 | 0.40 |
| `high_press` | 0.85 | 0.65 |

**`defensive_line`:**

| Line | DEFENSIVE_LINE_HEIGHT |
|---|---|
| `deep` | 0.40 |
| `normal` | 0.60 |
| `high` | 0.75 |

**`width`:**

| Width | HORIZONTAL_COMPACTNESS | BLOCK_SHIFT_WEIGHT |
|---|---|---|
| `narrow` | 0.80 | 0.70 |
| `normal` | 0.60 | 0.80 |
| `wide` | 0.30 | 0.90 |

---

## What Is Not Yet Implemented

- `TACKLE_AGGRESSION` is not used by positioning or the tackle decision — only by the foul chance (`fouls.md`)
- `cover_pass_lane` intent is scored but has no distinct target — falls back to shape anchor
- Full press migration from rank/range gate to pure score-based (Phase 8b of `docs/superpowers/archive/defensive-decision-migration-plan.md`) is pending

## Race losers of a contested ball (#145)

The tick a through / high / loose ball is collected, the chasers of the side that lost the race stop chasing and are beaten for 0.7 s (no decision, no tackle, 5% speed) before they rejoin the shape; before, they kept sprinting to the old landing point next to the new holder, bunching 3–4 players on the ball. Numbers and the ball-cluster metric: `through-ball.md` → "Chase ends with the ball".

## Goleiro ativo (7.7)

`computeGKSemicirclePosition` saiu: o goleiro usa `keeperDefendingTarget` (`Domain/Keeper.ts`: arco, saída no 1 contra 1) e,
com o próprio time com a bola, `keeperAttackingTarget`. Ver `.claude/rules/game-engine/keeper.md`.

## Cohesão da linha e bola prevista (inspirado no FM)

`Configs/CohesionConfig.ts` (`COHESION`), `Domain/BallPrediction.ts` (`predictBallPoint`), `lineCohesionPull` em `DefensivePositioning.ts`.

- **Bola prevista:** a âncora da forma defensiva (deslocamento lateral do bloco, profundidade da linha, bloqueio do corredor) lê onde a bola vai estar daqui a `PREDICT_S` (0,4 s reais): a corrida do portador que conduz (`carry`: velocidade de condução), o voo do passe ou da bola alta, o rolar da bola solta (com a desaceleração), no máximo `PREDICT_MAX_YDS` (12) à frente. Chute no ar, portador parado ou sem portador: a bola real. Desarme, pressão, marcação e corredor de condução seguem a bola real. Calculada uma vez por tick em `gameState.ts` e passada a `computeTargetPosition` (`shapeBallPos`). A intenção defensiva (decisão) não muda.
- **Cohesão:** um defensor da linha (CB, LB, RB, LWB, RWB) em `hold_shape` ou `track_mark` (nunca o marcador individual) cujo alvo fica a mais de `MAX_GAP` (14) jardas, de lado, do parceiro de linha mais perto (outro defensor a até `LINE_DEPTH` 10 jardas ao longo do campo) é puxado para ele pelo excesso × `STRENGTH` (1), pela metade quando os dois são o mais perto um do outro, no máximo `MAX_PULL` (4) jardas. Só lateral: nunca o leva para trás nem à frente da linha. Os limites da vaga (ou o campo, nas intenções de engajamento) continuam valendo.
- **Por que não os 5 m do FM:** a linha do motor fica a 9–15 jardas entre parceiros (`bun scripts/line-gaps-probe.ts`: vão médio 11,8, 25% acima de 15). Com 5,5 todo par era puxado, o zagueiro ia para o lateral (o mais perto dele) e abria o meio: o buraco cresceu e os gols subiram 15%. Com a previsão em 0,6 s sozinha os gols caíram 8% (a linha recuava cedo demais a cada condução).
- `/test`: overlay **Cohesion** (anel ciano = bola prevista, linha âmbar = par esticado e o puxão) e o cenário `defensive-cohesion`. `/lab`: nada novo (o buraco por tick custaria ~1000 contas por tick em toda partida). `COHESION_OVERRIDES` (JSON) nos workers de `ball-cluster.ts` e `ai-formation-goals.ts`; `SEED_RANDOM=1` no `ball-cluster.ts` semeia o `Math.random` por jogo (braços pareados).

Medição (`SEED_RANDOM=1 bun scripts/ball-cluster.ts --leagues premier_league,of_championship --modes ai --engine 800 --offset 1000`, antes = `{"ENABLED":false}`; por jogo, os dois times; buraco = maior vão do lado do gol e células abertas, só com a bola dominada):

| | Premier antes | depois | Championship antes | depois |
|---|---|---|---|---|
| Gols | 1,94 | 1,96 | 1,68 | 1,75 |
| Chutes | 5,53 | 5,50 | 5,16 | 5,22 |
| Passes | 51,8 | 49,6 | 47,5 | 46,2 |
| Defensores a ≤ 8 jd da bola | 0,960 | 0,962 | 1,025 | 1,020 |
| Buraco: maior vão (jd) | 38,34 | 38,30 | 38,91 | 38,84 |
| Buraco: células abertas | 23,21 | 23,17 | 23,38 | 23,36 |

As duas ligas somadas: gols +2,5%, chutes +0,3%. O buraco diminui pouco (o maior vão é quase sempre uma célula de canto perto da própria linha de fundo, que a linha não cobre), mas na mesma direção nas três amostras (400 jogos, 400 com outra configuração e 800). Variantes de 400 jogos, gols somados contra o antes: só a previsão 0,6 s −8%; só a cohesão 5,5 +15%; as duas (5,5 / 0,6) +5%; 14 / 0,6 +9%; 10 / 0,6 +4% (buraco maior); 14 / 0,4 +3% (escolhida).

Sem semente (`bun scripts/ai-formation-goals.ts --engine 800 --modes ai --quick 0`, antes com `COHESION_OVERRIDES='{"ENABLED":false}'`): Premier 2,042 → 1,949 gols, 5,56 → 5,70 chutes; Championship 1,594 → 1,699, 5,16 → 5,29; somadas gols +0,3%, chutes +2,5%. Dentro de ±5%: quickSim não recalibrado. Matriz de formações não refeita.

## Back line, second presser, anticipation (stage 4)

The zonal back-liners holding shape also blend toward one robust-mean back line with hold / step-up / drop states; a second
defender pressing a holder already pressed stands off 5 yd covering the inside route; anticipation moves the press start to
the holder's predicted point. Rules, constants and numbers: `movement.md`.
