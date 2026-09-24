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

MIDs still passed less than DEFs (CB↔FB/CB circulation was the biggest flow, ~11.5 completed
DEF→DEF passes per match). Pushing further (0.75) gives MID ≈ 2.6 but costs ~8% of shots.
Weaker leagues lose more goals: `of_championship` went 1.65 → 1.40 goals/match (300 matches after).
The role-targeted change below closed the remaining gap.

---

# Midfield as the Circulation Hub (role-targeted, 2026-09-24)

## Why defenders recycled instead of playing into midfield

`bun scripts/passing-mix-diagnostic.ts premier_league 100 --receivers` scores every teammate
at the moment each regular pass is played. From a CB, the best full-back scored 0.66 and the
best CM 0.57–0.61. The CM wins on progress (0.78 vs 0.50) but loses on lane (0.60–0.66 vs 0.94),
receiver space (0.67–0.70 vs 0.89) and the lane-gated player modifier. Opposing midfielders
`track_mark` onto the ball→CM lane by design, while full-backs stand wide and unmarked. So the
CB↔FB pass was always the safer top-scored option, and nothing in the scoring said "a midfielder is
a better place for the ball than the other CB". MID holders also rarely passed: carry
(raw 0.82) and through ball (0.81) beat their pass (0.75).

## The three role levers (all per role in `roles.json`, no tactic logic in consumers)

| Lever | Where | Effect |
|---|---|---|
| **`passTargetWeight`** (receiver, 0..1, 0.5 = neutral) | `PassLanes.getReceiverRoleScore` → `receiverRoleBonus = (w − 0.5) × RECEIVER_ROLE_WEIGHT × routingGate` | Picks **which** teammate gets the ball. Centred, so it reorders receivers instead of inflating every pass. It only enters the selection `score`; the pass **action** uses `quality` (the score without it). |
| **`passBias`** (holder, −1..1, 0 = neutral) | `DecisionTree.evalPass`: `raw = quality + passBias × PASS_CONFIG.ROLE_BIAS_WEIGHT` | The pass mirror of `carryBias`: decides **whether** to pass instead of carrying or playing a through ball. |
| **`offBallIntentWeights`** (CM 1.10 / 0.35 / 0.30, CAM 1.00 / 0.30 / 0.55 offer/hold/run) | `OffBallMovement.selectOffBallIntent` | CM/CAM show for the ball more often, so their lanes open up (CB→CM lane 0.66 → 0.73). |

- `routingGate = clamp((progressScore − 0.3) / 0.2, 0, 1)`: full on lateral and forward passes, fading
  to 0 over the first 12 yds backward. A winger doesn't lay the ball back into midfield
  instead of finding the striker.
- `RECEIVER_ROLE_WEIGHT` is a team pass weight per `build_up`: possession 0.14, balanced 0.10,
  direct 0.06. `PASS_CONFIG.ROLE_BIAS_WEIGHT = 0.10`.
- Off-ball movement reads `scorePassQuality` (no role bonus), because the receiver's role must not
  inflate the answer to "am I open?".
- Debug: the pass breakdown in `/test` → Decision Scores shows `rcv` (receiverRoleBonus) and `bias`
  (holder roleBias). `rawScore` is what the pass action compresses.
- All three levers were needed. passBias alone got MID 2.3 vs DEF 2.5. passBias + routing got
  2.6 vs 2.3, and passBias + off-ball got 2.7 vs 2.6 (premier_league, 300 matches).

| Role | passTargetWeight | passBias |
|---|---|---|
| GK | 0.00 | 0 |
| CB | 0.20 | −0.30 |
| LB / RB | 0.40 | −0.30 |
| LWB / RWB | 0.45 | 0 |
| CDM / CM | 1.00 | 0.80 |
| CAM | 0.90 | 0.50 |
| LM / RM | 0.70 | 0.40 |
| LW / RW / ST | 0.50 | 0 |

## Measured (4-3-3 both sides, balanced)

Line passes are per player per match; flows and totals are per match. 400 matches per league
(`of_championship` is the weaker `of_*` league). "Before" is commit 35e8985.

| Metric | premier_league before → after | serie_a before → after | of_championship before → after |
|---|---|---|---|
| MID regular passes | 1.69 → **3.14** | 1.77 → **3.14** | 1.22 → **2.55** |
| DEF regular passes | 3.00 → 2.36 | 3.20 → 2.45 | 3.03 → 2.39 |
| FWD regular passes | 1.45 → 1.53 | 1.26 → 1.26 | 0.98 → 0.99 |
| DEF→DEF completed | 11.5 → 6.8 | 12.3 → 6.8 | 11.6 → 7.0 |
| DEF→MID completed | 6.0 → 7.5 | 6.6 → 8.2 | 6.2 → 7.6 |
| MID→MID completed | 2.5 → 6.9 | 2.9 → 7.2 | 1.9 → 5.5 |
| MID→FWD completed | 4.9 → 7.6 | 4.8 → 7.3 | 3.4 → 6.1 |
| Regular passes | 49.1 → 52.7 | 49.8 → 51.7 | 42.6 → 45.1 |
| Through balls | 19.6 → 19.3 | 19.3 → 18.8 | 18.8 → 19.1 |
| Shots | 6.86 → 7.17 | 6.19 → 6.41 | 5.01 → 4.97 |
| Goals | 2.88 → 2.97 | 2.25 → 2.25 | 1.51 → 1.53 |

Other set-ups (premier_league, 300 matches):

| Set-up | MID / DEF passes before → after | Shots | Goals |
|---|---|---|---|
| 4-2-3-1 (CDM pair) | 1.20 / 2.25 → 2.20 / 1.91 | 6.83 → 6.90 | 2.87 → 2.97 |
| possession (both teams) | 3.32 / 7.38 → 5.52 / 6.17 (105.5 → 108.3 passes/match) | 6.12 → 5.61 | 2.48 → 2.29 |
| direct_play (both teams) | 0.53 / 1.77 → 1.19 / 1.52 (31.1 → 32.8 passes/match) | 7.12 → 7.41 | 2.94 → 3.14 |

Possession circulates the most, as intended. But its MIDs now pass where they used to play a
through ball (MID TB 0.62 → 0.44 per player, and TB completion in that style is ~67%), which costs
~6–8% of shots. `RECEIVER_ROLE_WEIGHT` is not the cause (0.06, 0.10 and 0.14 give the same shots);
`passBias` is. Lowering the CM passBias to 0.6 recovers about half of it, but it leaves MID ≈ DEF in the
weaker league and in 4-2-3-1.

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
