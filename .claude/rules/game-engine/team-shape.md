# Team shape, pass-shadow press, held actions, shoulder runs (engine rebuild stage 15)

Config `Configs/ShapeConfig.ts` (`TEAM_SHAPE`, env `SHAPE_OVERRIDES`), flags in `DECISION_FLAGS` (`FM_SHAPE`,
`OOP_ZONES`, `PASS_SHADOW`, `ACTION_HOLD`, `SHOULDER_RUNS`, all on). Numbers before/after: `fm-numbers.md` → "Etapa 15".
Nothing here is calibrated (volume is stage 21).

## The block (`FM_SHAPE`, `Domain/TeamShape.ts`)

- `fmShapePoint(slot, …)` maps each formation slot into FM's block: the back four's mean on the back line, the front
  two `IN_SPAN_YD` / `OUT_SPAN_YD` (29 / 26) ahead, the outfield width `IN_WIDTH_YD` / `OUT_WIDTH_YD` (40 / 37) around
  y 37 (× the width tactic). Slot order is kept (`shapeTemplate`, cached per formation and phase).
- Back line (`backLineTarget`, yd from own goal): in possession 58 + 0.5 × (ball depth − halfway), within 30..75; out
  of possession 24 + 20 × (DEFENSIVE_LINE_HEIGHT − 0.6) + 0.35 × (predicted ball − halfway), within 8..42.
- Used by `attackingAnchor` (box convergence kept, no possession push-up) and `computeDefensiveShapeAnchor` (the
  lateral slide stays; the old X tracking, out-of-possession drop and lane-block nudge are skipped).
  `ballRelativeLineX` returns the FM target, so the stage 4 back line follows it.
- A back-liner holding or marking never drops more than `LINE_SLACK_YD` (1.5) behind the line.
- `APPLY_IN` / `APPLY_OUT` (1 / 0) switch each phase off for measurement.

## Out-of-possession zones (`OOP_ZONES`)

Each defending outfielder owns the zone of his shape anchor (`zonesOf`). A zone is vacant when its owner is not
holding the shape or is `ZONE_LEFT_YD` (10) away. A vacant zone within `COVER_BALL_YD` (30) of the ball is covered,
nearest the ball first, by the holder with the best `zoneScore − 0.35 × distance` (FM's scores: home 17, neighbour 14,
next line 11, far 5, +3 for a covering role on the line behind / a pressing role ahead; a centre-back only scores his
own line), within `COVER_MAX_YD` (20), when it is at least `COVER_GAIN_YD` (3) deeper or nearer the ball than his own.
One step, no chains; a cover still valid is kept next tick. The cover replaces his `hold_shape` anchor. Event
`zoneCover` (once per spell), debug `movement`.

## Pressing states and the pass shadow (`PASS_SHADOW`)

- `pressStateOf(ball, dir)`: 3 × depth third (from the defending side's goal) + lateral third; event `pressState`
  every defending tick (seconds by third in `Statistics`).
- A forward who presses with the state ≥ `SHADOW_FROM_STATE` (3: the ball out of our third) runs to `passShadowPoint`:
  the midpoint between the holder and the receiver within 35 yd nearest the presser, never closer than 4 yd to the
  holder. Event `shadowPress` once per (holder, presser).

## Actions held by time (`ACTION_HOLD`, `Domain/ActionHold.ts`)

A clock of seconds of play. A short action (off the ball: `offer_support`, `make_run`; defending: `track_mark`,
`step_into_carry_lane`) is held `SHORT_HOLD_S` (5) unless possession changes; coming short to a pressed holder and
`press_holder` break it. The default action (hold the shape / the space) keeps the stage 4b hysteresis. Clock and
locks reset in `createMatchState` and whenever the match time goes back or the phase changes (a `/test` state).

## Runs on the shoulder (`SHOULDER_RUNS`, `Domain/ShoulderRuns.ts`)

A runner with intent `make_run`, within −1..3 yd behind his read of the line, with a free teammate on the ball within
45 yd, goes when the holder plays forward (pass, through ball, long ball, cross) after `REACT_S × (1 − anticipation)`,
or early with chance `EARLY_PER_S × (1 − anticipation)` per second. While going (`GO_S` 1.5 s) he is not held onside
and his target is 10 yd beyond him; the call at the pass decides the offside. Event `shoulderRun { early }`, debug
`offside`.

## Surfaces

`/test`: overlay **Shape** (back-line targets of both teams, zone covers as yellow squares, the forward's shadow
point, a green ring on a shoulder run, a bar for the held short action); scenarios `fm-shape-shadow`, `shoulder-run`.
`/lab`: `shadowPresses`, `zoneCovers`, `shoulderRuns`, `shoulderRunsEarly` → `avg*` → PairDetail rows.
`scripts/fm-targets.ts` prints them with the pressing-state shares and offsides per pass.

## Limitations

- The FM block crowds the ball: 3+ defenders within 8 yd of it in 11.5% of live ticks (5.6% before). Neither the line
  clamp nor the width is the cause (switched off one at a time); the block keeps its span instead of compressing on
  the ball, and the ball spends more time out of midfield (ticks by third 15 / 70 / 15 → ~24 / 52 / 24).
- Transitions are slow: after a turnover defenders sit ~20 yd above the new line and need 5–10 s to drop, so the
  measured back line out of possession is 38.8 (target 24) and in possession 49.7 (58).
- The default positioning is still held ~3–5 s (FM 10–20): what ends it is the change of possession (a possession
  lasts ~12 s) and loose balls, not the decision.
- Volume moved (not calibrated): goals 6.8 → 9.3, shots 26 → 38 per match on the physical clock.

## Stage 21: the line that holds

`OUT_BACK_YD` 24 → 20 and `OUT_SPAN_YD` 26 → 22; markers hold the back line too (`MOVEMENT.LINE_TRACK_MARK` 1, weights
own 0.2 / line 0.4 / ball 0.4); a player out of possession more than `RECOVER_GAP_YD` (8) yd up the pitch from his
target runs back at `RECOVER_SPEED_MULT` (1.6) × his speed (`gameState.ts`, movement). Measured out-of-possession line
38 → 29 yd (FM 24), ball crowd 16 → 13% of the ticks. The line lags its target after each turnover (~264 a match):
that lag, not the target, is the remaining gap. See `fm-numbers.md` → "Etapa 21" → "Rodada da forma sem a bola".
