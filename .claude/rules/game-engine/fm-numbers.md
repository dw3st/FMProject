# FM numbers (engine rebuild stage 4b)

Goal: the engine behaves like FM27 Mobile as measured in the reverse-engineering reports 6 and 7 (pass outcomes,
decision timing, pressing, team shape, off-ball movement, shot range). Seven mechanics, each behind a flag in
`DECISION_FLAGS` (`Configs/DecisionConfig.ts`), all on by default; every constant in `Configs/FmNumbersConfig.ts`
(`FM_NUMBERS`, env `FM_NUMBERS_OVERRIDES='{"REACH_SIDE_YD":2}'`). `DECISION_OVERRIDES='{"PASS_ERROR":false}'` or
`simulateMatch(..., { decisions })` switches one off. With all seven off the engine is the one of main.

FM works in metres, the engine in yards (1 m = 1.0936 yd).

## 1. Pass launch error (`PASS_ERROR`)

`Domain/PassError.ts` (pure): technique margin `s = clamp(40 · passing − 0.5 · d_m, 0, 41)`, error factor
`(1 − s/50) · (1 + 1.07 · P/100)` (P = FM pressure on the passer, `Pressure.ts`), σ along the pass
`0.075 · factor · d · 2` yd, σ across `d · tan(2.5° · factor)`. The ball lands at the receiver's point plus the two
Gaussian offsets; outside his reach ellipse (2.2 × 1.3 yd, + 0.8 × first touch) he misses it: `passFailed` +
`passMissed`, and the ball runs loose from the landing point (`LooseBallCause` `misplaced`, 3 yd/s plus the overrun; one chaser per side).
No new interception dice: interceptions on the way are the same as before.

- A pass to feet longer than `LOFT_YD` (30 yd ≈ 27 m) is lofted: played as a high ball (`startAerialBall(...,
  lofted)`), contested where it lands like a long ball.
- The chooser learns the risk: the pass quality × `1 − loss`, loss = miss chance × 0.55 (lofted: 1 − 0.4)
  (`passLossEstimate`, `PassLanes.ts`); a through-ball cell × `1 − 0.4 · (1 − race score)` and × 0.85 beyond 30 yd.
- Set pieces are exempt.

## 2. Decision timing (`ACTION_CADENCE`)

The holder decides per action, not per tick. A carry is a 2.2-yd step (`CARRY_STEP_YD`, at most 0.8 s); he decides
again when it is done, or at once when an opponent closes in (within 4 yd and 1 yd nearer than at the start, or any
within 3 yd), or anywhere within 24 yd of the goal centre (a shot opens in a tick). Two new holder steps
(`carry.step`): **hold** (0.6 s at ×0.25 speed, edging away from the nearest opponent) when the best carry is weak
(score < 0.6, up to 0.68 deep in his own half) and no pass clearly beats it, never with an opponent within 4 yd;
**turn** (0.4 s at ×0.45) when the carry direction is more than 60° off his running direction. Event `holderStep`,
debug `decision`. The goalkeeper and set-piece takers are exempt.

## 3. Calm pressing (`CALM_PRESS`)

`press_holder` × 0.55 with the holder in his own third and × 0.85 in the middle third (`scorePressHolderIntent`).
Instead, the defensive shape anchor shifts toward the ball (DEF 5, MID 7, FWD 4 yd, within 25 yd of the ball, fading
to 0 at 50, stronger the nearer the ball is to our goal), and with the ball in our defensive third the block
converges 35% toward the ball's side (`computeDefensiveShapeAnchor`); neither shift brings a player inside 12 yd of the ball (`SHAPE_SHIFT_KEEP_YD`). With two teammates already within 8.5 yd of the ball, a third holding shape or marking stays at that edge (`BALL_CROWD_YD`, `computeDefensivePosition`).

## 4. Sliding block (`SLIDING_BLOCK`)

In possession every attacking anchor moves up `8 + 0.25 × (ball depth − halfway)` yd, a uniform shift, never a
squeeze (`blockShiftX`, `attackingAnchor`; the off-ball role-fit penalty moves with it), and the spread × 0.85. Out of
possession the depth behind the ball × 1.15 (shape anchor and `ballRelativeLineX`), the whole block drops 5 yd more
(never inside 8 yd of its goal) and the spread × 0.92.

## 5. Short steps (`SHORT_STEPS`)

The movement target a player carries (`targetPosition`) is a step of at most DEF 4.4 / MID 6 / FWD 7 yd toward where
he wants to be (FM's setters), re-issued every tick; he keeps running toward the full point. Pressers and the keeper
are exempt. A held defensive or off-ball intent is kept unless a new one beats it by 0.12 (hysteresis,
`_intentCache` / `_offBallIntent`, reset with the match).

## 6. Shot limit (`SHOT_LIMIT`)

No shot beyond 33 yd of the goal mouth (`evalShoot` scores 0). The shooting level of a role multiplies the score:
`shotLevelMult(role, level)` = 0.75 for defenders ("rarely") × 1.25^level; it never moves the limit.

## 7. Tactic sensitivity (`TACTIC_DAMP`)

Attacking width ×0.9 / ×1 / ×1.1 (`WIDTH_ATTACK_DAMPED`, was ×0.75 / ×1 / ×1.2); mentality moves the carry threshold
(`MIN_TOTAL_SCORE`) by ±0.05 (defensive carries less). Stage 4c redesigns the tactics.

## Measuring (`bun scripts/fm-targets.ts [matches] [league] [--chunks 3] [--seed 9000] [--out f.json]`)

`src/lab/fmTargets.ts` (`fmTargetCollector`, a `simulateMatch` `onTick` collector): pass outcome by FM band, loft and
pressure, holder decision mix by third, decisions per live second and per possession, time on ball, dedicated
pressers (opponents whose target is within 3 m of the holder), opponents within 10 m of the holder by his third,
shape per team in and out of possession, off-ball step (target − position) and hold time per intent (default =
hold_shape / track_mark / support_run / idle), shot distance. Seeded matches, AI formations, balanced.

Surfaces: `Statistics.ts` team counters `passesMissed`, `passesLofted`, `holderHolds`, `holderTurns` → `/lab`
`TeamRawStats` → `avgPassesMissed` … → `PairDetail`. `/test`: scenarios `fm-long-pass`, `fm-calm-block`.

## Target against ours

Premier League, 150 seeded matches each (`fm-targets.ts`, AI formations, balanced). "main" = the seven flags off.

| Measure | FM | main | branch |
|---|---|---|---|
| Pass to the receiver 0–13 m | 90–94% | 92–96% | 90–97% |
| 13–18 / 18–22 / 22–27 m | 85 / 87 / 79% | 87 / 79 / 71% | 78 / 68 / 60% |
| 27–31 / 31–35 / 35+ m | 36 / 21 / 29% | 67 / 60 / 48% | 50 / 42 / 23% |
| Overall (all kinds incl. crosses) | 82% | 72.3% | 67.7% |
| Ground / lofted | 92 / 31% | 82.7 / 10.1% | 86.4 / 12.9% |
| Holder mix carry / pass / turn / hold / shot | 44 / 34 / 12 / 9 / 1 | 80 / 19 / 0 / 0 / 0.6 | 57 / 30 / 8 / 3 / 0.8 |
| Own third | 26 / 37 / 23 / 14 | 82 / 18 / 0 / 0 | 58 / 26 / 11 / 4 |
| Final third carry / pass / shot | 51 / 32 / 4 | 83 / 15 / 2.0 | 57 / 31 / 3.7 |
| Decisions per live s / per possession | 0.65 / 2.5–3 | 2.43 / 9.96 | 1.45 / 6.38 |
| Time on ball median / p90 (s) | 0.7–1.0 / 2–3.4 | 1.2 / 5.2 | 1.2 / 6.4 |
| Dedicated pressers 0 / 1 / 2+ | 75 / 20 / 5 | 67.7 / 27.2 / 5.2 | 76.6 / 19.0 / 4.4 |
| Opponents ≤ 10 m of holder, own / mid / final third | 0.85 / 1.8 / 3.1 | 1.27 / 1.26 / 1.63 | 1.27 / 1.55 / 2.24 |
| Back line from own goal, in / out of possession (yd) | 58 / 24 | 42.9 / 37.2 | 47.1 / 39.2 |
| Length in / out | 39 / 35 | 36.3 / 34.9 | 31.1 / 32.5 |
| Width in / out | 40 / 37 | 50.3 / 41.4 | 42.5 / 36.1 |
| back→mid in / out | 19 / 14 | 17.0 / 15.4 | 13.4 / 13.6 |
| mid→front in / out | 10 / 12.5 | 12.5 / 11.8 | 9.8 / 10.4 |
| Off-ball step DEF / MID / FWD in poss (yd) | 4.4 / 6 / 7 | 2.8 / 6.4 / 10.0 | 2.0 / 3.5 / 4.7 |
| ... out of possession | 4.4 / 6 / 7 | 11.9 / 13.2 / 13.5 | 3.2 / 4.0 / 4.5 |
| Default positioning held DEF / MID / FWD (s) | 19 / 10 / 12 | 13.6 / 14.8 / 8.6 | 14.6 / 13.8 / 10.2 |
| Short actions held (s) | ~5 | 1.0–1.4 | 1.0–1.2 |
| Shots beyond 30 yd | 0 | 0% | 0.3% |

World (`ai-formation-goals.ts --engine 800 --modes ai --quick 0`, chunks 3): Premier goals 2.024 → 1.813 (−10.4%),
shots 5.62 → 5.29 (−5.9%); Championship goals 1.534 → 1.397 (−8.9%), shots 5.05 → 4.41 (−12.7%). Per match
(fm-targets, Premier): xG 2.85 → 2.71, passes 48.4 → 43.1 (completed 44.9 → 38.1), tackles 3.95 → 4.05, fouls
10.05 → 8.18, interceptions 4.18 → 2.79. quickSim not recalibrated.

## Limitations

- Decisions per second and per possession still about twice FM's (1.45 / 6.4): the post-reception burst and the
  re-decisions inside 24 yd of goal and on a closing opponent keep the holder deciding.
- Pass completion between 13 and 27 m is below FM and beyond 27 m above it: through balls into space are scored apart
  (72% reach), lofted passes to feet are rare (the chooser avoids them), crosses dominate the "lofted" share.
- The back line sits 47 yd up in possession (FM 58) and 39 out of it (FM 24): the existing back-line logic (`Movement.ts`,
  stage 4) and the role bounds hold it; a stronger shift cost goals or broke the off-ball role fit.
- Off-ball steps are shorter than FM's in possession: players are usually already near their targets, the cap only
  shortens the long ones.
- Ball crowding (`ball-cluster.ts`) is worse than main: 3+ defenders within 8 yd of the ball ~9% of live ticks (main
  ~5.5%), spread over all mechanics (no single flag explains it). `BALL_CROWD_YD` keeps a third holder-of-shape off a
  ball two teammates already have; a misplaced pass commits one chaser per side.
