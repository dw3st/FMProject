The important insight from real systems:

• Most platforms start players around **6.0–6.5** and move the rating up or down based on actions. ([Taylor & Francis Online][1])
• Positive actions (goals, key passes, interceptions) increase the rating.
• Negative actions (losing possession, failed passes, mistakes) decrease it.
• The final score is normalized into a **0–10 scale**. ([ResearchGate][2])

This approach is **perfect for a simulation** because it is event-driven.

---

# Feature: Player Match Rating (0–10)

## Business Rules

• Every player receives a performance score for the match.

• Ratings must be calculated from recorded match statistics.

• Ratings must follow a **0 to 10 scale**.

• Players begin the match with a **neutral baseline rating**.

• Positive actions increase the rating.

• Negative actions decrease the rating.

• High-impact actions must influence ratings more strongly than routine actions.

• The rating must reflect the player's overall contribution to the match.

• Ratings must be calculated independently for each player.

• Ratings must use the same event stream used for statistics.

• Players with minimal participation may receive a neutral rating.

• Ratings must remain stable and not fluctuate excessively due to minor actions.

• The system must allow tuning of weights for balancing.

## Implementation Guidelines

### Baseline Rating

Players start the match with a baseline rating.

Example:

```
baselineRating = 6.0
```

Each event adds or subtracts value from this baseline.

### Event Contribution Weights

Each event contributes positively or negatively to the rating.

Example weights:

```
Goal                +1.5
Assist              +1.0
Shot on Target      +0.4
Shot                +0.2

Key Pass            +0.5
Successful Pass     +0.02

Interception        +0.4
Tackle Won          +0.4
Ball Recovery       +0.3

Failed Pass         -0.05
Dispossessed        -0.2
Failed Tackle       -0.2
Error Leading Shot  -0.7
Error Leading Goal  -1.2
```

These weights should be configurable.

### Rating Calculation

Example simple formula:

```
rating = baseline
       + Σ(eventContribution)
```

Clamp result:

```
rating = clamp(rating, 0, 10)
```

### Position Awareness (Optional Later)

Different positions may weight events differently.

Example:

```
Defenders:
  interceptions weight ↑
  tackles weight ↑

Forwards:
  goals weight ↑
  shots weight ↑

Midfielders:
  passes weight ↑
```

This can be introduced later if needed.

### Runtime Strategy

Do **not recompute rating every frame**.

Instead update rating **when events occur**.

Example:

```
gameBus.on('passCompleted', e => {
  playerRating[e.player] += PASS_WEIGHT
})
```

### Final Match Rating

At the end of the match:

```
finalRating = clamp(playerRating, 0, 10)
```

Optionally round:

```
displayRating = round(finalRating, 1)
```

Example outputs:

```
8.7  outstanding performance
7.4  strong match
6.0  average
5.2  poor performance
4.3  very poor
```

### Advantages of This Approach

• extremely cheap to compute
• works directly with your event bus
• easy to tune
• realistic football-style ratings
• scalable as more events are added

---

The **next step** (NOT for this interation, but should be easy to add later):

**"Contextual Rating Adjustments"**

This is what real systems do to avoid dumb ratings like:

* defender gets 9.0 just because he made many passes
* striker gets 5.0 after scoring twice but missing many passes

It adds **context bonuses**, like:

• goal when losing
• assist creating big chance
• interception stopping shot
---

# Stage 17 (engine rebuild): ratings from FM's hooks (`DECISION_FLAGS.FM_RATINGS`)

- Every hook only bumps a per-player tally (`RatingTally`, `Domain/RatingModel.ts`); the rating is
  `ratingFromTally` = `FM_RATING.BASELINE` (5.85) + the parts (`ratingParts`), clamped 0..10 once. The weights
  (`FM_RATING`, `PlayerRatingConfig.ts`) are sized for FM's 90-minute volume (R9: ~978 passes, 17 tackles won, 59
  interceptions, 27 headers won, 21.5 shots, 1.5 goals per match); the legacy model (`RATING_WEIGHTS`, clamped per
  event) is always kept beside it (`getAllLegacyRatings`) and used with the flag off.
- Hooks: goals, good / great goal adders (shot xG < 0.15 / < 0.06, never a penalty), decisive goal (from 80', levels or
  gives the lead), assists, shots and on target, xG shortfall (non-penalty xG − goals beyond 0.3), chances created (a
  `shot` with `passerId`) and open-play xA, passes completed / incomplete (through balls included), dribbles, crosses
  completed, tackles won / lost, interceptions (a physical `interceptionTouch` counts once), blocks (`shotBlocked`,
  blocked crosses), clearances (cleared touches, headed clearances), mistakes leading to goals, loose balls won, aerial
  duels won / lost, saves and good / difficult saves (`keeperSave.grade`), fouls, cards, penalties conceded.
- **Mistake leading to a goal:** the last player of a side who lost the ball (pass intercepted or missed, tackled,
  dribble lost, through ball lost) when the opponent scores before his side has the ball again and within
  `MISTAKE_PASS_WINDOW` (4) opponent completed passes. `initRatings` takes `{ id, team }` (or learns sides from
  `simStep`).
- The `shot` event carries `passerId` (`state.lastPasserId`), `setPiece` (set-piece phase on: no xA) and `penalty`.
- VAR: a goal ruled out undoes every hook it added (scorer, adders, assist, mistake).
- Resume: `exportRatings` / `importRatings` stay plain numbers (the wire, the reload snapshot); an import keeps the
  tallies and a residual so later hooks move the number from the imported one. `exportRatingState` /
  `importRatingState` carry the tallies and the cross-event trackers (last shot, mistake, goal records, last touch;
  `HighlightSkip`, `LiveSnapshot` of the highlights mode).
- `/test`: RT column of the Stats panel (tooltip = the parts), scenario `rating-chance-created`, debug category
  `rating`. `/lab`: mean rating by line, outfield sd and % ≥ 8 (`PairDetail`). Measurement:
  `bun scripts/rating-distribution.ts [matches] [league] --out f.json` and `--eval f.json --fm-scale [--weights …]`.
- Not recalibrated here (stage 21): development (DP from the match rating), morale, awards and stars all read the new
  numbers; on today's uncalibrated 90' volume (6–7 goals and ~4× FM's tackles per match) the ratings run high.

# Momentum (stage 17)

- FM's table (`MomentumConfig.ts`): points per touch, completed pass and shot outcome (goal, woodwork, saved, blocked,
  missed) by sixth of the attacking half and left / central / right third, from the attacker's view. Statistics and
  presentation only: nothing in the engine reads it.
- `Domain/Momentum.ts`: from `simStep` (positions, holder changes) and the shot events it emits `momentumPoints`;
  `Statistics.ts` sums `momentumPoints` / `momentumShotPoints` per team; the bar (`momentumBar`) is the difference of the
  points per match minute with a 4-minute half-life over 15 minutes (`MOMENTUM`; FM's decay was not found). A browser
  that only replays the server's events (two-manager match, watch) gets the forwarded `momentumPoints`. The stats
  snapshot carries it whole (positions of the last step, holder), so a highlights-mode jump keeps it; the bar re-reads
  once a second.
- Screens: `MomentumBar` in the match summary panel (slot `momentum`) and in the `/test` Stats panel (with the
  per-minute strip and the points). `/lab`: momentum points per match.
