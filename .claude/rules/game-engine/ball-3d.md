# The 3D ball (engine rebuild stage 3)

The ball is an object with `x, y, z` and `vx, vy, vz` (yards, yards per second of the sim step). Flag `BALL_3D`
(`DecisionConfig.ts`, on). With it off nothing changes: `fm-targets.ts` with `DECISION_OVERRIDES='{"BALL_3D":false}'`
gives exactly the counts of the commit before (same seeds).

## Files

| File | Role |
|---|---|
| `Configs/BallPhysicsConfig.ts` | `BALL_PHYSICS`: gravity (9.81 m/s² = 10.73 yd/s²), restitution 0.55, horizontal grip on a bounce 0.82, settle speed, sub-step 0.02 s, reach heights, shot crossing heights. Physical constants, not tuning |
| `Domain/Ball3D.ts` (+ test) | Pure physics: `stepFree` (gravity, bounce, rolling), `stepGuided`, `launchToward`, `launchVz`, `predictPath`, `landingPoint`, `reachHeight` |
| `Domain/BallSync.ts` | `syncBall` (called by `tickState` after every tick), `advanceLooseBall` (called by `handleLooseBall`), `ballWithinReach`, `ballEnv`, the flight keys |
| `types.ts` | `GameState.ball?: BallState` (`phase` held / pass / shot / loose, `kind`, `peak`, `air`, `bounces`, `ended`) |
| `Configs/WeatherConfig.ts` | `WeatherEffect.bounce`: rain 0.8, snow 0.6 (multiplies the restitution); rolling friction is `looseDecel` as before |

## Rules

- **Pass / shot in flight:** the engine still decides when it arrives (the flight progress `t`; a free physical pass is
  stage 4, the shot by its trajectory stage 7). At the kick the ball is launched from the kicker toward the target:
  a high ball (cross, long ball, clearance) or a lofted pass flies with no friction and a vertical speed that lands it
  on the target at the end of its flight time (peak = g·T²/8); a ground pass rolls and slows down (`LOOSE_BALL_DECELERATION`
  × weather). Every step the horizontal speed is the one that reaches the target in the time left (a regular pass to a
  player follows him); the height is free physics. `getBallPos` reads the 3D ball while a flight it belongs to is in the
  air, so interceptions see the physical ball (constant speed in the air, fast then slow on the ground, no more smoothstep).
- **Shot:** from the foot (0.12 yd) or the head (1.95 yd) to a crossing height on the goal line picked from the shot's
  geometry (0.2–2.3 yd, header 0.25–1.3 yd), no draw. At the fixed shot time (0.5 s) shots are nearly flat.
- **Loose ball:** keeps the height and vertical speed the ball had (a high ball nobody reached lands and bounces, a
  blocked or parried ball keeps its height), then `handleLooseBall` moves it with `stepFree`: on the ground exactly the
  rolling of before, in the air sub-steps of 0.02 s with bounces. It goes out of play by its real position (touchline →
  throw-in, goal line → goal kick / corner; the existing `ballOutOfPlay`).
- **Reach:** a loose ball above a player's reach (outfield 2.4 yd ≈ 2.2 m, keeper 3.0 yd ≈ 2.75 m) can't be collected
  (`ballWithinReach`); he plays it when it drops under his head or after the bounce. The aerial duel at the landing
  point is unchanged (contact in the air is stage 10).
- **Held:** at the holder's feet, z 0.
- No draws from the match generator anywhere in the ball.

## Events, statistics

- `ballFlight { team, kind, peak, air, distance, bounces, endZ }` when a pass / shot / loose spell ends; `BallState.ended`
  carries the same on the state of that tick (the `/lab` collector reads it). Debug category `ball`.
- `Statistics.ts` team counters: `highBalls` (flights peaking above 1.2 m, FM's "met in the air"), `ballAirSeconds`,
  `crossPeakSum/N`, `cornerPeakSum/N`, `longPeakSum/N` (long balls and clearances). Balls out of play were already
  `ballsOutOfPlay`.
- `/lab`: `TeamRawStats` → `avgHighBalls`, `avgBallAirSeconds`, `crossPeakM`, `cornerPeakM`, `longPeakM` (means, metres)
  → `PairDetail`. `fmTargets.ts`: `ballPeak` / `ballContact` per group, `FM_BALL` (R9 §3); `scripts/fm-targets.ts`
  prints medians against FM.
- `/test`: overlay **Ball 3D** (predicted path with dots raised by height, peak in gold, landing point); scenarios
  `ball-3d-long-ball` (flight, bounce, roll, out of play) and `ball-3d-high-loose` (above the reach). The Game State tab
  of the debug panel shows `ball`.

## Drawing

`ballHeight.ts` returns `state.ball.z` when the state has one; between two steps of the same flight with no bounce it
draws the real parabola at the frame's time (`elapsed`), else a blend. The drawn hops of a high ball that drops loose
(`bounceHeight`) are off with the 3D ball (the bounces are real). The remote modes (two managers, watching) still
draw the illustrative arcs: their frames carry no height (stage 22).

## Limitations

- Flight times are still the engine's (passes 28 yd/s, high balls 30 yd/s, shots 0.5 s), so the heights follow from
  them, not from FM's launch speeds (stage 4): see the measurement in `fm-numbers.md`.
- No air drag, spin or wind on the flight; the wind still acts through `aerialError`.
- A high ball lands on the grass at its target (contact height 0): the duel in the air is stage 10.
