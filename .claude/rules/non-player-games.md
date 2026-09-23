# Feature: Non-Player Match Simulation (Simple Mode)

## Business Rules

• The system must support simulating matches where **no human is watching**.

• Non-player matches must use the **same simulation engine** used for playable matches.

• Non-player matches must simulate the **same match duration** (45 + 45 + stoppage time).

• Non-player matches must generate the **same events** as playable matches.

• Statistics must be generated exactly the same way as in playable matches.

• Player statistics and player ratings must be produced normally.

• Non-player simulations must **not render graphics**.

• Non-player simulations must **not play animations**.

• Non-player simulations must **not wait for real-time clocks**.

• The match must run **as fast as possible** while keeping deterministic results.

• The final result must include:

• final score
• team statistics
• player statistics
• player ratings

• The simulation must return results only **after the match finishes**.

• The system must remain simple and easy to expand later.

---

# Implementation Guidelines

## Simulation Mode

Add a simulation mode flag.

Example:

```ts
SimulationMode =
  "interactive"
  "nonPlayer"
```

Interactive mode:

• real-time clock
• rendering
• animations
• UI updates

Non-player mode:

• no rendering
• no animations
• no presentation events

---

## Disable Visual Systems

When running a non-player simulation skip:

• Pixi rendering
• camera updates
• goal animations
• start/half/end animations
• UI updates

The engine should only run:

• player logic
• ball logic
• match clock
• event emission
• statistics collection

---

## Fast Engine Loop

Instead of waiting for frame updates, run the engine loop continuously.

Example:

```ts
while (!matchFinished) {
  simulateTick()
}
```

This allows the match to complete **very quickly**.

---

## Clock Handling

The same match clock logic must be used.

Example:

```
First half: 0 → 45 + extraTime
Second half: 45 → 90 + extraTime
```

But instead of waiting for real time, the simulation advances immediately.

Example tick:

```ts
gameTime += simulationStep
```

---

## Simulation Step

Use a fixed simulation step.

Example:

```
simulationStep = 0.2 seconds of game time
```

This keeps behavior identical to playable matches.

---

## Statistics Collection

Reuse the same event system.

Example:

```ts
gameBus.emit("passCompleted", {...})
gameBus.emit("shot", {...})
gameBus.emit("goalScored", {...})
```

The statistics collector listens normally.

---

## Match Result Object

At the end of the simulation return a result object.

Example structure:

```ts
MatchResult {
  score: { A: number, B: number }

  teamStats: {...}

  playerStats: {...}

  playerRatings: {...}
}
```

---

## Example Usage

```ts
const result = simulateMatch(teamA, teamB)
```

Possible output:

```
Team A 2 - 1 Team B

Shots: 14 - 9
Possession: 55% - 45%

Top Player Rating: 8.3
```

---

## Expected Performance

Without rendering or real-time delays a match should simulate in roughly:

```
5–30 milliseconds
```

depending on engine complexity.

---

## Future Improvements

Later the system can add:

• Web Worker execution
• batch match simulation
• coarser simulation steps for faster league simulations
• parallel simulations

But for now the goal is **simple, correct, and identical to the playable engine**.
