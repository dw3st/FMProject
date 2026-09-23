# Lane Gravity — Current Implementation

Lane gravity was an early concept doc. It is now implemented as two things inside `DefensivePositioning.ts`:

---

## 1. Lane Blocking (Stage 4 of computeDefensivePosition)

The simple version: nudges every defender's X toward the corridor between the ball and their own goal.

```ts
const laneTarget = ownGoalX + (ballPos.x - ownGoalX) * 0.7;
rawX += (laneTarget - rawX) * cfg.LANE_BLOCK_WEIGHT * 0.15;
```

Config: `LANE_BLOCK_WEIGHT` (default 0.40). Weak influence — keeps the block roughly goal-side of the ball without overriding formation structure.

---

## 2. Threat-Based Marking (Stage 5 of computeDefensivePosition)

The more sophisticated version: for each non-pressing defender with a mark assignment, position them on the **ball→mark passing lane** with pull strength scaled by threat (how close the mark is to goal).

High threat = strong pull onto the lane (cuts the pass).
Low threat = weak pull toward the mark (stay aware, hold shape).

This is functionally what the original lane gravity concept described:
> "Defenders aim to occupy positions that reduce the quality of the passing lane."

See `defensive-position.md` → Stage 5 for full implementation details.

---

## Config

Both effects live inside `DefenseConfig`:

| Key | Default | What it controls |
|---|---|---|
| `LANE_BLOCK_WEIGHT` | 0.40 | Global X-axis lane nudge strength |
| `MARK_PULL_MAX` | 0.90 | Max pull onto ball→mark lane (high threat) |
| `MARK_PULL_MIN` | 0.30 | Min pull toward mark (low threat) |
| `MARK_LANE_T_CLOSE` | 0.75 | Lane position fraction at high threat |
| `MARK_LANE_T_FAR` | 0.30 | Lane position fraction at low threat |
| `THREAT_HORIZON` | 100 yds | Distance at which threat reaches 0 |

---

## What the Original Concept Specified vs What Was Built

The original doc described a per-lane `closestPointOnLine` calculation with a `LANE_GRAVITY_WEIGHT` and `MAX_LANE_INFLUENCE_DISTANCE`. This was superseded by the unified threat-based marking system, which achieves the same goal (defenders position on passing lanes) but integrates naturally with the mark assignment and threat system rather than running as a separate pass.

The `LANE_GRAVITY_WEIGHT` and `MAX_LANE_INFLUENCE_DISTANCE` constants were never added — the equivalent tuning levers are `MARK_PULL_MAX/MIN` and `THREAT_HORIZON`.
