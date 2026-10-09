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

---

# Knockout Matches (Extra Time and Penalties) — Current Implementation

A knockout match (`GameState.knockout === true`) can never end level. A league match
(`knockout` absent/false) is unaffected — it ends at full time exactly as above, draws included.

## Phase sequence

```
preMatch → firstHalf → halfTime → secondHalf
  → (level after 90'?) extraTimeBreak → extraTimeFirst → extraTimeSecond
       → (still level?) penalties
  → matchEnd
```

`MatchPhase` (`types.ts`) has four extra members: `extraTimeBreak`, `extraTimeFirst`,
`extraTimeSecond`, `penalties`. `isLivePhase(phase)` (`gameState.ts`) is `true` for the four
periods where the ball can be in play — `firstHalf`, `secondHalf`, `extraTimeFirst`,
`extraTimeSecond` — and gates things like stamina drain (`shouldDrainStamina`) exactly the same
way for extra time as for the first 90 minutes. The phase gating at the top of `tickState` treats
`extraTimeBreak` and `penalties` as dead-ball phases (no ball, no movement), like `halfTime`.

## `endCurrentPeriod` — the one function that ends a period

`endCurrentPeriod(state, newMatchTime?)` (exported from `gameState.ts`) is the single place a
running period ends. The normal match clock calls it automatically once `matchTime` reaches the
period's length (`HALF_DURATION` + stoppage for the two normal halves, `ET_HALF_DURATION` +
stoppage for each extra-time half); `/test` calls it directly via the `endPeriod` test command so
a tester can step through a knockout match without waiting for the clock. Both call sites get
identical behaviour because there is only one implementation:

| From phase | To phase | Condition |
|---|---|---|
| `firstHalf` | `halfTime` | always |
| `secondHalf` | `extraTimeBreak` | `knockout && isLevelForKnockout(state)` |
| `secondHalf` | `matchEnd` | otherwise (league match, or knockout already decided) |
| `extraTimeFirst` | `extraTimeSecond` | always (sides switch, no draw check — ET always plays both halves) |
| `extraTimeSecond` | `penalties` | still level (`isLevelForKnockout`) |
| `extraTimeSecond` | `matchEnd` | decided |

Entering `extraTimeBreak` snapshots `scoreAtRegulation` (the 90'-plus-stoppage score) and draws
the two extra-time stoppage allowances, `etStoppageFirst`/`etStoppageSecond`, independently —
each `Math.floor(Math.random() * 3) * 60`, i.e. 0, 1 or 2 minutes of added time per ET half. It
also emits `extraTimeStart({ score })`.

## Extra time

`ET_HALF_DURATION = 900` game-seconds (15 minutes), same `TIME_SCALE` as normal play. The break
before extra time drains for `PRESENTATION_DURATION` real seconds (same constant as half-time),
then calls the same `switchSides` used at half-time — parameterised (see below) so it kicks off
`extraTimeFirst` for team A at `ET_BREAK_RECOVERY_SCALE = 0.5` energy-recovery scale (half the
recovery a normal half-time break grants, reflecting the short turnaround). `switchSides` at the
end of `extraTimeFirst` kicks off `extraTimeSecond` for team B with recovery scale `0` (no
recovery between ET halves, only the side/attack-direction swap and re-positioning).

`switchSides(state, nextPhase = 'secondHalf', kickoffTeam = 'B', recoveryScale = 1)` is the
generalised half-time function: any of the three params can be overridden, so the same function
serves half-time (`nextPhase='secondHalf', kickoffTeam='B', recoveryScale=1`, the defaults),
the extra-time break (`'extraTimeFirst', 'A', 0.5`) and the ET1→ET2 turn
(`'extraTimeSecond', 'B', 0`).

AI substitutions, previously gated to `secondHalf` only, are now allowed during `extraTimeFirst`
and `extraTimeSecond` too (`AiSubstitution.ts` and the in-`tickState` substitution-window check).

## Penalties

`startPenalties(state)` builds one `PenaltySide<number>` per team from the 11 players currently on
the pitch (`penaltySide`): every on-pitch player is a taker (`accuracy` = their
`runtimeStats.withBall.shootAccuracy`), the `GK` on the pitch is the keeper
(`gkReflex`/`gkDiving`). It calls `resolvePenaltyShootout` (see
`.claude/rules/game-engine/shot-and-save.md` → "Penalty shootout") **once**, up front, with
`Math.random` — the whole shootout outcome is decided immediately, then *presented* kick by kick.

`GameState.shootout: ShootoutState` holds the full kick list (`kicks`), the score of kicks
presented so far (`score`), the final score (`finalScore`), the `winner`, and how many kicks have
been shown (`shown`). While `matchPhase === 'penalties'`, `tickState` counts down
`presentationCountdown` (reset to `PENALTY_KICK_INTERVAL = 1.5` real seconds after each kick); when
it drains, the next kick in `shootout.kicks` is revealed — `shootout.score` is updated, a
`penaltyKick` event is emitted, and `shown` increments. Once every kick has been shown, the match
ends (`finishMatch`).

## Ending the match

`finishMatch(state)` sets `matchPhase: 'matchEnd'`, clears `pass`/`shot`/`looseBall`, emits
`shootoutEnd({ winner, score })` first if a shootout happened, then always emits
`matchEnd({ score, decider })`.

`knockoutDecider(state): KnockoutDecider | null` (exported from `gameState.ts`) is the single
source of truth for "how was this knockout match decided": `null` for a league match or a
knockout match that never went level (`scoreAtRegulation` absent). Otherwise:

```ts
{
  extraTime: { A: score.A - scoreAtRegulation.A, B: score.B - scoreAtRegulation.B },
  penalties: shootout ? { ...shootout.finalScore } : null,
  winner: shootout ? shootout.winner : (score.A + agg.A > score.B + agg.B ? 'A' : 'B'),
}
```

## `matchMinute` — displayed minute, all phases

`matchMinute(state)` (exported from `gameState.ts`) is `Math.floor(matchTime / 60)` plus a
per-phase offset (`MINUTE_OFFSET`): `firstHalf` 0, `secondHalf`/`extraTimeBreak` 45,
`extraTimeFirst` 90, `extraTimeSecond`/`penalties` 105. It replaced an inline calculation
previously duplicated wherever a minute needed to be shown (e.g. `performSubstitution`'s
substitution record), so extra time reports 90'+ and 105'+ instead of restarting from 0.

## Events (additions to the table above)

| Event | Payload | Emitted when |
|---|---|---|
| `extraTimeStart` | `{ score }` | `secondHalf` ends level in a knockout match |
| `penaltyKick` | `{ team, takerId, keeperId, scored, chance, score }` | Each presented shootout kick |
| `shootoutEnd` | `{ winner, score }` | Right before `matchEnd`, only when a shootout decided the match |
| `matchEnd` | `{ score, decider }` | Now always carries `decider: KnockoutDecider \| null` |

## Two-legged ties (`aggregate`)

The second leg of a two-legged tie (continental knockout rounds) carries
`GameState.aggregate?: { A: number; B: number }` — the first-leg goals of each side of the
**current** match. "Level" in every knockout check is `isLevelForKnockout(state)`
(`gameState.ts`): `score.A + agg.A === score.B + agg.B` (absent aggregate = `{A:0,B:0}`, so a
single-leg tie is unchanged). There is no away-goals rule. Consequences:

- The second leg goes to extra time only when the **aggregate** is level at 90' — a 1–0 second
  leg after a 0–1 first leg goes to extra time; a 1–1 second leg after a 1–0 first leg ends at 90'.
- Penalties only when the aggregate is still level after extra time; `knockoutDecider` picks the
  no-shootout winner by score + aggregate. `extraTime`/`penalties` in the decider stay per-leg.
- Entry points: `simulateMatch(..., { knockout: true, aggregate })`; `quickSimMatch` takes
  `input.aggregate: { home, away }` with the same rule. `Fixture.aggregate` (`calendarTypes.ts`,
  home/away of that fixture, plus `tieId`/`leg`) is mapped by `buildMatchEvent` (A = home) and
  `buildQuickMatchEvent`; `MatchScreen` flips it when the player is away (player = A).
- `advanceDay` rejects a knockout recording that is level on score + aggregate without deciding
  penalties (400 `knockout recording without a winner`).

## quickSim and `/lab`

The headless path (`quickSim`, `/lab`) does not run the phase machine at all — it computes extra
time and a shootout directly from xG. See `.claude/rules/non-player-games.md` → "quickSim
(ligas não seguidas)" for that path, and `.claude/rules/game-engine/shot-and-save.md` for the
shootout resolver shared by both paths.

---

# Home side on the left (live match presentation, #98)

The user's club is always engine team A. The live match (`MatchScreen`) shows the **home side on
the left**, like a TV broadcast: one flag, `awayView = isAwayView(fixture, mySquadId)`
(`src/GameInterface/matchSides.ts`) — true when the user is the away side of a fixture with a home
side; a neutral venue (`fixture.neutral`) keeps the user on the left. With it:

- scoreboard, goal / half-time / full-time overlays, aggregate and penalty scores, shootout strip
  rows and the "Resumo" panel get their A/B pairs through `toDisplayPair` / `displayTeam`
  (display slot A = left); the "Resumo" header shows the two crests (`ClubLogo` 32px, name in `title` and
  `sr-only`, #128) instead of the names;
- the pitch is drawn mirrored on x (`PixiPitch` `mirror`, `GraficsEngine/pitchMirror.ts`);
- the left team list still opens on the user's own team (#51), flip to see the opponent;
- the result screen (`MatchResultScreen`) already lists the fixture's home side on the left.

The Stats and Debug buttons of the match header (and `StatsPanel`, `DebugPanel`, engine debug mode)
exist only outside production (#97).

---

# Live heat map and live tactics (Etapa 35, #108, 4.9)

Spec: `docs/superpowers/specs/2026-10-08-live-tactics-design.md`.

- **Possession heat map** (`src/Domain/match/possessionHeatmap.ts`, card `Components/PossessionHeatmap.tsx`,
  at the bottom of the "Resumo" panel, below the event feed, collapsible (#127: the feed scrolls on its own with a
  minimum height so the map never squeezes it out; open/closed kept per viewer in `localStorage`)): where the ball was while each team had it (holder, or the passer while a pass
  is in the air), 12 × 8 grid, "Meu time"/"Adversário" × "Últimos 10 min"/"Jogo todo". Sampled in the
  `stateChanged` handler (the same one that accumulates possession, so it keeps counting with the tab
  hidden), weighted by the game-seconds since the previous emission, live phases only; fixed arrays (whole
  match + a ring of 10 one-minute buckets of played time — its own continuous clock, since the displayed
  minute repeats after half-time stoppage). Stored with team A attacking +x (the half-time switch undone);
  drawn mirrored on x when the user plays away, like the pitch, with an arrow for the shown team's attack.
  The card re-reads once a second (never per tick); the accumulator lives in a ref and goes into the resume
  snapshot (`ui.heatmap`). Drawing only: no `GameState` field, no engine read. `/test`: "Heatmap" button.
- **Live tactics:** "Tática" tab of the substitution panel (`Components/LiveTacticsPanel.tsx`): tactical
  style and the four axes for this match (`src/Domain/tactics/liveTactics.ts` → `applyTeamTacticsConfig` /
  `applyTeamAttackConfig` on team A only, with the current mentality on top and the club's familiarity
  record, whose value for the chosen style drives the weights). Never `PUT /tactics`; "Voltar à tática
  salva" restores the saved one; the resume snapshot keeps the live and the saved tactics. The AI (team B)
  never reacts. Limitation: the familiarity *execution* (attributes × 1 ± 0,02) is baked into the players at
  kickoff, so a live style change moves the tactical weights, not those attributes.

---

# Substitution panel: mini pitch and position swaps (#115, 4.13)

The "Troca de jogador" tab of the live substitution panel (`SubstitutionPanel` → `Components/SubsPitchView.tsx`)
shows the XI on a mini pitch (each starter in his slot of the current formation, attacking to the right: position
in `getDetailedPositionColor`, rating, energy, yellow card / injury / "going off" marks) and the bench sorted by
position (`compareSquadPositions`). Below `md` the pitch and the bench stack.

- Tap flow (`GameInterface/subsSelection.ts`, `tapSubsPlayer`, pure + tested): starter then substitute (or the other
  way) queues a substitution in `pendingSubsA` (limit and the "already going off" rule unchanged, flushed at the next
  stoppage); two outfield starters **swap positions** at once, without using a substitution; tapping the selected
  player again clears. Dragging works the same (substitute onto starter, starter onto starter).
- Engine: `swapPlayerPositions(state, team, aId, bId)` (`gameState.ts`): each player takes the other's slot index,
  role, anchor and bounds (as on a formation change), the slot keeps its instruction and man-marking, energy and
  pitch position stay, and the engine stats are rebuilt for the new role from `fit` (the out-of-position factor, as
  for a substitute). Goalkeepers, the same player, another team or a player off the pitch: state unchanged. Emits
  `positionsSwapped` and a debug line (`instruction`). Test: `SwapPositions.engine.test.ts`.
- `/test`: button "Subs A" opens the same panel for team A (test commands `queueSub` and `swapPositions`; the
  Formation / Instructions tabs stay in `/test`'s own controls). No new statistic, nothing in `/lab`: a swap only
  moves players between existing slots.

# Stadium, officials and managers (Etapa 38, #107/#99, 4.12)

Spec: `docs/superpowers/specs/2026-10-08-match-visual-design.md`. Drawing only (`src/GraficsEngine`, see
`graphics-engine.md`): nothing enters the `GameState`, the engine, the quickSim or `/lab`.

- `POST /api/match-setup` (with `saveId`) returns `crowd` (`attendance`, `capacity`, `neutral`, `importance`,
  `known`) and `managers` (`mine`: id `player`, saved avatar, nationality; `opponent`: the club's `managers.json`
  record or null) — `src/backend/matchCrowd.ts`. A home game of the human club uses `attendanceOf` with the
  season phase, the date and the big-match multiplier (the number the gate of the day charges); away = the AI
  rule (home capacity × `GATE.FILL_RATE`); neutral venue = `known: false`. The preview shows the same number.
- `MatchScreen` passes `stadium = { fill: attendance / capacity (or 0.65), homeTeam, neutral, seed: fixture.id }`
  — `homeTeam` is the engine team of the fixture's home side (A when the human is at home or on a neutral venue).
  With #98 the home side is drawn on the left, so the home fans fill most of the stand and the away block sits
  in the right end stand. `officials` on, `coaches` per team (face `managerFaceUrl` in the kit colours; no record
  = a disc in the colour). The `key` of the pitch only changes with the size (and the stadium appearing once).
- Changing the mentality plays the human manager's gesture (`coachCue`: attack / defend / balanced, a new `seq`
  each time); a goal makes the scoring team's manager celebrate. The AI never changes mentality.
- `/test`: chips Stadium, Officials, the crowd (0/25/50/Default 65/75/100%) and Neutral; off by default.

# Referee of the match (Etapa 38b, 4.17)

`POST /api/match-setup` returns `referee` (the appointment the day advance will use, `.claude/rules/game/referees.md`).
`MatchScreen` puts `{ id, name, country, strictness }` on `GameState.referee` (fouls and cards scale with the rigor),
shows him in the "Resumo" panel and draws the referee and the assistants with their faces. The day advance logs the
same referee (`MatchEvent.referee`, never taken from the client's recording).
