# Feature: Positional Awareness System

## Business Rules

• Player decisions must consider **relative positioning between players, ball, and goal**.

• The system must determine whether opponents are **in front, beside, or behind** a player.

• Actions such as tackles, interceptions, passing, and dribbling must depend on positional advantage.

• A defender positioned **in front of an attacker** has a higher chance of stopping the play.

• A defender **behind an attacker** has a lower chance of tackling successfully.

• Interceptions must only occur when a defender is **between the ball and the pass target**.

• Passing decisions must consider **pressure direction**.

• If pressure comes **only from behind**, the player should prefer **carrying the ball forward** rather than passing backward.

• Players with **open space ahead** should prefer advancing the ball.

• Passing backward should happen mainly when the player is **under pressure from the front**.

• The positional awareness system must be reusable by multiple mechanics.

• The system must be lightweight so it can run frequently during the simulation.

• Positional awareness must work consistently for both **interactive matches and non-player simulations**.

---

# Implementation Guidelines

## Relative Position Calculation

Each decision involving two players should consider their **relative angle and distance**.

Key inputs:

```id="p5t7p3"
playerPosition
opponentPosition
ballPosition
attackDirection
```

Compute direction from the player to another entity:

```id="t9c7se"
direction = normalize(targetPosition - playerPosition)
```

This allows comparison with the player's **attack direction**.

---

## Front / Side / Behind Classification

Use the dot product between the **attack direction** and the **direction to the opponent**.

Example:

```id="k9q6e2"
dot = dotProduct(attackDirection, directionToOpponent)
```

Classification:

```id="wq0n3r"
dot > 0.5      → opponent in front
-0.5 ≤ dot ≤ 0.5 → opponent on the side
dot < -0.5     → opponent behind
```

This classification becomes a reusable input for multiple systems.

---

## Defensive Advantage

Use positional classification to influence defensive actions.

Example tackle modifier:

```id="yd7c5v"
front tackle      +0.3 success
side tackle       +0.1 success
behind tackle     -0.3 success
```

Distance can also modify the result.

---

## Interception Logic

A defender can intercept only when positioned between the passer and the receiver.

Condition example:

```id="e4k6fa"
defender closer to pass line
AND
defender in front of pass direction
```

This prevents unrealistic interceptions.

---

## Pressure Detection

Players must detect where pressure is coming from.

Compute nearby opponents:

```id="nbx6cz"
nearbyOpponents = opponents within pressureRadius
```

Evaluate pressure direction:

```id="h3r8pt"
frontPressure
sidePressure
backPressure
```

This becomes input for decision making.

---

## Carry vs Pass Decision

When the player has the ball:

Prefer **carrying forward** when:

```id="v9mb1a"
no opponent in front
AND
front space available
AND
pressure mainly from behind
```

Prefer **passing** when:

```id="u7cz1q"
front pressure exists
OR
passing lane is clearly better
```

This addresses the issue where players unnecessarily pass backward.

---

## Forward Space Detection

Measure available space ahead.

Example check:

```id="6r9hjk"
distanceToNearestOpponentAhead
```

If distance exceeds a threshold:

```id="gm1z9y"
forwardSpace = true
```

Players with forward space should prefer:

• dribbling
• progressive passes
• through balls (future feature)

---

## Reusable Positional Utility

Create reusable helpers.

Example:

```id="r3u4x1"
getRelativePosition(player, opponent)
getPressure(player)
getForwardSpace(player)
```

These functions should be used by:

• tackling
• interceptions
• passing decisions
• dribbling decisions
• marking behavior

---

## Performance Notes

To keep the system lightweight:

• only evaluate nearby players
• reuse vector calculations when possible
• avoid scanning all players each tick

Use a reasonable interaction radius:

```id="3cf5rj"
awarenessRadius ≈ 10–15 meters
```

---

## Future Systems Enabled

This positional awareness system becomes the foundation for:

• dribbling
• through passes
• marking behavior
• defensive positioning
• fouls (tackles from behind)
• offside logic

It ensures that player actions respond logically to the **actual situation on the field**, improving realism without adding heavy computation.
