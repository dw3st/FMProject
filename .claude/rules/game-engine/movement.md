# Movement and ball physics (engine rebuild, stage 4)

Stage 4 of the FM-style engine rebuild (stages 1–3: `kinematics.md`, `decisions.md`). Reference values read from the
FM27 Mobile config and ported as our own constants (FM measures in metres, the engine in yards; 1 m = 1.0936 yd,
1 mph = 0.4889 yd/s).

## Files

| File | Role |
|---|---|
| `Configs/MovementConfig.ts` | `MOVEMENT` constants (`MOVEMENT_OVERRIDES` env), FM distance bands (`passLengthBand`, `fmDistanceBand`) |
| `Configs/DecisionConfig.ts` | The switches: `DECISION_FLAGS.ROLLING_BALL`, `DEFLECTIONS`, `SHOT_BLOCKS`, `BACK_LINE`, `SECOND_PRESSER`, `SUPPORT_SHORT`, `ANTICIPATION_PRESS` (all on); `DECISION_OVERRIDES` / `simulateMatch(..., { decisions })` turn each off |
| `Domain/Movement.ts` (+ test) | Pure rules: `shotBlocker`, `robustMean`, `stepBackLine`, `blendLineX`, `firstPresserOf`, `standOffPoint`, `shortSupportOf`, `shortSupportAnchor`, `anticipationLookahead`, `anticipationInterceptMult` |
| `Infrastructure/ActionOutcomes.ts` | Dice: `resolveHeavyTouch`, `resolveDeflection`, `scatterDirection`, `resolveShotBlock`, `reboundSpeed`; `resolveInterception(..., anticipationMult)` |
| `Domain/gameState.ts` | Execution: `runLoose` (a ball off a body / bad touch), `updateBackLine`, the stand-off press target, the anticipation credit in `commitLooseBallChasers` |
| `Domain/DefensivePositioning.ts` | `setBackLineX`, `ballRelativeLineX`, the line blend, the second presser and the anticipating press start in `evaluateDefensiveDecision` |
| `Domain/OffBallMovement.ts` | Support comes short (`comesShort`) |
| `Domain/BallPrediction.ts`, `Configs/CohesionConfig.ts` | Line cohesion and the predicted ball (from the parked `feat/engine-cohesion`, `defensive-position.md`) |

FM reference: distance bands 5 / 9 / 13 / 18 / 22 / 27 / 31 / 35 m (short pass ≤ 9 m, long ≥ 31 m), speed ladder 1–8 mph,
thresholds 3 and 10 mph, pressure radius 12 m (`Pressure.ts`), tick 0.25 s (ours 0.2 s).

## 1. Rolling ball, deflections, blocked shots

- **Overhit through ball:** `PassState.overhit` = how far the landing point (after the pass-error noise) is beyond the aimed
  cell along the pass. On landing the residual speed is `LOOSE_BALL_INITIAL_SPEED + OVERHIT_SPEED_PER_YD (1.1) × overhit`,
  capped at `OVERHIT_MAX_SPEED` (9 yd/s); nobody reaching it, it rolls out of play through the existing
  `resolveOOBSetPiece` (throw-in / goal kick / corner). `LooseBallState.cause = 'overhit'` (≥ 1 yd).
- **Heavy touch:** a regular pass to feet (not from a set piece) is miscontrolled with chance
  `HEAVY_TOUCH_BASE (0.12) × length factor × (1 − first touch)`, length factor 0 at FM's short band (9 m) → 1 at the long
  band (31 m). The ball runs on in the pass direction at `HEAVY_TOUCH_SPEED` (6 yd/s); counted as a failed pass.
- **Deflection:** `DEFLECT_SHARE` (30%) of successful interceptions deflect: the ball leaves the interceptor at
  `DEFLECT_SPEED_SHARE × 28 yd/s` (≈ 9 yd/s), the pass direction turned by up to ±70°. Stats as an interception that
  failed the pass (`passFailed` / `throughBallLostInFlight`).
- **Blocked shot:** an open-play shot (`startShot`; not headers, chips, free kicks, penalties) with a defender (not the
  keeper, not recovering) within `SHOT_BLOCK_WIDTH` (1.8 yd) of its line, in its first `SHOT_BLOCK_DEPTH` (8 yd), is blocked
  with chance `SHOT_BLOCK_BASE (0.32) × (1 − perp / width)`. Still a shot (`shot` emitted); then `shotBlocked` and a rebound
  back toward the shooter (±75°) at 5–11 yd/s.
- All three go through `runLoose`: a `clearance`-source loose ball with `cause`, the toucher's team the last touch, chasers
  committed to where it stops (v² / 2a). Weather scales the speed like any loose ball. `ballRunsLoose` event; a loose ball
  leaving the pitch emits `ballOutOfPlay { cause }` (any cause, through balls included).

## 2. The back line as a robust mean

- Each tick (`updateBackLine`, live phases), the defending side's back-liners (CB / LB / RB / LWB / RWB) give their own shape
  target x (`computeDefensiveShapeAnchor` on the predicted ball); the wanted line is their **robust mean** (each clamped to
  ±`LINE_CLAMP_M` 6 m of the median).
- **States** (`stepBackLine`, `GameState.backLine`): holding, the line stays put until the wanted rate
  (gap / `LINE_REACTION_S` 1 s) passes `LINE_MOVE_MPH` (10 mph ≈ 4.9 yd); then it steps up or drops toward the wanted x at up
  to `LINE_MAX_MPH` (8 mph, FM's ladder top) and holds again below `LINE_HOLD_MPH` (3 mph ≈ 1.5 yd). Event `backLineState`.
- A zonal back-liner **holding shape** (not man-marking) targets `0.5 × own + 0.25 × line + 0.25 × ball-relative depth`
  (`ballRelativeLineX`: the ball's x minus the tactic's depth offset, the anchor's own term). `LINE_TRACK_MARK` 0: a
  back-liner tracking a mark keeps his mark (with markers in the blend the line cost ~45% of the shots, see below).
- The attacking side has no line (`setBackLineX(team, null)`).

## 3. Second presser stands off

`evaluateDefensiveDecision`: when the winning intent is `press_holder` and a teammate (not recovering) is already within
`FIRST_PRESSER_YD` (6) of the holder and closer than him, the decision is `press` with `standOff: true`: he moves to
`standOffPoint` — `STAND_OFF_YD` (5) from the holder on the line to his own goal centre, shifted `STAND_OFF_INSIDE_YD` (2.5)
toward the middle (the inside route and the pass back inside). Event `pressStandOff` once per (holder, defender).

## 4. Support comes short

`evaluateOffBall`: the holder's nearest outfield defender / midfielder within `SUPPORT_RANGE_YD` (22), when the holder's
raw pressure (`Pressure.ts`) is at least `SUPPORT_PRESSURE` (25, ~the 60th percentile at decisions), scores `offer_support`
× `SUPPORT_BOOST` (2.2) and searches around an anchor `SUPPORT_SHORT_YD` (8) from the holder toward him, never ahead of the
holder (half the search radius). Event `supportShort` once per (holder, supporter).

## 5. Anticipation

Lookahead (s) = `ANTICIPATION_BASE_S` (0) + `ANTICIPATION_SPAN_S` (0.7) × anticipation stretched to the world (roster / 10 ÷
`HOLDER_MIND.MENTAL_TOP` 0.65, capped at 1). Like every mental attribute it only counts with `HOLDER` on (off, everyone reads the world default: the
identity test of `HolderMind.engine.test.ts` holds).

- **Press start:** the defender's distance to the holder for the intent scores is the distance to the holder's predicted
  point (`vel` × lookahead) when that is closer, by at most `ANTICIPATION_PRESS_MAX_YD` (4).
- **Loose / through ball race:** when the chasers are picked, each one's ETA − `ANTICIPATION_CHASE` (0.5) × lookahead.
  `anticipationRead { kind: 'chase' }` when that changes who goes first.
- **Interception:** the chance × `1 + ANTICIPATION_INTERCEPT (0.3) × (anticipation − 0.29)`, clamped 0.6..1.5
  (`anticipationRead { kind: 'intercept' }` on a success above × 1.05).
- The parked cohesion branch's ball prediction (0.4 s, everyone) reads the ball for the shape; it is not per player.

## 6. Holder moves: frequencies and drawing

`HOLDER_MOVES` retuned (gates widened, weights raised): `SHIELD_NEAR_YD` 3.5, `SHIELD_WEIGHT` 0.6, `CUT_WIDE_YD` 10,
`CUT_MAX_YD` 45, `CUT_WEIGHT` 0.85, `LAYOFF_PRESSURE_YD` 7, `LAYOFF_MAX_YD` 20, `LAYOFF_RUN_SPEED` 0.5, `LAYOFF_WEIGHT`
1.15, `CHIP_MIN_DEPTH_YD` 3, `CHIP_MAX_YD` 28, `CHIP_KEEPER_OFF_LINE_YD` 4.5, `CHIP_WEIGHT` 2.6, `ROUND_RANGE_YD` 8,
`ROUND_WEIGHT` 2.

Drawing (top-down figures, `PixiPitch`, `holderMove` event; forwarded to H2H and watch): shield → `receive` pose, cut inside
→ `roulette` (turn), lay-off → `pass`, chip → `volley`, round the keeper → `stepover`. No new art.

## Statistics, `/test`, `/lab`

- `Statistics.ts` team counters: `ballsOutOfPlay`, `deflections`, `shotsBlocked` (this team's shots), `heavyTouches`,
  `lineStepUps`, `lineDrops` (this team defending), `pressStandOffs`, `supportShort`, `anticipationReads`.
- `/lab`: `TeamRawStats` → `balanceWorker` → `PerMatchView` / `VariantSummary` (`avgBallsOutOfPlay` … `avgAnticipationReads`)
  → `PairDetail` rows ("Rolled out of play", "Deflected passes", "Shots blocked", "Heavy touches", "Line step-ups",
  "Line drops", "Second presser stand-offs", "Support comes short", "Anticipation reads").
- `/test`: overlay **Movement** (the back line: teal hold, green step up, orange drop; yellow ring = a second presser's
  stand-off point; pink line = a loose ball's roll to its stop), debug category `movement`; scenarios
  `movement-rolling-ball`, `movement-shot-block`, `movement-second-presser`, `movement-back-line`, `movement-anticipation`.
- `scripts/decision-baseline.ts` prints the counters per match ("per match: …", with tackles, fouls, interceptions).

## Measurements

2026-11-19. "Before" = main 12.25 (`2fca39fc`); "after" = this stage with every switch on (the cohesion commit included).
`decision-baseline.ts 200 <league> --chunks 3` (seed 9000, `Math.random` seeded per match, AI formations, balanced,
fitness 88), per match, both teams:

| | Premier before | Premier after | Championship before | Championship after |
|---|---|---|---|---|
| Goals / shots / xG | 2.135 / 5.43 / 2.96 | 2.025 / 5.79 / 2.85 | 1.755 / 5.12 / 2.79 | 1.650 / 5.41 / 2.62 |
| Passes (completed %) | 50.3 (94.5%) | 48.8 (93.2%) | 50.3 (94.2%) | 48.8 (92.9%) |
| Tackles / fouls / interceptions | 4.46 / 9.88 / 4.03 | 3.88 / 9.97 / 4.29 | 4.32 / 9.99 / 3.44 | 3.68 / 9.50 / 3.11 |
| Turnovers | 22.7 | 22.4 | 21.0 | 20.0 |
| Rolled out of play / deflections / heavy touches / shots blocked | — | 0.63 / 1.40 / 0.63 / 0.03 | — | 0.65 / 0.92 / 0.77 / 0.02 |
| Line step-ups / drops | — | 5.9 / 49.4 | — | 6.0 / 50.4 |
| Stand-offs / short supports / anticipation reads | — | 23.6 / 50.6 / 4.3 | — | 28.1 / 54.8 / 2.4 |
| Moves: shield · cut · lay-off · chip · round | 0.41 · 0.85 · 0.55 · 0.42 · 0.56 | 1.54 · 2.02 · 3.00 · 1.46 · 1.32 | 0.32 · 0.41 · 0.43 · 0.28 · 0.22 | 0.95 · 0.91 · 2.68 · 1.31 · 1.01 |
| Move successes: shield held · chip goals · keeper rounded | 0.02 · 0.13 · 0.38 | 0.07 · 0.30 · 0.86 | 0.04 · 0.08 · 0.14 | 0.04 · 0.23 · 0.60 |

World volume (`ai-formation-goals.ts --engine 800 --chunks 3 --modes ai --quick 0`, unseeded): premier_league 2.066 →
1.995 goals (−3.4%), 5.66 → 5.61 shots (−0.9%); of_championship 1.631 → 1.623 (−0.5%), 5.03 → 5.17 (+2.8%). The quickSim is
not recalibrated (stage 5 retunes the goal volume).

**M4** (`decision-baseline.ts 1200 premier_league --chunks 3 --mental 8,3 --same`: the same club both sides, mental 8 vs 3,
sides swapped every other match): main +3.1 pp V−D (35.9 / 31.3 / 32.8%); this stage with `ANTICIPATION_INTERCEPT` 0.6
+9.2 pp (39.4 / 30.3 / 30.3%), with 0.3 (final) **+5.8 pp** (37.8 / 30.3 / 31.9%). Noise ≈ ±2.4 pp.

Isolation (`DECISION_OVERRIDES`, every stage-4 switch off but one, 60 Premier matches, same seeds; ±0.2 goals of noise):
all off 2.48 goals / 5.88 shots; rolling ball 2.25 / 5.60; deflections 1.80 / 5.23; back line with the markers in the blend
1.37 / 4.08, without them (`LINE_TRACK_MARK` 0, kept) 2.07 / 5.27, lighter blend 0.7 / 0.15 / 0.15 1.78 / 4.48, no
hysteresis 1.73 / 4.55; support short 1.78 / 5.33; anticipation 1.90 / 5.53; second presser 2.40 / 5.83.

Move tuning (Premier, 200): the stage-3 weights with wider gates gave 0.52 · 1.09 · 0.61 · 0.76 · 0.87; shield 0.7 and
lay-off 1.3 gave 5.2 and 5.5 (each move's frequency is steep in its weight); cut 0.95 gave 4.4. Final as above.

## Limitations

- Moves in the Championship: shield 0.95 and cut inside 0.91 per match, just under the 1–3 target (Premier 1.5 and 2.0).
- Passes 93% completed (was 94.5%): deflections and heavy touches are failed passes.
- Shot blocks are rare (~0.02 per match): the engine's shooters shoot with a clear line by construction (the shot score
  reads the pressure and the lane). Wider gates cost goals.
- The back line drops far more often than it steps up (≈ 49 vs 6 state changes per match): the attack mostly advances while
  a side defends; the line state resets every time the side wins the ball.
- Anticipation is a lookahead and a credit, not a per-player prediction of the pass (the shape's ball prediction is the
  same for everyone).
- Heavy touch and deflection share one loose-ball model with the through ball (deceleration, chasers); no spin or bounce
  height.

## FM numbers (stage 4b)

Stage 4b adds a sliding block (shape up behind the ball in possession, dropped out of it), calm pressing (press intent scaled by the holder third, shape shift toward the ball), short movement steps (DEF 4.4 / MID 6 / FWD 7 yd) and intent hysteresis. See `fm-numbers.md`.
