# Player kinematics (acceleration, braking, turning)

Inspired by Football Manager's movement model (reverse-engineered; FM path ticks are 0.25 s, metres). Pure logic in
`src/GameEngine/Domain/Kinematics.ts`, constants in `src/GameEngine/Configs/KinematicsConfig.ts` (`KINEMATICS_CONFIG`).

## Rule

- Every player has a velocity (`GamePlayer.vel`, yd/s). Each movement step he accelerates toward his **top speed**, which
  is the speed the engine already computed for the action (pressSpeed + bursts, carrySpeed + burst, the chase sprint,
  × recovery and weather): the old speeds stay as the top speed, so the world's calibration stays close.
- **Acceleration** (FM's law, per second and in yards): `A(u) = 8.749 + 0.1667 u − 0.0762 u²` yd/s² (u in yd/s),
  × `(0.5 + 0.5 · acceleration)` (attribute 0..1) × `ACCEL_SCALE` (1), at least `ACCEL_MIN` (0.5). 8 m/s² from standstill,
  zero at 11.87 yd/s (10.85 m/s), above every top speed of ours.
- **Braking** `BRAKE` 7.655 yd/s² (FM 1.75 m/s per 0.25 s = 7 m/s²): a player toward a target slows to the stopping speed
  `√(2 · BRAKE · distance)` (at most BRAKE per step) and never overshoots (speed ≤ distance / dt). A top speed that drops
  (end of a sprint) is braked to; a beaten player in `recoveryTime` drops to it at once (the duel loser's stumble, #145).
- **Turning**: a heading change Δ > 20° (moving above 1 yd/s) caps the top speed this step at × (1 − min(Δ/2, 60)/100):
  90° × 0.55, 180° × 0.4. The heading follows the desired direction at once.
- **With the ball**: FM's distance to full speed is 16 − dribbling/5 m (dribbling 0..20). The carrier's acceleration is the
  lower of the normal law and `CARRY_ACCEL_SCALE` (3) × `vTop² / (2 × that distance)`. At 1 (FM as given) a standing
  carrier needed ~4 s to reach his carry speed and the engine lost ~21% of its goals (below).
- **Continuity** (`carriedVelocity`, `gameState.ts`): the velocity carries into a step only when the last kinematic step
  was the previous step (`kin.t` one step back in `matchTime`) and ended where he stands (`kin.x/y`). A teleport (set
  piece, kick-off, half-time, swap), a freeze (set-piece countdown, VAR) or a step he did not move in (holder passing)
  starts him from standstill. A pass receiver keeps his velocity (he moved in the previous step).
- **Sites**: every non-holder movement (formation/positioning, press, man-marking, off-ball runs, chase sprints), the
  carrier (`carryAlong`, no arrival, clamped to the pitch), the post-reception burst and the dribble approach (full tilt at
  the defender, no braking). Exempt: the keeper's reaction to a shot in flight (a dive, not a run: no ramp).
- **Race estimates** (`etaTo`, `timeToCover`): through-ball race margin (`ThroughBallCells.etaToCell`), loose-ball chaser
  selection and the sweeper (`commitLooseBallChasers`), the keeper's loose ball in his box. Seconds from the velocity
  component toward the point (≥ 0) with the law at the mid speed of the run-up, taken constant; turning and braking ignored.
- **Foul compensation** `FOUL_MULT` 0.9 on every foul chance while the layer is on: carriers caught from behind drew ~20%
  more tackle attempts and +11% fouls.
- **Off switch** `ENABLED: false`: the engine before kinematics bit for bit (positions and race estimates as before,
  `FOUL_MULT` × 1). Checked: 1600 seeded matches off = the clean main, every statistic identical.

## Statistics, `/test`, `/lab`

- `Statistics.ts`: `distanceCovered` (yards, live periods) and `sprints` (speed ≥ `SPRINT_FRACTION` 0.85 × the player's
  top running speed — pressSpeed, carrySpeed with the ball — for `SPRINT_SECONDS` 1, one per run), per player and team,
  from the `playerMoved` event (one per movement pass: `[id, yards]` pairs and the sprint starts). Live `StatsPanel`:
  columns DST and SPR.
- `/test`: overlay **Kinematics** (velocity vector 0.6 s ahead, orange ring on a player losing top speed to a turn, the ring
  growing with the loss); scenarios `kin-sprint-stop` (standing striker vs a CB already running at the ball) and
  `kin-sharp-turn` (CB sprinting upfield turns 180° for a ball behind him).
- `/lab`: `Variant.kinematics: "off"` (checkbox "Kinematics", variant A sets the match; label `· kin off`);
  `TeamRawStats.distanceCovered/sprints` → `avgDistanceCovered/avgSprints` → rows "Distance (yd)" and "Sprints" in `PairDetail`.
- Wire state (h2h, watching): `vel`, `kin`, `sprint` are left out. The 2D drawing interpolates positions as before
  (`renderInterp`): runs ease in, players slow down onto their target instead of snapping at full speed, sharp turns visibly
  slow; the sprite run/walk choice follows the drawn speed, so more walking at arrival.

## Measurement (`bun scripts/kinematics-measure.ts`, 2026-11-18)

Premier League + Championship, 800 matches each, AI formations, balanced, fitness 88, `Math.random` seeded per match
(`--seed 5000`; paired with the base). Per match, both teams:

| | base (off) | `CARRY_ACCEL_SCALE` 1 (200 m.) | final (3, FOUL_MULT 0.9) | Δ |
|---|---|---|---|---|
| Goals | 1.810 | 1.435 | 1.812 | +0.1% |
| Shots | 5.349 | 4.250 | 5.324 | −0.5% |
| xG | 3.011 | 2.384 | 2.974 | −1.2% |
| Passes | 49.8 | 49.6 | 45.7 | −8.4% |
| Through balls (completed) | 21.3 (59.2%) | 22.5 (58.9%) | 21.8 (58.4%) | +2.1% |
| Interceptions | 3.62 | 3.82 | 3.45 | −4.8% |
| Tackles won | 4.13 | 5.22 | 4.20 | +1.8% |
| Fouls | 10.10 | 12.81 | 10.35 | +2.5% |
| Offsides | 1.52 | 1.44 | 1.23 | −19% |
| Crosses | 12.4 | 10.3 | 11.2 | −10% |
| Penalties | 0.308 | 0.270 | 0.307 | 0% |
| End energy | 50.7 | 50.8 | 50.5 | −0.3% |
| Distance per player (yd) | 1238 | 1107 | 1123 | −9% |
| Sprints (match) | 704 | 1150 | 1157 | +64% |

By league (final): Premier goals +1.9% / shots +3.1%, Championship −2.1% / −4.2%. `CARRY_ACCEL_SCALE` 2.5 gave goals −5.7%,
shots −3.2%. Distance and sprints with the layer off are the old movement measured the same way (a step at top speed
straight away, so fewer runs last a second above 85%).

Unseeded check, `bun scripts/ai-formation-goals.ts --engine 800 --modes ai --quick 0 --chunks 3` (base worktree × this
branch): Premier 1.991 → 2.039 goals, 5.31 → 5.63 shots; Championship 1.710 → 1.565, 5.32 → 5.13; summed goals −2.6%,
shots +1.2% (noise ~±3% per run).

quickSim: goals and shots unchanged, so `BASE_GOALS` / `SHOTS_PER_XG` stay. Energy: `fatigue-calibrate.ts` part 1 with the
layer on implies `ENERGY_DRAIN_BY_LINE` GK 37.0 · DEF 47.8 · MID 45.6 · FWD 48.6 against 35.7 · 45.8 · 43.8 · 47.7 in the
config: all within ±10%, not changed (energy cost is per action, not per yard).

## Testes

`bun test src/GameEngine/Domain/Kinematics.test.ts src/GameEngine/Domain/Kinematics.engine.test.ts src/GameEngine/Domain/Aerial.engine.test.ts`.

## Limitações

- The quickSim per-slot events were calibrated on the engine before kinematics: passes (−8%), crosses (−10%) and offsides
  (−19%) of the engine moved; the quickSim still makes the old numbers (not recalibrated).
- Race estimates ignore turning and braking; the through-ball cells see the velocity of the tick they are scored.
- The heading changes at once (the speed pays for it); no curved runs.
- `FOUL_MULT` is a global lever, not a model of why the tackles from behind come.
