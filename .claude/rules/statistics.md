# Feature: Player and Team Statistics Tracking

## Business Rules

• Every match action must be attributed to the player responsible for it.

• Statistics must be recorded at the **player level**.

• Team statistics must be derived from the **sum of player statistics**.

• The statistics system must support both **individual player analysis** and **team-level summaries**.

• Each statistics event must include the **player who performed the action**.

• Some events may include **additional involved players** (for example pass target or tackled opponent).

• Player statistics must **accumulate during the match**.

• Team statistics must be calculated by **aggregating player statistics**.

• The statistics system must **not affect gameplay logic**.

• Player statistics must support **future evaluation systems** such as player ratings.

• Statistics must remain **lightweight** so they can be updated frequently.

• The statistics system must allow **new statistic types** to be added easily.

• Player statistics must be **reset at the start of each match**.

## Implementation Guidelines

### Player Statistics Structure

Maintain a statistics record for each player in the match.

Example access pattern:

```
playerStats[playerId]
```

Typical fields:

```
passesAttempted
passesCompleted
passesFailed
shots
goals
interceptions
tackles
ballRecoveries
possessionsWon
```

Recommended storage structure:

```
playerStats = Map<PlayerId, PlayerStats>
```

Example `PlayerStats` structure:

```
passesAttempted = 0
passesCompleted = 0
passesFailed = 0
shots = 0
goals = 0
interceptions = 0
tackles = 0
```

### Event Handling

The statistics collector subscribes to the event bus and updates the responsible player's statistics.

Example:

```ts
gameBus.on('passCompleted', e => {
  playerStats[e.player].passesCompleted++
})

gameBus.on('passFailed', e => {
  playerStats[e.player].passesFailed++
})

gameBus.on('shot', e => {
  playerStats[e.player].shots++
})

gameBus.on('goalScored', e => {
  playerStats[e.scorer].goals++
})
```

### Team Statistics

Team statistics should be derived from player statistics.

Example calculations:

```
teamPassesCompleted = sum(players passesCompleted)
teamShots = sum(players shots)
teamGoals = sum(players goals)
```

This ensures a **single source of truth**.

### Possession Tracking

Possession statistics may require tracking the player currently controlling the ball.

Example:

```
currentPossessionPlayer
```

When possession changes, update possession counters accordingly.

### Performance Guidelines

• Use direct counters instead of recomputing values.

• Avoid scanning all players during gameplay ticks.

• Update only the player involved in the event.

• Use simple integer increments.

### Player Rating Preparation

The player rating system can later use these statistics.

Example metrics:

```
passAccuracy = passesCompleted / passesAttempted
defensiveContribution = interceptions + tackles
offensiveContribution = shots + goals
```

### Data Access

Expose two access patterns:

```
playerStats[playerId]
teamStats(teamId)
```

Team statistics can either be cached or calculated from player statistics when requested.
