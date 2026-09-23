Below is a **condensed business-rules document** describing how carry decisions work in the engine. It explains the system behavior and design logic rather than implementation steps.

---

# Carry Logic — Business Rules

## Purpose

Carry logic determines when a player in possession chooses to **advance with the ball** rather than pass or shoot. The goal is to simulate believable attacking progression while maintaining an **arcade-style flow**.

A carry is chosen when a **forward lane offers meaningful progress and the player has the ability to exploit it**.

The system evaluates a small set of candidate lanes and selects the best option based on **lane quality and player capability**.

---

# Carry Candidate Lanes

The engine evaluates a fixed set of potential movement lanes from the carrier's current position.

Three lanes are evaluated:

* **Forward** (toward the attacking goal)
* **Forward-left** (≈ −30°)
* **Forward-right** (≈ +30°)

Each lane produces a **target position** located a short distance ahead of the carrier.

The distance is intentionally short to encourage **continuous re-evaluation** rather than committing to long dribble paths.

---

# Lane Evaluation

Each candidate lane is scored based on objective spatial factors.

These describe **how good the lane is regardless of who the player is**.

## Clearance

Clearance represents the distance between the lane and nearby opponents.

Higher clearance indicates:

* more space to move
* lower immediate interception risk

Clearance is capped so extremely open space does not dominate the evaluation.

---

## Forward Progress

Forward progress measures how much the lane advances the ball **toward the opponent’s goal**.

Lanes that significantly advance play receive higher scores.

Sideways movement provides little or no progress value.

---

## Angle Quality

Angle quality measures how well the lane aligns with the attacking direction.

* Direct forward movement is most valuable.
* Diagonal movement is acceptable.
* Wide or sideways movement is less valuable.

Angle evaluation prevents players from drifting into harmless space.

---

## Target Crowding

Crowding penalizes lanes that lead into areas with multiple defenders.

Opponents within a defined radius around the target position increase the penalty.

This discourages dribbling into dense defensive areas.

---

# Lane Base Score

The base score represents the **objective quality of a lane**.

It combines the spatial factors:

* clearance
* forward progress
* angle quality
* crowding penalty

Clearance and forward progress are weighted most heavily because they best represent safe and productive advancement.

---

# Player Carry Ability

Once the lane quality is determined, the system evaluates **whether the player is capable of exploiting the lane**.

Player attributes influence the final carry decision.

---

## Speed

Speed improves the value of lanes that offer **open space ahead**.

Faster players gain additional value when the lane produces meaningful forward progress.

Speed does not significantly benefit sideways movement.

---

## Acceleration

Acceleration improves the player's ability to **attack short openings quickly**.

This stat is especially important when defenders are nearby because quick bursts can beat immediate pressure.

Acceleration has a strong influence on carry success.

---

## Vision

Vision represents a player's ability to **recognize productive attacking space**.

Higher vision improves carry decision quality by:

* increasing confidence in lanes that advance play
* reducing the penalty from crowded areas
* improving recognition of useful angles

Players with poor vision are more likely to carry into pressure or choose less effective lanes.

---

## Role Bias

Different roles have different tendencies to carry the ball.

Attacking players receive a positive bias toward carrying.

Typical tendencies:

| Role                  | Carry tendency |
| --------------------- | -------------- |
| Wingers               | High           |
| Attacking midfielders | Medium-high    |
| Strikers              | Medium         |
| Central midfielders   | Medium         |
| Fullbacks             | Medium         |
| Center backs          | Low            |
| Goalkeepers           | None           |

Role bias should influence marginal decisions but never override clearly bad lanes.

---

# Pressure Influence

Defensive pressure near the ball carrier reduces the likelihood of a carry.

Pressure is determined by the distance between the carrier and the nearest opponent.

Under heavy pressure:

* carry scores are reduced
* passing becomes more attractive

Acceleration can partially offset pressure by enabling quick escapes.

---

# Final Carry Score

Each lane produces a **total carry score**.

The score is composed of:

* lane base score (space and progression)
* player carry ability modifiers
* role bias
* pressure penalty

The lane with the highest score becomes the preferred carry direction.

---

# Clear Run on Goal

When a player has a **clear path to goal** with no outfield defenders between them and the goal — only the goalkeeper ahead — they must **always carry forward**, regardless of normal carry thresholds.

This overrides the standard lane evaluation entirely.

## Conditions

Both must be true:

* No outfield opponent is positioned **ahead** of the carrier within a lateral corridor toward goal
* The goalkeeper may be ahead — that is expected and does not block the clear run

## Corridor Check

An outfield opponent "blocks" the run if:

* They are meaningfully ahead of the carrier (positive forward component)
* Their lateral distance from the carrier is within the clear run corridor width

If any such opponent exists → no clear run.

If none exist → clear run detected.

## Behavior

When a clear run is detected:

* Carry direction is forced **straight toward goal**
* The normal lane scoring and minimum threshold are bypassed
* The player commits to advancing until they enter shoot range or a defender closes in

## Priority

Clear run check sits between the shoot decision and the normal carry evaluation:

```
1. Shoot if in range
2. Clear run on goal? → force carry toward goal
3. Normal carry lane evaluation
4. Pass (fallback)
```

---

# Carry Decision Threshold

A carry is only selected (in normal mode) if the best lane exceeds a **minimum score threshold**.

If all lanes score poorly, the player will prefer alternative actions such as passing.

This prevents unrealistic dribbling into clearly dangerous situations.

---

# Continuous Re-Evaluation

Carries are not long commitments.

The engine constantly re-evaluates the situation while the player moves.

This allows the player to:

* continue advancing if the lane remains good
* switch to a pass if the lane closes
* shoot when entering range
* change direction if a better lane appears

Frequent re-evaluation creates natural attacking movement.

---

# Design Principles

Carry logic follows several key principles:

### Progress matters more than safety

The system favors lanes that **advance the attack**, not merely those with space.

### Good players exploit space better

Player attributes influence the ability to use a lane, not the existence of the lane.

### Bad lanes remain bad

Player ability cannot fully compensate for a poor lane.

### Decisions should remain readable

Carry logic must remain predictable enough for players to understand why a carry occurred.

### Simplicity over realism

The system favors clarity and tunability over detailed physical simulation.

---

# Tuning

All scoring weights and thresholds are configurable engine parameters.

These values are expected to be adjusted during gameplay tuning to achieve the desired balance between:

* aggression
* safety
* attacking progression
* arcade responsiveness

No scoring weights are hardcoded inside the decision logic.

---

# Relationship to Passing

Carry and pass decisions follow the same evaluation philosophy:

* evaluate spatial opportunity
* adjust by player ability
* apply role tendencies
* choose the highest-value action

Carry logic therefore forms the foundation for the future **pass evaluation system**.

---

This document defines the **authoritative behavior rules** for ball carrying in the game engine.


Light guide, not a full implementation:

## `CarryConfig.ts`

```ts
export const CARRY_CONFIG = {
  LOOKAHEAD_DISTANCE: 10,
  TARGET_CROWD_RADIUS: 8,
  MIN_TOTAL_SCORE: 0.45,

  CLEARANCE_WEIGHT: 0.4,
  PROGRESS_WEIGHT: 0.35,
  ANGLE_WEIGHT: 0.15,
  CROWD_PENALTY_WEIGHT: 0.3,

  ROLE_BIAS_WEIGHT: 0.1,
  SPEED_WEIGHT: 0.1,
  ACCELERATION_WEIGHT: 0.16,
  VISION_WEIGHT: 0.14,

  HARD_PRESSURE_DISTANCE: 3,
  MEDIUM_PRESSURE_DISTANCE: 6,
  HARD_PRESSURE_PENALTY: 0.25,
  MEDIUM_PRESSURE_PENALTY: 0.12,

  VISION_CROWD_REDUCTION: 0.25,
} as const;
```

## `types.ts`

```ts
export type CarryLaneScore = {
  dirX: number;
  dirY: number;
  targetX: number;
  targetY: number;

  clearanceScore: number;
  progressScore: number;
  angleScore: number;
  crowdPenalty: number;

  roleBias: number;
  speedBonus: number;
  accelerationBonus: number;
  visionBonus: number;
  pressurePenalty: number;

  baseScore: number;
  totalScore: number;
};
```

## Formula shape

```ts
baseScore =
  clearanceScore * CARRY_CONFIG.CLEARANCE_WEIGHT +
  progressScore * CARRY_CONFIG.PROGRESS_WEIGHT +
  angleScore * CARRY_CONFIG.ANGLE_WEIGHT -
  crowdPenalty * CARRY_CONFIG.CROWD_PENALTY_WEIGHT;

playerModifier =
  roleBias * CARRY_CONFIG.ROLE_BIAS_WEIGHT +
  speedBonus +
  accelerationBonus +
  visionBonus -
  pressurePenalty;

totalScore = baseScore + playerModifier;
```

## Minimal evaluation example

```ts
function evaluateCarryLane(player, lane, opponents): CarryLaneScore {
  const clearanceScore = getClearanceScore(lane, opponents);
  const progressScore = getProgressScore(player, lane);
  const angleScore = getAngleScore(player, lane);
  const crowdPenalty = getCrowdPenalty(lane.target, opponents);

  const roleBias = getRoleCarryBias(player.role);
  const speedBonus = getSpeedBonus(player, progressScore);
  const accelerationBonus = getAccelerationBonus(player, opponents);
  const visionBonus = getVisionBonus(player, progressScore, angleScore);
  const pressurePenalty = getPressurePenalty(player, opponents);

  const baseScore =
    clearanceScore * CARRY_CONFIG.CLEARANCE_WEIGHT +
    progressScore * CARRY_CONFIG.PROGRESS_WEIGHT +
    angleScore * CARRY_CONFIG.ANGLE_WEIGHT -
    crowdPenalty * CARRY_CONFIG.CROWD_PENALTY_WEIGHT;

  const totalScore =
    baseScore +
    roleBias * CARRY_CONFIG.ROLE_BIAS_WEIGHT +
    speedBonus +
    accelerationBonus +
    visionBonus -
    pressurePenalty;

  return {
    dirX: lane.dirX,
    dirY: lane.dirY,
    targetX: lane.targetX,
    targetY: lane.targetY,
    clearanceScore,
    progressScore,
    angleScore,
    crowdPenalty,
    roleBias,
    speedBonus,
    accelerationBonus,
    visionBonus,
    pressurePenalty,
    baseScore,
    totalScore,
  };
}
```

## Decision usage

```ts
const bestLane = getBestCarryLane(player, opponents);

if (bestLane && bestLane.totalScore >= CARRY_CONFIG.MIN_TOTAL_SCORE) {
  return { type: "carry", dx: bestLane.dirX, dy: bestLane.dirY };
}

return { type: "pass" };
```

## Main idea

Keep only these pieces:

* config with all tunable values
* lane base score
* player modifier
* total score
* minimum threshold

That is enough to guide the real implementation without overbuilding it.
