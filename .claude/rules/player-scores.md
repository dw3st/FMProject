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