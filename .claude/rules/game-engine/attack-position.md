Below is the **final structured document for Attacking Positioning**, following the format you defined:

1. **Imperative Rules (business rules / source of truth)**
2. **Implementation Guide (config + formulas + minimal guidance)**

This focuses on **movement and spatial organization**, not decision logic (passing/carrying already handle decisions).

---

# Attacking Positioning — Business Rules

## Purpose

Attacking positioning defines how players organize when the team has possession in order to **support the ball, create passing options, stretch the opponent's defense, and maintain structural balance**.

The attacking system prioritizes **space creation and structured support** rather than random movement toward the ball.

Players must maintain attacking shape while adapting to the ball position and tactical instructions.

---

# Attacking Phase

The attacking phase begins when the team gains possession.

During this phase players transition from their defensive structure to an **attacking structure derived from the formation**.

The attacking structure defines where each role should position itself while the team has the ball.

Players move relative to the ball but maintain the overall attacking shape.

---

# Attacking Formation Structure

Each role has an **attacking formation slot** representing its preferred position when the team has possession.

The attacking slot may differ from the defensive slot to support attacking play.

The attacking structure ensures that:

* width is maintained
* forward options exist
* defensive coverage behind the ball remains

These formation slots serve as **positional anchors** rather than fixed destinations.

---

# Ball Support

The ball carrier should always have multiple passing options available.

Nearby teammates should naturally create a support structure around the ball carrier.

The attacking structure should aim to produce:

* a short support option
* a lateral support option
* a forward option

This creates triangular passing structures and prevents the ball carrier from becoming isolated.

---

# Width Creation

Attacking positioning must stretch the opponent horizontally.

Players responsible for width, such as wingers or attacking fullbacks, should remain near wide channels unless tactical instructions dictate otherwise.

Maintaining width forces defenders to cover more space and opens central passing lanes.

Tactical instructions may increase or decrease attacking width.

---

# Depth Creation

The attacking structure must also stretch the defense vertically.

Some players remain deeper to recycle possession and maintain defensive balance.

Others position themselves higher to threaten the opponent's defensive line.

Maintaining both deep and advanced options ensures continuous attacking progression.

---

# Support Distance

Players supporting the ball should maintain effective spacing.

Support players should avoid standing too close to the ball carrier or too far away to receive passes.

Appropriate support distances allow for quick passing combinations and ball circulation.

---

# Overloads

Attacking teams often create local numerical advantages around the ball.

Players near the ball may move slightly toward the play to support combinations.

However, excessive crowding must be avoided.

The attacking structure should maintain balance while allowing limited local clustering.

---

# Weak-Side Occupation

Players on the far side of the field should not abandon their positions to follow the ball.

Instead they maintain width and depth to prepare for switches of play.

Weak-side occupation stretches the opponent's defensive shape and creates new attacking options.

---

# Attacking Runs

Players without the ball may occasionally move forward to exploit open space.

These attacking runs depend on:

* available space
* tactical style
* player attributes

Direct attacking tactics encourage more forward runs.

Possession-oriented tactics produce fewer aggressive runs and prioritize positional support.

---

# Positional Discipline vs Fluidity

Players maintain a balance between formation discipline and fluid space occupation.

Each player has a **role anchor position** defined by the attacking formation.

Players may adjust their position to occupy nearby useful space, but they should remain generally aligned with their role.

The degree of freedom to move away from the role anchor is determined by tactical instructions.

Low positional freedom results in rigid positional play.

High positional freedom allows players to move more fluidly to exploit space.

Players always remain within their general role region and do not permanently swap roles.

---

# Team Shape Stability

Even when attacking, the team must maintain overall structural balance.

Some players should remain positioned behind the ball to support recycling possession and protect against counterattacks.

The attacking structure should ensure that the team remains connected across the field.

---

# Ball Influence

Player positioning adjusts relative to the location of the ball.

Players near the ball adjust their positioning more actively to provide support.

Players farther from the ball prioritize maintaining attacking structure.

This ensures that the team remains organized while still supporting the play.

---

# Tactical Identity

Tactical instructions strongly influence attacking positioning.

Important tactical parameters include:

* attacking width
* build-up speed
* positional freedom
* run frequency

Different tactical combinations produce distinct attacking styles such as:

* structured possession play
* balanced attacking play
* direct vertical attacks

These tactical settings should visibly change how the team occupies space during possession.

---

# Relationship to Other Systems

Attacking positioning influences several other gameplay systems.

Passing decisions depend on the positions of available teammates.

Carry decisions depend on the space created by attacking movement.

Defensive transitions depend on how many players remain behind the ball.

Improving attacking positioning increases the effectiveness of the passing and carry systems.

---

# Attacking Positioning Implementation Guide

This section provides **minimal implementation guidance**.

The goal is to show how positioning influences can be combined without defining full algorithms.

---

# Attacking Configuration

Attacking behavior should be controlled through configurable tactical parameters.

```ts
export const ATTACK_CONFIG = {
  ATTACK_WIDTH: 0.6,
  SUPPORT_DISTANCE: 12,
  RUN_FREQUENCY: 0.4,
  POSITIONAL_FREEDOM: 0.5,

  BALL_INFLUENCE_WEIGHT: 0.6,
  SPACING_WEIGHT: 0.3,
};
```

These parameters are modified by tactical instructions.

---

# Role Anchor Position

Each player has an attacking formation slot.

```ts
roleAnchorX = formationSlotX
roleAnchorY = formationSlotY
```

This position represents the player's preferred attacking location.

---

# Ball Support Adjustment

Players near the ball adjust their position to provide support.

Conceptual example:

```ts
ballInfluence =
    directionFromBall * BALL_INFLUENCE_WEIGHT
```

This pulls nearby players toward useful supporting areas.

---

# Space Occupation

Players avoid overcrowding teammates.

Example concept:

```ts
spacingAdjustment =
    pushAwayFromNearbyTeammates * SPACING_WEIGHT
```

This helps maintain balanced attacking spacing.

---

# Positional Freedom Blending

Players blend their role anchor position with dynamic space occupation.

Example concept:

```ts
spaceTarget = roleAnchor + ballInfluence + spacingAdjustment

targetPosition =
    lerp(roleAnchor, spaceTarget, POSITIONAL_FREEDOM)
```

Low positional freedom keeps players near their formation slot.

High positional freedom allows more fluid space occupation.

---

# Final Target Position

The final attacking position is influenced by several components.

```ts
targetPosition =
    roleAnchor
  + ballInfluence
  + spacingAdjustment
  + tacticalAdjustments
```

Players move toward this target position each simulation tick.

---

# Design Principles

The attacking positioning system should remain:

* formation-based
* tactically configurable
* spatially balanced
* consistent with passing and carry systems

All important weights and parameters must remain configurable to allow tuning without modifying core logic.

---

At this point your engine now has **four major behavioral foundations defined**:

Carry logic
Passing logic
Defensive positioning
Attacking positioning

The next system that would significantly improve realism is likely **Transitions (attack → defense and defense → attack)**, because transitions strongly affect how quickly the team reorganizes after losing or gaining possession.

BUT FOR NOW WE DONT HAVE A TRANSITION we should do it instant.
