# Central Play Improvement Plan

## Problem Statement

Formation balance testing (200 matches each) showed 4-3-3 at 39.5% win rate vs 3-5-2 at 34% and 4-4-2 at 30.25%.
Root cause: the engine favours wide play structurally, making formations with natural wingers dominant
regardless of tactics.

Three diagnosed issues:

1. **Pass lane clearance is too punitive in central zones** — `BLOCK_RADIUS=3.0 yds` blanket-applies
   to all passes. A 5-yard give-and-go gets the same interception penalty as a 40-yard long ball.
   Central areas are always congested so `laneScore ≈ 0`, collapsing the player modifier
   (`rawModifier * laneScore`) to near zero and making passer quality irrelevant centrally.

2. **No space creation after receiving** — after a pass completes the receiver immediately
   re-enters the full decision tree (often passing backward). There is no mechanism for a player
   to take a touch and dribble away from the nearest presser before deciding. This is the
   "receive and turn" that central midfielders use to create the extra yard of space.

3. **Same-role players cluster** — two STs in 4-4-2 both score the same central zone highest
   (`forward_penetration: 0.80`) and occupy the same space. The existing separation penalty
   (`CLUSTER_PENALTY_PER_PLAYER=0.35`) is not strong enough to split them.

---

## Changes Implemented

### 1. Distance-adaptive lane clearance with tactical width relevance (PassLanes.ts)

`getLaneScore` now scales `BLOCK_RADIUS` and `CLEAR_RADIUS` by a `shortFactor` derived from
pass distance and the team's `width` tactic.

```
shortFactor = max(tacticFloor, min(1.0, passDist / 30))

tacticFloor:
  narrow  → 0.25   (5-yd pass: blockR = 0.75 yds — central triangles are viable)
  normal  → 0.40   (5-yd pass: blockR = 1.20 yds — slight improvement)
  wide    → 0.55   (5-yd pass: blockR = 1.65 yds — minimal change, width still rewarded)

At 30+ yards all styles converge to shortFactor=1.0 (blockR = 3.0, unchanged).
```

**Tactical meta created:**
- Narrow tactic → significantly easier short central passes → central play viable
- Wide tactic → minimal change → wide play still rewarded
- Players choosing narrow formation + narrow width get a concrete central play advantage

### 2. Post-reception burst carry (gameState.ts + types.ts)

When a pass completes, the receiver gets `justReceivedTicks = 4` (~0.8 seconds of game time).

Each tick while `justReceivedTicks > 0`:
- If the nearest opponent is within **6 yards**: execute a dribble burst away from them.
  Burst speed = `carrySpeed × (0.4 + dribbling × 0.6)` — good dribblers create more separation.
- If no opponent is within 6 yards: just decrement and proceed to normal decision.

This models "receive and turn" — the touch central midfielders take to escape the first marker
before they have time to decide on a pass.

### 3. Nearby players burst into space on reception (gameState.ts)

When the ball holder has `justReceivedTicks > 0`, teammates doing off-ball runs within **15 yards**
get an acceleration boost: `withoutBall.acceleration × CARRY_ACCEL_SPEED_BOOST`.

This models the supporting players who read the reception and make a sharp run to offer an
immediate return option (give-and-go pattern).

Additionally, `OffBallMovement.selectOffBallIntent` boosts `forward_penetration` by +0.35 for
players within 15 yards of a holder who just received — biasing their intent toward making
a forward run rather than drifting back.

### 4. Same-role clustering penalty (OffBallMovement.ts)

In `scoreOffBallTarget`, same-role teammates generate a penalty that is **2× stronger** than the
standard teammate cluster penalty.

```
sameRolePenalty += (1 - d / IDEAL_SPACING) × CLUSTER_PENALTY_PER_PLAYER × 2
```

This forces two STs in 4-4-2 / 3-5-2 to naturally split: one takes the central zone,
the other is pushed toward the half-space or wide channel.

---

## Expected Outcomes

- 3-5-2 and 4-4-2 benefit from short central passes being viable
- Narrow width tactic creates a concrete mechanical advantage for central play styles
- Central midfielders can receive under pressure and create a yard of space before deciding
- Supporting players make sharper runs when a teammate receives centrally
- Two STs occupy different zones instead of clustering on the same spot

---

## Iteration Notes

If these changes don't sufficiently close the 4-3-3 gap after re-running formation-balance:

- Increase `shortFactor` for narrow tactic (lower the tacticFloor to 0.15)
- Increase burst range from 6 to 8 yards (affects how aggressively receivers create space)
- Increase same-role penalty multiplier from 2× to 3×
- Consider adding a new off-ball intent `half_space_run` for the second ST specifically
- Consider making `justReceivedTicks` count higher (6–8) so the burst window is longer
