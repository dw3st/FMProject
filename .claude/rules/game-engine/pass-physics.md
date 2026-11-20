# The physical pass (engine rebuild stage 4)

A pass is a physical launch of the 3D ball (`ball-3d.md`), no longer a fixed flight time: FM's speed and height for its
type and distance, the passer's error on the launch vector, and it arrives where and when the ball gets there. Flag
`PASS_PHYSICS` (`DecisionConfig.ts`, on; needs `BALL_3D`). With it off the pass is the one of stage 3 (fixed `t`, the
landing error of `PASS_ERROR`): `fm-targets.ts` with `DECISION_OVERRIDES='{"PASS_PHYSICS":false}'` gives the counts of
before. Constants in `Configs/PassPhysicsConfig.ts` (`PASS_PHYSICS`, env `PASS_PHYSICS_OVERRIDES`); parts switchable
for measuring: `MEET` (the receiver goes to meet the ball) and `ARRIVAL_LANE` (the pass score reads arrival times).

## Files

| File | Role |
|---|---|
| `Configs/PassPhysicsConfig.ts` | FM's launch: speed 7 + 0.45·d m/s, vz by distance (0.85 / 1.8 / 4.7 / 10.2 / 14.3 m/s at 5 / 15 / 25 / 37.5 / 62.5 m), peaks by type (cross 4.0 m, corner 5.6 m, long ball and clearance 4.4 m), the reach of a moving ball, the lane timing |
| `Domain/PassPhysics.ts` (+ test) | Pure: `groundLaunch`, `aerialLaunch`, `launchWithError`, `landing`, `reachAlong`, `passTypeOf`, `rollTime`, `weightedSpeed`, `arrivalLaneScore`, `buildGroundLaunch`, `buildAerialLaunch` |
| `Domain/BallSync.ts` | `launchPass` uses the stored launch (`BallState.free`); `advancePassBall` moves a physical ground pass in sub-steps and returns who it reached, whether it stopped or went out |
| `Domain/PassError.ts` | `passErrorFactor` (the same factor as `PASS_ERROR`, now applied to the vector) |
| `types.ts` | `PassType`, `PassPhysicsLaunch`, `PassState.physics` / `.header`, `BallState.free` |

## Rules

- **Launch:** ground passes and through balls from the foot, `|v| = 7 + 0.45·d` m/s with FM's vz of the distance
  (a ball beyond ~15 m hops, 25 m is a chip); a through ball is weighted for the runner (`weightedSpeed`: it reaches the
  cell when he does, never faster than FM's speed for the distance nor too slow to get there). High balls (cross,
  corner, long ball, clearance) take the vz that gives their type's peak and the horizontal speed that lands them on the
  target; a lofted pass to feet (> `LOFT_YD`) the vz of its distance. A clearance after a high ball starts from the
  head; a knock-down is a header pass (`PassState.header`, from the head, the heading skill as the error).
- **Error:** the factor of `PASS_ERROR` (technique margin and pressure, set pieces 0) on the vector: the direction
  turns by 2.5°·factor·z0, the horizontal speed × (1 + z1·0.075·factor), vz + z2·0.7·0.075·factor·|v| (never below 0).
  Weather `aerialError` multiplies the error of high balls. Three normals from `matchRandom` per launch.
- **Types** (`passTypeOf`): ground (vz ≤ 1 m/s), driven (≤ 3), chip; through low / high; cross, corner, long, high
  (lofted pass), clearance, header. Event `passLaunched { type, distance, speed, vz, aimX, aimY, toX, toY, T }`.
- **Arrival of a ground pass:** the core moves the ball (`advancePassBall`, sub-steps of 0.02 s). The receiver goes to
  meet it on its path (`chase_loose_ball` with `meet`, toward the nearest point of the path ahead of the ball). It
  arrives when the ball comes within his reach (1.3 yd + 0.8 yd × first touch from the ball's path, 1 yd for a ball moving past a running chaser); a ball that
  passes him or stops is a miss (`passFailed` + `passMissed`) and runs loose at its own pace ("misplaced"). A through
  ball is reached by the runner or a committed chaser of the passer's team; otherwise it becomes loose from where it is
  once it covers its distance, at its speed. A loose ball moving faster than 2 yd/s is picked up within 1 yd of the
  segment it travelled that tick.
- **High balls:** the landing point is where the physics lands it (not the old Gaussian). The aerial duel at the
  landing point and everything after it are unchanged (contact in the air is stage 10).
- **Interception:** physical since stage 5 (`interception.md` → "Stage 5"): defenders who reach a point of the path in
  time run there and touch the ball (no dice for the touch to happen); with `PHYSICAL_INTERCEPTION` off, the old dice,
  skipped while the ball is above an outfield player's reach.
- **Pass score:** up to `LOFT_YD` the lane is `arrivalLaneScore`: for each point of the path the time the ball needs
  (rolling at the ground deceleration) against the time the quickest defender needs (reaction 0.25 s + his press
  speed), clear when the ball is 0.5 s earlier everywhere.

## Surfaces

- `Statistics.ts` team counters `passGround`, `passDriven`, `passChip`, `passHigh`, `passThroughLow`,
  `passThroughHigh`, `passHeader`, `passLaunchSpeedSum/N` → `/lab` `TeamRawStats` → `avgPass*`, `passLaunchMps` →
  `PairDetail`.
- `fmTargets.ts` / `fm-targets.ts`: section "The physical pass": launch speed and vz by distance band (R6), share to the
  intended receiver by vz band and flight time by distance (R7), landing vs aim for crosses, corners, long balls and
  lofted passes (R9 §3).
- `/test`: scenarios `pass-physics-ground`, `pass-physics-chip`, `pass-physics-off-target`, `pass-physics-through-high`;
  overlay **Pass error** (the 1-σ spread across the pass at each teammate with the ball held; the aim and the real
  target of a physical pass in flight); **Ball 3D** predicts a physical pass by free physics. Debug category `pass`.

## Measured (`fm-targets.ts 60 premier_league --chunks 1`, seed 9000, compressed clock)

Before = stage 3 (`feat/engine-fm`), after = `PASS_PHYSICS` on. Full table in `fm-numbers.md` → "Stage 4".

| | Before | After | FM |
|---|---|---|---|
| Launch 0–10 / 10–20 / 20–30 / 30–45 / 45+ m, \|v\| (m/s) | — | 9.7 / 13.3 / 17.3 / 21.3 / 28.6 | 9.7 / 14.2 / 19.6 / 24.5 / 31.3 |
| … vz (m/s) | — | 0.97 / 1.82 / 5.19 / 9.26 / 9.69 | 0.85 / 1.8 / 4.7 / 10.2 / 14.3 |
| To the receiver by vz ≤1 / 1–3 / 3–6 / 6–10 / >10 | — | 97 / 96 / 81 / 40 / 18% | 92 / 90 / 79 / 32 / 30% |
| Flight 0–8 / 8–13 / 13–18 / 18–23 / 23–30 / 30+ m (s) | — | 0.6 / 1.0 / 1.4 / 1.4 / 1.6 / 1.8 | 0.65 / 0.95 / 1.18 / 1.45 / 1.75 / 2.4 |
| Peak cross / corner / long (m) | 1.31 / 2.15 / 1.85 | 3.97 / 5.78 / 4.40 | 4.0 / 5.6 / 4.4 |
| Landing vs aim, median (p90), cross / corner / long / lofted (m) | — | 2.7 (7.1) / 3.0 (6.3) / 0 (8.2) / 4.6 (9.2) | 6.8 (12) / 4.9 (19) / 4.6 (11) / 7.4 (17) |
| Regular passes / through balls to the receiver | 90.3 / 71.5% | 96.4 / 55.3% | — |
| All kinds to the receiver (opponent) | 78.6% (15.2%) | 84.2% (11.5%) | 82% (13.5%) |
| Goals / shots / xG | 1.48 / 4.70 / 2.25 | 1.03 / 2.80 / 1.40 | 1.5 / 21.5 / — |

Mechanism check (20 matches, `PASS_PHYSICS_OVERRIDES`): without the meet, regular passes reach the receiver 49% of the
time (the ball runs past a receiver who stands still); without the arrival lane score shots are 3.15 against 2.10.
Nothing tuned for volume.

## Limitations

- Shots fall 40% and goals 30% (4.70 → 2.80, 1.48 → 1.03 per compressed match): passes now take FM's time (a 15-m pass ~1.2 s instead of
  0.55 s) and the defence recovers; the arrival lane score makes the holder pick safer passes. Volume is calibrated at
  the end of the rebuild.
- The launch speed falls short of FM's by 10–13% beyond 20 m: the ball's |v| is |v| at the launch, and the vz table
  takes part of it.
- The landing error of high balls is a third to a half of FM's: FM's spread is bigger than the error factor gives.
- A long ball's median landing error is 0: most are played by set-piece takers or clearances with factor 0.
- Through balls reach the runner 56% of the time (71% before): a ground ball at the runner's pace is met by the defender
  as often.
- Remote modes (two managers, watching) draw as before; no visual change beyond the real ball.
