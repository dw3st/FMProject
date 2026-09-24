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

# Action Compression (pass vs carry vs through ball)

The best pass competes with shoot / carry / dribble / through ball in `decideBallHolder`
(`DecisionTree.ts`). Each raw score goes through `compress(raw, STRONG_RAW) = 1 − e^(−raw/STRONG_RAW)`,
so `STRONG_RAW` sets how much raw quality an action needs to look "strong" (0.632).

| Action | `STRONG_RAW` |
|---|---|
| shoot | 1.8 |
| carry | 0.8 |
| **pass** | **0.8** |
| dribble | 0.8 |
| through ball | 0.9 |

**Why pass is 0.8 (changed 2026-09-24, was 1.0).** A to-feet pass has a low structural
ceiling: the short lateral pass a midfielder plays scores progress ≈ 0.57, almost no goal
proximity and always some distance penalty, so a good MID pass sits at raw ≈ 0.74 (lane
clearance is not the problem — mean lane score is 0.96). At 1.0 that compressed to ~0.52,
below carry (raw 0.82 → 0.64) and through ball (raw 0.80 → 0.59), and the pass won only
~1% of MID holder decisions. MIDs made ~0.15 regular passes per match and lived on carries,
dribbles and through balls.

Measured with `bun scripts/passing-mix-diagnostic.ts <league> 150` (add `--scores` for the
per-line action scores and raw pass components). Per player per match, 4-3-3 both sides:

| Metric (premier_league / serie_a, 150 matches each) | before (1.0) | after (0.8) |
|---|---|---|
| MID regular passes | 0.15 / 0.15 | 1.69 / 1.72 |
| DEF regular passes | 1.44 / 1.50 | 2.97 / 3.12 |
| FWD regular passes | 0.99 / 0.93 | 1.47 / 1.24 |
| GK regular passes | 3.06 / 3.10 | 3.03 / 3.18 |
| Regular passes / match | 24.5 / 24.7 | 48.7 / 49.0 |
| Pass completion | 95.8% / 96.0% | 96.6% / 96.6% |
| Through balls / match | 27.0 / 27.1 | 19.8 / 19.0 |
| Shots / match | 7.1 / 6.8 | 7.0 / 6.4 |
| Goals / match | 2.83 / 2.39 | 2.89 / 2.23 |

MIDs still pass less than DEFs (CB↔CB circulation is the biggest flow, ~11.5 completed
DEF→DEF passes per match). Pushing further (0.75) gives MID ≈ 2.6 but costs ~8% of shots.
Weaker leagues lose more goals: `of_championship` went 1.65 → 1.40 goals/match (300 matches after).

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
