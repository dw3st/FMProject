Below is the **final structured result** for the **Passing system** using the format you defined:

1. **Imperative rules (business logic / source of truth)**
2. **Implementation guide (config + formulas + minimal guidance)**

This document intentionally focuses on **decision logic**, not on full positioning or run-generation, which will be discussed separately.

---

# Passing Logic — Business Rules

## Purpose

Passing logic determines when and where a player in possession sends the ball to a teammate. The objective is to produce coherent attacking play that reflects **team tactics, player abilities, and spatial opportunities**.

The system evaluates **pass candidates** and selects the pass that produces the highest overall value according to tactical style and situational factors.

Passing must always remain **neutral in principle**; forward passes are not inherently preferred. Instead, the **team's tactical configuration determines how much progression, safety, or width is valued**.

---

# Pass Candidates

Each teammate becomes a **pass candidate** when the player has possession.

For each candidate, the engine generates one or more **pass targets**.

Examples of targets include:

* pass to feet
* lead pass slightly ahead of the receiver
* pass into space for a run

The target point represents where the ball is sent, not necessarily the receiver's current position.

This allows:

* attacking runs
* through balls
* better exploitation of space

---

# Pass Evaluation

Each candidate pass is scored using several spatial and contextual factors.

These factors determine the **intrinsic quality of the pass opportunity**.

## Lane Quality

The engine evaluates the passing lane between the passer and the target.

Lane quality reflects the probability of interception.

Open lanes score higher, while lanes obstructed by defenders reduce the score.

---

## Forward Progress

Forward progress measures how much the pass advances the attack toward the opponent’s goal.

Forward movement increases the score, while backward or lateral passes produce less progression value.

However, progression is **not inherently dominant**; its importance depends on tactical style.

---

## Receiver Space

The amount of defensive pressure near the receiver strongly influences pass quality.

Receivers with more surrounding space receive higher scores.

Passing to tightly marked players is penalized.

---

## Distance

Longer passes are more difficult and more likely to be intercepted.

Distance introduces a penalty that grows with pass length.

However, certain tactical styles reduce this penalty.

---

# Player Influence

Player attributes influence both **pass selection and pass success**.

## Passer Attributes

Passing skill increases the ability to execute difficult passes.

Vision improves decision quality by helping the player recognize valuable passing opportunities.

Players with higher vision are better at identifying productive forward passes and avoiding crowded receivers.

---

## Receiver Attributes

Receiver characteristics influence the viability of a pass.

Important attributes include:

* first touch
* speed
* acceleration

Fast receivers with good control are more capable of receiving passes into space.

---

# Tactical Influence

Team tactics modify the importance of pass evaluation factors.

The same pass opportunity may be evaluated differently depending on tactical instructions.

Tactics influence several aspects of passing behavior.

---

## Progression Bias

Direct playstyles increase the value of forward progress.

Possession-oriented styles reduce the emphasis on progression and favor safer options.

---

## Risk Tolerance

Certain tactics encourage riskier passes, allowing players to attempt more ambitious passes through tighter lanes.

More cautious tactics penalize risky passes more strongly.

---

## Width Preference

Teams may emphasize attacking through the wings or through the center.

Wide playstyles increase the value of passes directed toward wide areas.

Central playstyles increase the value of passes directed through central channels.

Balanced tactics do not bias spatial direction.

Spatial preference influences pass evaluation but does not override core spatial factors such as defensive pressure or lane quality.

---

# Pass Selection

After evaluating all pass candidates, the engine selects the pass with the highest score.

If all candidate passes fall below a minimum quality threshold, the player will prefer alternative actions such as:

* carrying the ball
* recycling possession
* clearing under pressure

This prevents unrealistic or desperate passes.

---

# Decision Neutrality

The passing system must remain neutral and flexible.

The engine never forces forward passes through hard-coded rules.

Instead, tactical settings adjust the importance of progression, risk, and spatial preferences.

This allows tactical styles such as:

* possession-oriented build-up
* direct vertical play
* wide attacking play
* cautious game management

to emerge naturally from the same decision system.

---

# Relationship to Other Systems

Passing decisions interact closely with several other systems.

Carry logic competes with passing decisions when evaluating progression opportunities.

Player positioning determines which teammates are viable passing options.

Tactical instructions influence pass evaluation weights.

Future improvements to positioning and attacking runs will enhance the quality of passing decisions.

---

# Passing Implementation Guide

This section provides a **minimal technical structure** to guide development. It does not represent a full implementation.

---

# Config Structure

All weights and tactical modifiers should be configurable.

```ts
export const PASS_CONFIG = {
  MIN_PASS_SCORE: 0.45,

  PROGRESS_WEIGHT: 0.35,
  LANE_WEIGHT: 0.30,
  RECEIVER_SPACE_WEIGHT: 0.20,
  DISTANCE_PENALTY_WEIGHT: 0.15,

  PASSING_SKILL_WEIGHT: 0.15,
  VISION_WEIGHT: 0.15,
  RECEIVER_CONTROL_WEIGHT: 0.10,

  WIDTH_PREFERENCE_WEIGHT: 0.15,
};
```

Tactical systems modify these weights dynamically.

---

# Base Pass Score

The base score reflects the spatial quality of the pass.

```ts
baseScore =
  progressScore * PROGRESS_WEIGHT +
  laneScore * LANE_WEIGHT +
  receiverSpaceScore * RECEIVER_SPACE_WEIGHT -
  distancePenalty * DISTANCE_PENALTY_WEIGHT;
```

---

# Player Modifier

Player attributes influence pass feasibility and decision quality.

```ts
playerModifier =
  passingSkill * PASSING_SKILL_WEIGHT +
  vision * VISION_WEIGHT +
  receiverControl * RECEIVER_CONTROL_WEIGHT;
```

---

# Tactical Modifier

Tactical instructions adjust pass attractiveness.

```ts
tacticalModifier =
  progressBias +
  riskTolerance +
  spatialPreferenceScore * WIDTH_PREFERENCE_WEIGHT;
```

---

# Final Pass Score

The final pass score determines which candidate is selected.

```ts
finalScore =
  baseScore +
  playerModifier +
  tacticalModifier;
```

The pass with the highest score is chosen.

If the best pass does not exceed the minimum pass score threshold, passing should be avoided.

---

# Spatial Preference Calculation

Spatial preference is determined using the horizontal pitch position.

Example concept:

```ts
widthFactor = abs(targetY - pitchCenterY) / (pitchWidth / 2)
```

Wide tactics reward larger width factors, while central tactics reward smaller values.

---

# Candidate Selection

Only reasonable teammates should be evaluated.

Players that are extremely close to the passer, excessively far away, or fully obstructed may be excluded from candidate evaluation.

---

# Design Philosophy

The passing system must remain:

* configurable
* tactically driven
* consistent with carry evaluation
* predictable for tuning

All scoring weights must remain configurable parameters to allow gameplay balancing without rewriting the decision logic.

---

The **next design session should focus on Positioning**, because that system will strongly influence:

* attacking runs
* through balls
* passing opportunities
* defensive shape

Improving positioning will amplify the effectiveness of both **carry and passing systems**.
