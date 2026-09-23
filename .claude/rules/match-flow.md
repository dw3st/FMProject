# Feature: Match Flow and Clock Control

## Business Rules

• The match must last approximately **7 minutes of real time**.

• The match must display a **full football timeline**.

• The first half must display **0–45 minutes**.

• The second half must display **45–90 minutes**.

• Each half may include **stoppage time between 0 and 5 minutes**.

• Stoppage time must be determined **at the start of each half**.

• The match clock must advance faster than real time so that the full timeline fits within the shortened match.

• The displayed match time must behave exactly like a real football clock.

• At **half-time**, teams must **switch sides of the field**.

• Player positions must be mirrored relative to the center line when sides switch.

• The ball must reset to the **center spot** at the start of each half.

• The match must include **presentation states** for key moments of the game.

• These presentation states must include:

• Match Start
• Goal Scored
• Half Time
• Match End

• During these moments the simulation may pause while the animation plays.

• The simulation must resume automatically after the presentation sequence finishes.

• Match presentation must not modify the underlying simulation state beyond the necessary resets.

---

# Implementation Guidelines

## Match States

Introduce a simple match flow state machine.

Example states:

```ts
MatchState =
  "preMatch"
  "firstHalf"
  "halfTime"
  "secondHalf"
  "matchEnd"
```

The match progresses in this order:

```
preMatch
→ firstHalf
→ halfTime
→ secondHalf
→ matchEnd
```

## Clock Scaling

Real match duration:

```
totalRealMatchTime ≈ 7 minutes
```

Half duration:

```
realHalfDuration ≈ 210 seconds
```

Game half duration:

```
gameHalfDuration = 2700 seconds
```

Time scale:

```
timeScale = gameHalfDuration / realHalfDuration
≈ 12.86
```

Clock update each tick:

```
gameTime += deltaRealTime * timeScale
```

## Stoppage Time

At the start of each half:

```
extraTime = random(0, 5)
```

Half ends when:

```
displayMinute >= 45 + extraTime
```

## Side Switching

At half-time:

• swap attacking directions
• mirror player starting positions across the field center
• reset ball to kickoff position

Example concept:

```
teamA.attackDirection = -teamA.attackDirection
teamB.attackDirection = -teamB.attackDirection
```

Player spawn positions can be mirrored:

```
player.x = fieldWidth - player.x
```

## Kickoff Reset

Kickoff occurs at:

• match start
• start of second half
• after goals

Required reset:

```
ball.position = centerSpot
possession = kickoffTeam
```

## Match Presentation Events

Emit events on the game bus so the UI layer can trigger animations.

Example events:

```ts
gameBus.emit("matchStart", {...})
gameBus.emit("halfTime", {...})
gameBus.emit("matchEnd", {...})
```

## Animation Handling

Animations should run **outside the simulation engine**.

Example flow:

```
Engine emits event
↓
UI receives event
↓
UI plays animation
↓
UI notifies engine to resume
```

Example animation triggers:

Match Start

```
• show team names
• show score 0–0
• kickoff camera focus
```

Half Time

```
• display half-time overlay
• show current score
• short pause
```

Goal

```
• goal celebration
• scoreboard update
```

Match End

```
• final score display
• match statistics
```

## Simulation Pause

During presentation sequences the simulation should pause.

Example flag:

```
simulationPaused = true
```

Resume when animation finishes.

## Advantages of This Structure

• clean separation between **simulation** and **presentation**

• realistic **football broadcast flow**

• easy to add new presentation events

• deterministic match state transitions

• flexible clock scaling without affecting gameplay logic
