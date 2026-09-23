Got it. I’ll keep it **clean, structured, and readable**, like the earlier FootballSim docs you asked for: clear sections, headings, and JSON/code only where needed.

---

# Season Calendar Generation

## Purpose

The Season Calendar system generates the full schedule of matches when a new season begins.

The calendar defines:

* which teams play each other
* when matches occur
* the order of rounds

Once generated, the calendar becomes part of the **save state** and must remain deterministic.

All teams in the competition use the same calendar, including AI teams.

---

# Part 1 — Business Rules

## Season Initialization

At the beginning of a new season the system must:

1. Load the teams participating in the competition.
2. Generate the round-robin schedule.
3. Assign calendar dates to each round.
4. Create match entries for every fixture.
5. Save the generated calendar into the save file.

The calendar must **never be regenerated after the season starts**.

Reloading a save must restore the exact same calendar.

---

## Round-Robin Scheduling

League competitions use a **round-robin scheduling system**.

In a round-robin system:

* every team plays every other team
* matches are grouped into rounds
* each team plays once per round

If the league uses **double round-robin**, each pair of teams plays twice:

* once at home
* once away

Example league:

```
20 teams
38 rounds
10 matches per round
```

---

## Matchdays

Matches are grouped into **matchdays (rounds)**.

All matches in the same round occur on the same date.

Example:

```
Round 1

Team A vs Team B
Team C vs Team D
Team E vs Team F
```

---

## Season Date Range

Each competition defines a **season window**.

Required parameters:

* season_start
* season_end
* number_of_rounds

Example:

```
season_start = 2027-08-15
season_end   = 2028-05-20
rounds       = 38
```

The system must distribute rounds **evenly between these dates**.

---

## Match Date Distribution

To distribute rounds across the season window, the system calculates an interval.

```
interval = (season_end - season_start) / (rounds - 1)
```

Each round date becomes:

```
round_date = season_start + interval * round_index
```

This produces:

* realistic weekly matches
* occasional midweek rounds
* a season that ends exactly on the configured date

---

# Part 2 — Implementation Guide

## Season Model

Example season configuration:

```json
{
  "season": {
    "start": "2027-08-15",
    "end": "2028-05-20",
    "rounds": 38
  }
}
```

---

## Calendar Generation Process

The season initialization should execute the following steps:

```
1. load league teams
2. generate round-robin rounds
3. calculate round dates
4. attach dates to rounds
5. create match records
6. save calendar
```

---

## Calendar Match Structure

Each match stored in the calendar should contain:

* date
* competition
* round
* home team
* away team
* match state
* result (if played)

Example:

```json
{
  "date": "2027-08-15",
  "competition": "league",
  "round": 1,
  "home": "team_01",
  "away": "team_05",
  "played": false,
  "result": null
}
```

---

## Save File Storage

The generated calendar must be stored in the save file.

Example structure:

```json
{
  "game_state": {
    "current_date": "2027-08-15"
  },

  "season": {
    "year": 2027,
    "calendar": []
  }
}
```

Only team IDs should be stored in the calendar to avoid duplication.

---

## Runtime Behavior

During gameplay the simulation advances by date.

Each day the system checks the calendar:

```
for match in calendar:
    if match.date == current_date:
        simulate match
```

After the match:

* mark match as played
* store result
* update standings

---

## Design Principles

The calendar system must be:

**Deterministic**

The same season must always produce the same schedule once generated.

**Persistent**

The calendar must be saved and restored with the game state.

**Competition-agnostic**

The same system should support:

* leagues
* cups
* playoffs
* tournaments

Future competitions can reuse the same calendar structure.
