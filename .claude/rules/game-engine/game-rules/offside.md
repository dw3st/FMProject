Below is the **Offside Rule document** following the same structure used in your engine design documents.

1. **Imperative Rules (business rules / source of truth)**
2. **Implementation Guide (config + formulas + minimal guidance)**

This document defines **how offside is enforced**, not how attackers behave relative to it. Attacker awareness will be implemented later.

---

# Offside Rule — Business Rules

## Purpose

The offside rule prevents attackers from gaining an unfair positional advantage by remaining ahead of the defensive line when receiving a forward pass.

The rule ensures that attacking players must remain aligned with the defensive structure when the ball is played.

Offside enforcement maintains realistic attacking and defensive spacing within the match simulation.

---

# Offside Evaluation Moment

Offside is evaluated **at the moment the ball is played by a teammate**.

The relevant reference is the instant the pass begins.

Player positions after the pass begins do not affect the offside decision.

This ensures the rule is based on the attacking player's position when the pass is made.

---

# Offside Line

The offside line is defined by the **second-last defender of the defending team**.

In most situations this corresponds to the last field defender before the goalkeeper.

The offside line represents the furthest position an attacking player may occupy without being offside.

---

# Attacking Player Position

An attacking player is considered offside if they satisfy all of the following conditions at the moment the pass is played:

* the player is in the opponent's half of the field
* the player is ahead of the ball
* the player is ahead of the second-last defender

If all three conditions are true, the player is in an offside position.

---

# Receiving the Ball

Being in an offside position alone does not result in an offside offense.

An offense occurs only if the player in an offside position becomes directly involved in play by:

* receiving the pass
* attempting to receive the pass
* interfering with an opponent

For the purposes of this simulation, the offside offense occurs when the offside player receives the ball.

---

# Offside Decision

When a pass arrives at its intended receiver, the engine checks whether the receiver was in an offside position at the moment the pass was initiated.

If the receiver was offside, play is stopped and possession is awarded to the defending team.

The restart occurs from the offside location.

---

# Ball Position Exception

An attacking player cannot be offside if they are **behind the ball** at the moment the pass is played.

This allows passes that move forward toward a player who was initially positioned deeper than the ball.

---

# Own Half Exception

An attacking player cannot be offside if they are located within their own half of the pitch when the pass is played.

Offside only applies within the opponent's half.

---

# Defensive Line Movement

The offside line is determined using defender positions at the moment the pass is played.

Subsequent movement by defenders does not change the offside decision.

---

# Goalkeeper Independence

The goalkeeper is not treated as a special case in determining the offside line.

The rule always considers the **second-last defender**, regardless of player role.

This ensures correct behavior even when the goalkeeper leaves the defensive line.

---

# Simplified Offside Enforcement

For this simulation, offside detection focuses only on the **intended receiver of the pass**.

Other attackers in offside positions do not trigger a violation unless they receive the ball.

This simplified approach avoids unnecessary complexity while preserving realistic outcomes.

---

# Relationship to Other Systems

The offside rule interacts primarily with the passing system.

Pass evaluation may eventually consider offside risk when selecting targets.

However, offside enforcement itself remains independent from player decision systems.

---

# Offside Implementation Guide

This section provides minimal guidance for implementing offside detection within the match engine.

---

# Configuration

```ts id="igjv7e"
export const OFFSIDE_CONFIG = {
  ENABLED: true
};
```

This allows the rule to be toggled for debugging or testing.

---

# Determining the Offside Line

The offside line is determined by sorting defending players by their field position.

Example concept:

```ts id="y1rgkw"
defendersSorted = defenders.sortByX()

secondLastDefenderX = defendersSorted[defendersSorted.length - 2].x
```

This value represents the offside line.

---

# Checking Offside Position

When a pass begins, record the intended receiver's position relative to the offside line.

Example concept:

```ts id="z1g4zk"
isAheadOfDefenders = receiverX > secondLastDefenderX
isAheadOfBall = receiverX > ballX
isInOpponentHalf = receiverX > pitchMidline
```

---

# Offside Condition

A receiver is in an offside position if:

```ts id="3smt2p"
isOffside =
    isAheadOfDefenders
 && isAheadOfBall
 && isInOpponentHalf
```

---

# Enforcement

When the pass reaches the receiver:

```ts id="tkwkvd"
if isOffside:
    stopPlay()
    awardFreeKick(defendingTeam)
```

The restart position should correspond to the receiver's location when the pass was played.

---

# Design Principles

The offside system should remain:

* deterministic
* simple
* independent from player decision logic
* consistent with the passing system

Offside enforcement should not introduce complex prediction or decision logic.

The rule should simply validate whether the receiving player was legally positioned when the pass occurred.
