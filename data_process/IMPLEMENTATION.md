Good. Keep it focused.

Below is the **updated implementation plan**, with normalization included and a clear direction for each attribute.

---

# Player Rating System (Implementation Plan)

## Pipeline

Execute in this exact order:

---

## 1) Assign division base

```text
divisionBase = fixed value per league

EG:
Europe Top Leagues: 6.5
Brazil Série A:     4.8
Brazil Série B:     3.6
Brazil Série C:     2.6
```

---

## 2) Compute team strength

```text
teamStrengthScore =
  cbfTierScore * 0.6 +
  knownSquadAverage * 0.4
```

---

## 3) Classify squad status

```text
Key Starter / Starter / Rotation / Backup
```

---

## 4) Compute general level

>= 2000 min → Key Starter
>= 1200 min → Starter
>= 500 min  → Rotation
> 0 min     → Backup

```text
teamStrengthAdjustment:
  strong team → +0.8
  average     →  0.0
  weak team   → -0.6

squadStatusAdjustment:
  key starter → +0.9
  starter     → +0.4
  rotation    →  0.0
  backup      → -0.4

```text

```text
generalLevel =
  divisionBase +
  teamStrengthAdjustment +
  squadStatusAdjustment
```

---

## 5) Normalize player stats (NEW STEP)

### Rule

* Normalize **inside (league + role group)**
* Use min/max per stat

```text
groupKey = league + roleGroup

normStat =
  (value - min(group)) / (max(group) - min(group))
```

Clamp to [0, 1]

---

## 6) Build attributes from stats

Each attribute is derived from **specific normalized stats**

Then scaled by `generalLevel`

---

## 7) Apply role baseline

```text
attribute =
  attribute * roleWeight
```

---

## 8) Final value

Clamp to your 0–10 scale

---

# Attribute → Stat Mapping

This is the important part.

Keep it simple and deterministic.

---

## Passing

**Signals:**

* passes_completed_per_90
* pass_completion_rate
* key_passes_per_90

```text
passing =
  passes_completed_norm * 0.4 +
  completion_rate_norm * 0.3 +
  key_passes_norm * 0.3
```

---

## Vision

**Signals:**

* key_passes_per_90
* through_passes_per_90
* chances_created_per_90

```text
vision =
  key_passes_norm * 0.4 +
  through_passes_norm * 0.3 +
  chances_created_norm * 0.3
```

---

## Finishing

**Signals:**

* xg_per_90
* shot_conversion_rate
* shots_on_target_per_90

```text
finishing =
  xg_norm * 0.4 +
  conversion_norm * 0.4 +
  shots_on_target_norm * 0.2
```

---

## Dribbling

**Signals:**

* dribbles_per_90
* dribbles_successful_per_90
* dribbles_successful_percentage

```text
dribbling =
  dribbles_norm * 0.3 +
  dribbles_success_norm * 0.4 +
  success_rate_norm * 0.3
```

---

## Speed

**Signals:**

* distance_travelled_per_90
* dribbles_per_90

```text
speed =
  distance_norm * 0.6 +
  dribbles_norm * 0.4
```

---

## Acceleration

**Signals:**

* dribbles_successful_percentage
* fouls_drawn_per_90

```text
acceleration =
  dribble_success_rate_norm * 0.6 +
  fouls_drawn_norm * 0.4
```

---

## Tackling

**Signals:**

* tackles_per_90
* tackles_successful_per_90

```text
tackling =
  tackles_norm * 0.5 +
  tackles_success_norm * 0.5
```

---

## Pressing

**Signals:**

* pressures_per_90
* possession_regained_per_90

```text
pressing =
  pressures_norm * 0.6 +
  possession_regained_norm * 0.4
```

---

## Stamina

**Signals:**

* distance_travelled_per_90
* minutes_played

```text
stamina =
  distance_norm * 0.7 +
  minutes_norm * 0.3
```

---

## Heading

**Signals:**

* aerial_duels_won_per_90
* aerial_duels_won_percentage

```text
heading =
  aerial_won_norm * 0.6 +
  aerial_rate_norm * 0.4
```

---

## Strength

**Signals:**

* duels_won_per_90
* duels_won_percentage

```text
strength =
  duels_won_norm * 0.5 +
  duels_rate_norm * 0.5
```

---

## Positioning

**Signals:**

* interceptions_per_90
* shots_per_90
* chances_created_per_90

```text
positioning =
  interceptions_norm * 0.4 +
  shots_norm * 0.3 +
  chances_created_norm * 0.3
```

---

# Final Attribute Formula

After computing attribute (0–1):

```text
attribute =
  generalLevel * (0.7 + statScore * 0.6)
```

Then:

* apply role weight
* clamp to 0–10

---

# Important Constraints

* Never use raw stats directly
* Always normalize first
* Always scale by generalLevel
* Keep mappings fixed (no dynamic weights for now)

---

# Final Result

This gives you:

* consistency across leagues
* stability with missing data
* realistic differentiation inside teams
* controlled global scaling

---

If you want next step:

→ I can help you define the **role templates (weights)** so attributes distribute correctly per position.
