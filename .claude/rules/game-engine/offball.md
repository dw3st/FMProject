Below is a **condensed business-rules document** describing how off-ball movement works in the engine. It explains the system behavior and design logic rather than implementation steps.

---

# Off-Ball Movement — Business Rules

## Purpose

Off-ball movement determines what attacking teammates (without the ball) do instead of standing idle. The goal is to simulate believable off-ball intelligence: players making **support runs into space** or **creating space** by moving away from pressure.

The system applies **only to the attacking team** — defenders are never affected. Goalkeepers are also excluded.

---

## Core Principle

> Off-ball movement = "where would I carry if I had the ball?"

The system reuses the **same carry lane evaluation model** used for on-ball decisions. Instead of choosing a direction to dribble, it evaluates directions to **run into** as a potential receiving position.

The carry-like scoring is **role-aware**: each role applies its own weight deltas (via `OFF_BALL_ROLE_CARRY_DELTAS`) on top of the team's tactical carry config, so a CM naturally prioritises clearance and support whereas a ST prioritises forward progress.

---

# Entry Condition

A player receives an off-ball decision when ALL of these are true:

* The player's team **has the ball** (attacking phase)
* The player is **not the ball holder**
* The player is **not a GK**
* **No pass or shot is in flight** — during pass/shot flight, the player inherits its decision from the previous tick instead of re-evaluating (prevents shaking caused by the offside line shifting as the ball moves)
* The base `decide()` function returned `idle` for this player

The off-ball evaluation is injected **after** the main decision loop in `gameState.ts`, not inside `DecisionTree.ts`. This avoids circular dependencies since `OffBallMovement.ts` imports from `DecisionTree.ts`.

---

# Decision Types

Two decision types exist:

| Type | Meaning | When chosen |
|------|---------|-------------|
| `support_run` | Move into a good receiving position | Best lane score ≥ `MIN_SCORE_THRESHOLD` |
| `create_space` | Move away from nearest opponent | All lanes score below threshold (offensive roles only) |

Both carry a direction vector `{ dx, dy }` that determines the movement target.

---

# Candidate Lane Generation

The base direction points from the player **toward the attacking goal**.

Candidate lanes are generated in increasing numbers based on the player's `carryVision` stat (normalised to 0..1):

| Vision (normalised) | Lanes scanned | Angles covered |
|---------------------|---------------|----------------|
| Any (base)          | 3             | Forward, ±30° |
| > 0.4               | 5             | + ±15° |
| > 0.6               | 7             | + ±45° |
| > 0.8               | 10            | + ±60°, −90° (lateral) |

**Drop lane:** When the player is ahead of the ball holder (positive `relativeAdvance`), an extra lane pointing **straight backward** (against attack direction: `{ dx: -attackDir, dy: 0 }`) is injected. It does NOT point at the ball holder's position — it drops the player into receiving space in front of the holder rather than converging on the congested area around the ball. The role's `dropLaneBias` flat bonus rewards this lane — CDM/CM heavily prefer it; forwards almost never take it.

---

# Lane Scoring

Each candidate lane receives a **composite score** from three independent factors plus several bonuses/penalties.

## Factor 1: Carry-Like Score (weight: 0.40)

Reuses `evaluateCarryLane()` from `DecisionTree.ts`. Evaluates:

* **Clearance** — how free the lane is from opponents (30° cone scan)
* **Forward progress** — how much the lane advances toward goal
* **Goal angle** — alignment with the goal opening
* **Crowd penalty** — number of opponents near the projected target position
* **Player modifiers** — speed, acceleration, vision bonuses and pressure penalty

The carry config used is **role-aware**: `getOffBallCarryConfig(player.role, getTeamCarryConfig(team))` layers role deltas on top of the tactical carry config (see Role-Aware Carry Weights below).

## Factor 2: Pass Availability Score (weight: 0.35)

Evaluates whether the ball holder could realistically pass to the player's **current position** using the same scoring as `PassLanes.ts` — implemented via `scorePassToReceiver(ballHolder, player, opponents)`.

This is the full tactics-aware pass score, identical to what `evaluatePassLanes` computes per receiver:

* **Lane quality** — continuous 0..1 ramp based on perpendicular clearance from opponents along the pass line (uses `BLOCK_RADIUS` / `CLEAR_RADIUS` thresholds)
* **Forward progress** — how much the pass advances toward goal
* **Receiver space** — nearest opponent distance + crowding count around the player
* **Goal proximity bonus** — quadratic ramp inside the attacking third, weighted by open angle to goal
* **Distance penalty** — grows with pass length
* **Player modifier** — holder's `passingSkill` + `vision`, receiver's `firstTouch`
* **Tactical weights** — comes from `getTeamPassConfig(holder.team)`, so `build_up` style (possession/balanced/direct) affects all these weights

Note: the score is evaluated at the player's **current position** (same for every lane), so it acts as a player-level modifier rather than a lane-differentiating factor.

## Factor 3: Separation Score (weight: 0.25)

Anti-clustering penalty. **Evaluated at the projected target position** (not current position) so lanes running into crowded zones are penalised before the player commits.

All nearby teammates contribute — not just the nearest — so a cluster of three players running to the same zone is punished more than two.

* `score -= (1 - d / IDEAL_SPACING) × CLUSTER_PENALTY_PER_PLAYER` for each teammate inside `IDEAL_SPACING`
* `IDEAL_SPACING = 15 yards`, `CLUSTER_PENALTY_PER_PLAYER = 0.35`
* Score clamped to `[0, 1]`

## Vision Bonus

Flat bonus: `visionNorm × 0.12`

## Ball Advance Penalty

When a player is already far ahead of the ball holder, forward-going lanes are penalised to stop attackers blindly charging offside while the ball is still in the defensive half.

```
relativeAdvance = (player.x - ballHolder.x) × player.attackDir
isForwardLane   = lane.dx × player.attackDir > 0.3

if isForwardLane and relativeAdvance > MAX_ADVANCE_THRESHOLD (10 yds):
    excess  = relativeAdvance - MAX_ADVANCE_THRESHOLD
    range   = MAX_ADVANCE_AHEAD (30) - MAX_ADVANCE_THRESHOLD (10)
    t       = min(1, excess / range)
    factor  = 1 - t × (1 - MAX_ADVANCE_FLOOR (0.1))
    score  *= factor
```

Lateral and drop-back lanes are unaffected — the player can still drop to receive or move sideways.

## Drop Lane Bonus

`score += dropLaneBias` applied only to the injected drop lane. Role values:

| Role | dropLaneBias | Behaviour |
|------|-------------|-----------|
| CDM  | 0.95 | Almost always drops to support defenders |
| CM   | 0.80 | Strongly prefers drop lane |
| CAM  | 0.50 | Often drops |
| LM/RM | 0.15 | Sometimes drops |
| LW/RW | 0.05 | Rarely drops |
| ST    | 0.00 | Never drops |

## Width Bonus

`score += widthBias × max(0, lane.dy × touchlineDir)`

Where `touchlineDir` is derived from the player's Y position (−1 for left side, +1 for right side), so both LW and RW correctly reward lanes toward their respective touchline.

`widthBias` is further **scaled by `getTeamAttackWidth(team)`** (0.3 narrow / 0.6 normal / 0.9 wide), so narrow tactics suppress wide runs and wide tactics amplify them.

| Role | widthBias (unscaled) |
|------|---------------------|
| LW/RW | 0.35 |
| LWB/RWB | 0.30 |
| LM/RM | 0.20 |
| LB/RB | 0.15 |
| CM/ST/CAM/CDM/CB | 0.00 |

---

# Role-Aware Carry Weights

`OFF_BALL_ROLE_CARRY_DELTAS` in `OffBallConfig.ts` stores per-role adjustments to the four carry scoring weights. Applied by `getOffBallCarryConfig(role, teamCfg)` which adds deltas and clamps each weight to `[0, 1]`.

| Role | clearance | progress | angle | crowd |
|------|-----------|----------|-------|-------|
| ST   | −0.10 | +0.15 | +0.05 | −0.05 |
| LW/RW | −0.05 | +0.10 | −0.05 | −0.05 |
| CAM  | 0.00  | +0.05 | 0.00  | 0.00  |
| CM   | +0.12 | −0.10 | −0.05 | +0.05 |
| LM/RM | +0.10 | −0.08 | −0.05 | +0.05 |
| CDM  | +0.15 | −0.15 | −0.05 | +0.10 |
| LB/RB | +0.15 | −0.20 | −0.05 | +0.10 |
| LWB/RWB | +0.12 | −0.15 | −0.05 | +0.08 |
| CB   | +0.18 | −0.22 | −0.05 | +0.12 |
| GK   | 0.00  | 0.00  | 0.00  | 0.00  |

Design intent: **Forwards → progress dominant, rarely drop**. **Central MFs → clearance dominant, support defenders**. **Wide backs → width preference, drop to support**. **Defenders → heavy clearance bias, minimal forward interest**.

---

# Role Bias (Movement Distance)

Role bias does NOT affect lane scoring. It scales the **movement distance** (lookahead) during execution:

```
effectiveLookahead = baseLookahead × roleBias
```

| Role | Bias | Lookahead |
|------|------|-----------|
| ST | 1.0 | full ~8–16 yds |
| LW, RW | 0.9 | ~7–14 yds |
| CAM | 0.8 | ~6–13 yds |
| LM, RM | 0.7 | ~6–11 yds |
| CM | 0.6 | ~5–10 yds |
| CDM | 0.3 | ~2–5 yds |
| LWB, RWB | 0.25 | ~2–4 yds |
| LB, RB | 0.15 | ~1–2 yds |
| CB | 0.1 | ~1 yd |
| GK | 0.0 | excluded |

**Fallback behavior:**

When no lane scores above `MIN_SCORE_THRESHOLD`:
- Roles with bias ≥ 0.5 (ST, LW, RW, CAM, CM, LM, RM) → `create_space`
- Roles with bias < 0.5 (CDM, LWB, RWB, LB, RB, CB) → `idle`

---

# Offside Awareness

Off-ball runs respect the offside rule through two layers:

## Layer 1: Soft Penalty During Evaluation

```
overrun = (projectedX - safeX) × attackDir
if overrun > 0:
    rawScore -= overrun × OFFSIDE_AWARENESS × 0.15
```

* `OFFSIDE_AWARENESS = 0.85`, `OFFSIDE_MARGIN = 1.0 yard`

## Layer 2: Hard Clamp During Movement

Movement execution in `gameState.ts` hard-clamps the target X to `offsideLine - attackDir × OFFSIDE_MARGIN`. The player physically cannot run past it.

---

# Movement Execution

## Lookahead Distance

```
lookahead = BASE_LOOKAHEAD + (MAX_LOOKAHEAD - BASE_LOOKAHEAD) × visionNorm
```

* `BASE_LOOKAHEAD = 8 yards`, `MAX_LOOKAHEAD = 16 yards`

## Formation Pull

```
FORMATION_PULL = 0.3  (30% pull toward formation slot, 70% raw movement preserved)
```

## Phase Guard (Pass Flight)

During a pass or shot in flight, off-ball decisions are **frozen** — each player inherits `s.decisions[p.id]` from the previous tick. Re-evaluating during flight caused shaking (offside line shift each frame flipped the best lane back and forth). Once the pass lands, normal evaluation resumes.

## Speed

Off-ball runners use `player.stats.withoutBall.pressSpeed`.

---

# Config Reference

All tunable values in `OffBallConfig.ts`:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `BASE_WEIGHT` | 0.40 | Weight of carry-like spatial score |
| `PASS_WEIGHT` | 0.35 | Weight of pass availability score |
| `SEPARATION_WEIGHT` | 0.25 | Weight of anti-clustering score |
| `IDEAL_SPACING` | 15 | Yards — optimal distance between teammates |
| `CLUSTER_PENALTY_PER_PLAYER` | 0.35 | Score reduction per teammate inside IDEAL_SPACING |
| `MIN_SCORE_THRESHOLD` | 0.3 | Below this → create_space or idle |
| `FORMATION_PULL` | 0.3 | 0..1 — pull toward formation slot |
| `BASE_LOOKAHEAD` | 8 | Yards — minimum projection distance |
| `MAX_LOOKAHEAD` | 16 | Yards — maximum projection distance (at full vision) |
| `VISION_WEIGHT` | 0.12 | Flat vision bonus added to every lane score |
| `MAX_ADVANCE_THRESHOLD` | 10 | Yards ahead of holder — forward lane penalty starts here |
| `MAX_ADVANCE_AHEAD` | 30 | Yards ahead of holder — penalty floor reached here |
| `MAX_ADVANCE_FLOOR` | 0.1 | Minimum score multiplier at full advance |

Offside-related values from `AttackConfig.ts`:

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `OFFSIDE_AWARENESS` | 0.85 | 0..1 — how well players correct for offside |
| `OFFSIDE_MARGIN` | 1.0 | Yards — safety buffer behind the offside line |

---

# Expected Behavior

* **Strikers and wingers** — forward runs into space ahead of the ball
* **Midfielders (CM/CDM)** — lateral/drop support runs; rarely run ahead of the ball
* **Wingers (LW/RW)** — prefer wide positions; run toward their touchline
* **Wide backs (LWB/RWB)** — moderate width preference, drop to support
* **Defenders** — mostly hold formation (low role bias + clearance-dominant scoring)
* **No clustering** — separation evaluated at target → natural triangles and width emerge
* **No offside runs** — hard clamp guarantees compliance; soft penalty steers evaluation

---

# Files

| File | Role |
|------|------|
| `OffBallMovement.ts` | Core evaluation: `evaluateOffBall()` |
| `OffBallConfig.ts` | All tunable weights, thresholds, and `OFF_BALL_ROLE_CARRY_DELTAS` |
| `DecisionTree.ts` | Exports `evaluateCarryLane()` and `rot()` for reuse |
| `PassLanes.ts` | Exports `scorePassToReceiver()` — single-receiver pass score used for Factor 2 |
| `gameState.ts` | Injects off-ball decisions; freezes during pass/shot flight; formation pull, offside clamp, phase guard |
| `AttackConfig.ts` | `getTeamCarryConfig()`, `getTeamAttackWidth()`, `OFFSIDE_AWARENESS`, `OFFSIDE_MARGIN` |
