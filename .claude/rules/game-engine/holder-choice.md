# The FM ball-holder chooser (engine rebuild stage 8)

Flag `FM_HOLDER` (`Configs/DecisionConfig.ts`, on). Constants in `Configs/HolderChoiceConfig.ts` (`HOLDER_CHOICE`, env
`HOLDER_CHOICE_OVERRIDES`); the picker is pure in `Domain/HolderChoice.ts`; the candidates are built in
`DecisionTree.ts` → `fmHolderChoice`. With the flag off the holder decides as in stage 4b (`fm-numbers.md` §2, the
seven compressed action scores, the holder's mind σ noise, hold / turn from `holderStepOf`). The keeper and set-piece
takers keep the old rules.

## Candidates (~10–25 per decision)

Each has a category (FM: 0 pass, 1 kick, 2 turn, 3 hold, 4 carry), a value 0..1 (the evaluator's compressed score after
the mind gates), a category multiplier relative to a carry (FM's measured medians, report 6: carry 0.36, hold 0.41, turn 0.72 → hold × 1.14, turn × 2; pass, kick, carry × 1) and a risk byte 0..100.

| Candidate | Category | Value | Risk (100 = vetoed) |
|---|---|---|---|
| Pass to each teammate (`pass`, `pass_lofted` beyond `LOFT_YD`) | 0 | compressed pass quality + role bias | offside receiver or lane ≤ `PASS_VETO_LANE` → 100; else (1 − lane)² + miss loss |
| Lay-off move | 0 | move score | 15 |
| Through ball, the best `TB_CANDIDATES` cells | 0 | cell score + flair | race ≤ `TB_VETO_RACE` → 100; else (1 − race · (1 − lane risk))² |
| Cross, each box target | 0 | cross score | defenders' share² |
| Long ball | 0 | long-ball score | 1 − `LOFT_KEEP` |
| Shot, chip | 1 | shot score (FM xG) | 0 |
| Carry, each lane (3 + intent lanes) | 4 | compressed lane score | clearance ≤ `CARRY_VETO_CLEARANCE` → 100; else (1 − clearance)² |
| Sprint (5.5-yd step, full acceleration) | 4 | best lane × (0.7 + 0.4 · acceleration), only with `SPRINT_CLEAR_YD` (12) of open lane, radius 4 | as the lane |
| Byline run (wide outside the box, ≤ 35 yd from the end line) | 4 | straight-down lane × (0.6 + 0.4 · passing) | as a lane |
| Dribble, cut inside, round the keeper | 4 | their scores (+ flair) | 1 − win chance; 20; 30 |
| Turn (moving > `TURN_DEG` from the best way forward) | 2 | best lane × (0.5 + 0.5 · how far off) | opponent closeness |
| Spin past the marker (back to goal, marker ≤ 3 yd on his goal side) | 2 | dribbling, acceleration, flair roll; × (1 − pN/2) | 1 − win chance vs the marker |
| Hold (wait for support) | 3 | `HOLD_BASE` + `HOLD_SUPPORT` × teammates arriving; × (1 − pN/2) | opponent closeness |
| Shield move | 3 | move score | 10 |
| Corner-flag hold (leading, minute ≥ 85, ≤ 18 yd from the flag) | 3, multiplier 1 (FM's own type) | `FLAG_VALUE` | pN / 2 |

The mind gates (`HolderMind.ts`) act on the values as before: release under pressure (no dribble, carry × 1.3, long ball
× 1.3, pass × 0.6), simple-minded (through ball only with race ≥ 0.5, no aerial beyond 30 m, dribble only with the
bias), long-shot range (no shot beyond it), facing away (backward passes × (1 + w)), flair bias (shot from range,
dribble, through ball). Under the one-on-one gate (`pass.md`) the passes / cells / crosses it rejects are left out.

## Pick

`s = value × multiplier × 10 000` (× f24 = min(5 · v², 1) for a kick; a pass with risk − quality > 50 ÷ 1 + 0.05·(…));
above the cap (100 − risk)³ / 10 only 10% of the excess is kept; never below 1. Hard argmax; ties go to the lower risk,
then the higher quality byte. Noise: each score × (1 + U(−0.2, 0.2)) only when the decisions roll of the mind window
lapsed (`HolderMindState.lapse`); the σ noise of stage 4b is not used. All candidates vetoed → hold. A pass carries its
receiver (`targetId`), so `startPass` no longer picks among the top three.

## Actions and cadence

New carry steps (`HolderStep`): `sprint` (step 5.5 yd, ≤ 1.4 s, carry speed + acceleration × 1.5), `byline` (2.2-yd
step down the wing), `spin` (0.6 s at × 0.7), `flag` (2 s at × 0.15, to the flag then shielding), `hold` (1.2 s at
× 0.25) and `turn` (0.7 s at × 0.45). The holder re-decides when the action ends; only a challenge coming in (an
opponent within 3 yd who was farther when the action began) cuts it short — the 24-yd "read every tick" zone and the
closing-in interrupt of stage 4b are off with the flag.

## Surfaces

- Events: `holderChoice` (every FM decision: category, kind, candidates, vetoed, compressed, lapse), `holderCandidates`
  (debug only: the whole list), `holderStep` (also sprint / byline / spin / flag). Debug log `decision`.
- `Statistics.ts` (team): `holderChoices`, `holderChoiceCarry/Pass/Turn/Hold/Kick`, `holderStints` (a new holder of the
  team starts one), `holderCandidatesSum`, `holderVetoedSum`, `holderLapseChoices`, `holderSprints`, `holderBylines`,
  `holderSpins`, `holderFlagHolds`.
- `/lab`: `TeamRawStats` → `balanceWorker` → `PerMatchView` / `VariantSummary` (`holderCarryPct` … `holderKickPct`,
  `holderDecisionsPerStint`, `holderCandidatesPerDecision`, `holderVetoedPct`, `avgHolderSprints` …) → `PairDetail`.
- `/test`: "Decision Scores" with the holder selected lists the FM candidates (value, risk, score; vetoed struck
  through, compressed marked `*`, the pick in amber). Scenarios `fm-holder-hold`, `fm-holder-flag`, `fm-holder-sprint`.
- `fm-targets.ts` counts spin as a turn and the flag hold as a hold (`holderCategory`).

## Not done

- 2D animations of hold, turn, sprint and the corner-flag shield (the drawing needs the user's go with real prints).
- FM's value and multiplier functions were not read in full (report 5 §1): the values are our evaluators' scores, the
  multiplier only FM's 0.5 for turn and hold; the category weights are all 1 as in FM.
- Measured against FM in `fm-numbers.md` → "Etapa 8"; nothing calibrated (stage 21).

## Stage 9: shots from outside the box (`LONG_SHOTS`)

Flag `DECISION_FLAGS.LONG_SHOTS` (on, needs `FM_XG`). Config `Configs/ShotGateConfig.ts` (`SHOT_GATE`, env
`SHOT_GATE_OVERRIDES`), pure helpers `Domain/ShotGate.ts` (+ test). Off = the stage-4b shot (33-yd limit to the goal
mouth, value = the role-compressed FM xG).

- **Gate** (FM report 5/6): a shot candidate only within `GATE_M` (30 m) of the goal centre; factor × 0.75 in the box
  (16.459 m deep, 20.117 m either side of the axis), × 0.6667 anywhere else in the gate.
- **Value**: factor × (`VALUE_FLOOR` + (1 − floor) × min(1, (clean xG / `XG_REF`)^`VALUE_POW`)), floor 0, ref 0.25,
  pow 0.5. The clean xG is the FM xG with only the keeper on the pitch: the defenders in the way are not read by the
  decision (no "clear line" any more), they block the ball in flight (stage 7). Same reference for every role (FM's
  kick multiplier is always 1); only the shooting level (`shotLevelMult`, defenders "rarely") scales it. FM's own value
  function was not read: this is the stand-in.
- **Kick multiplier** `KICK_MULT` = 1 / 0.36 (FM: kick multiplier 1.0, carry median 0.36), the same derivation stage 8
  used for turn and hold; replaces the kick's 1 in `CAT_MULT` with the flag on. f24 still applies.
- **Chip** (`chipMove`): only over a keeper `CHIP_KEEPER_OFF_YD` (8) off his line and within the gate, valued like any
  shot (no `CHIP_WEIGHT` boost). It was ~50% of the shots at stage 7.
- `/test`: scenario `long-shot-block` (nothing forced; Decision Scores → Shoot shows "gate ×f · m · clean xG").
  `Statistics.ts` (team): `shotDistSumM`, `shotsOutsideBox`, `shotsLowLaunch` (vz ≤ 3 m/s) from `shotLaunched`
  (`fromM`, `outsideBox`). `/lab` `PairDetail`: shot distance, outside-box %, struck-low %. `fm-targets.ts`: shot share
  by distance against R8, outside-box %, mean distance, low launches.
- Tests that read the stage-8 shot value now set `LONG_SHOTS: false` (`OneOnOne.test.ts` second case, the chip and
  round-the-keeper rows of `HolderMoves.test.ts`): with the kick multiplier the plain shot wins those scenarios.
- Not calibrated (stage 21): shots per match more than double; numbers in `fm-numbers.md` → "Etapa 9".

## Stage 21 category multipliers

`CAT_MULT` (pass, kick, turn, hold, carry) [1, 1, 2, 1.14, 1] → [1, 1, 2.3, 1.4, 0.95]: holder mix carry 38 / pass 42 /
turn 10 / hold 9 / kick 0.8 (FM 44 / 34 / 12 / 9 / 1). Knife-edged: carry 0.92 drops carries to 33% and dribbles to a
third. `HolderMoves.test.ts` keeps the stage-8 multipliers (a shield beats the lay-off at 1.4).

## Finishing on the shot value (12.34.1)

The weak leagues shot twice as often as the strong ones (Série C 25 shots and 4.3 goals a match, Premier 12 and 2.3):
the shot value read only the geometry. It is now × (shootAccuracy / `FINISH_REF` 0.55)^`FINISH_POW` 1, within 0.35..1.25
(`ShotGateConfig.ts`, `finishingShotMult`). 16 matches each (AI formations): Série C 5.2 → 3.0 goals, 34 → 22 shots;
Premier 3.3 → 2.9, 29 → 26. The quickSim's `LEVEL_EXPONENT` went −0.97 → 0 to follow. A full recalibration is pending.
