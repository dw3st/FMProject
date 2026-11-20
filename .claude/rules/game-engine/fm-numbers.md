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
`0.075 · factor · d · 1.7` yd, σ across `d · tan(2.5° · factor)`. The ball lands at the receiver's point plus the two
Gaussian offsets; outside his reach ellipse (2.2 × 1.3 yd, + 0.8 × first touch) he misses it: `passFailed` +
`passMissed`, and the ball runs loose from the landing point (`LooseBallCause` `misplaced`, 3 yd/s plus the overrun; one chaser per side).
No new interception dice: interceptions on the way are the same as before.

- A pass to feet longer than `LOFT_YD` (30 yd ≈ 27 m) is lofted: played as a high ball (`startAerialBall(...,
  lofted)`), contested where it lands like a long ball.
- The chooser learns the risk: the receiver is picked on pass quality × `1 − loss`, loss = miss chance × 0.55
  (lofted: 1 − 0.4) (`passLossEstimate`, `PassLanes.ts`); the pass action against carry / hold uses the plain quality
  (`RISK_IN_ACTION` 0: with the risk in the action, holders kept the ball in crowds).
- Through balls: a cell the defender reaches first (race score < 0.5, `TB_MIN_RACE`) is not played; the rest ×
  `1 − 0.4 · (1 − race)` × `1 − 0.15 · lane risk` (`TB_LANE_RISK`, interceptions in flight were most of the losses),
  × 0.85 beyond 30 yd. Crosses × 0.85 (`CROSS_RISK_MULT`).
- A lofted pass to feet commits one chaser per side (`LOFT_CHASERS`).
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

In possession every attacking anchor moves up `0.25 × (ball depth − halfway)` yd × the line's share (DEF 1, MID 0.4,
FWD 0, `IN_SHIFT_BY_LINE`) (`blockShiftX`, `attackingAnchor`; the off-ball role-fit penalty moves with it), and the
spread × 0.95. Round 2: the first version also moved everyone 8 yd forward (`IN_ADVANCE_YD`, now 0); pushing the
front into the other side's block was the main cause of three defenders round the ball (`ball-cluster.ts` 8.8 → 5.9%
in the AI formations with only that change). Out of
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

### FM targets panel (engine rebuild stage 0)

The FM numbers live in `src/lab/fmTargets.ts`: `FM_MATCH_TARGETS` (report 9's official per-match stats, both teams:
goals, shots, on target / blocked / long-range %, xG, xG per shot, conversion, corners, throw-ins, passes of every kind
and completion, crosses, headers won, tackles won, interceptions, dribbles, fouls, cards, offsides, penalties; each with
its confidence), `FM_CONDITION` (outfield median at 15'…90', keepers at the end) and report 7's pass bands, holder mix,
timing, pressers and shape. `fmCountsOf` sums the two teams' `Statistics.ts` totals, `fmTargetRows` gives ours, FM's and
the ratio. Read by the script (first two tables: "FM targets per match" and "Condition by minute"; the collector now
also samples the condition), the `/test` panel **FM targets** (`GameInterface/FmTargetsPanel.tsx`: the current
match's values so far and its seed) and the `/lab` `PairDetail` table "FM targets" (`fmCountsFromViews`, A + B per
match; `PerMatchView.avgLongBallsCompleted` added for it). Long-range shots need the collector (script only). The
matches are seeded through `simulateMatch(..., { seed })` (seed + offset + match), not by replacing `Math.random`.

The seeded generator (stage 0, `game-engine.md` → "Seeded match generator") leaves the volume where it was:
`ai-formation-goals.ts --leagues premier_league --modes ai --quick 0`, before / after, three runs (200 + 200 + 400
matches each): goals 1.590 / 1.525, 1.580 / 1.510, 1.692 / 1.650 (800 matches: 1.639 / 1.584, −3.4%, under 1 standard
error); shots 4.82 / 4.46, 4.75 / 4.55, 4.75 / 4.74 (4.77 / 4.62, −3.1%, 1.4 standard errors).

### Stage 3: the 3D ball (`ball-3d.md`)

`fm-targets.ts 60 premier_league --chunks 1` (seed 9000, compressed clock), before (`feat/engine-fm` a20e77f3) / after
(`BALL_3D` on). Only recorded, nothing tuned. With `BALL_3D` off the counts are identical to before (6 seeded matches).

| Per match, both teams | Before | After | FM (R9) |
|---|---|---|---|
| Cross peak / contact height (median, m) | — | 1.31 / 0 (n 281) | 4.0 / 1.8 |
| Corner peak / contact (m) | — | 2.15 / 0 (n 218) | 5.6 / 2.2 |
| Long ball and clearance peak / contact (m) | — | 1.85 / 0 (n 460) | 4.4 / 1.4 |
| Ball in the air (s, compressed clock) | — | 38.9 | — |
| Interceptions | 2.52 | 3.13 | 59 |
| Passes (regular) attempted / completed | 67.4 / 58.5 | 66.2 / 56.6 | — |
| Pass completion, all kinds | 76.5% | 75.7% | 86% |
| Goals / shots / on target | 1.57 / 4.65 / 2.90 | 1.48 / 4.70 / 2.55 | 1.5 / 21.5 / 7.5 |
| Corners / throw-ins | 3.82 / 2.82 | 3.70 / 2.85 | 12.5 / 23 |
| Crosses (completed) / long balls (completed) | 9.20 (0.97) / 2.50 (1.12) | 8.45 (0.88) / 2.65 (1.38) | 64 (12) / — |

- The peaks follow from the engine's flight times (high balls 30 yd/s: a 35-yd cross flies ~1.2 s, peak g·T²/8 ≈ 1.6 m),
  so they sit at a third to a half of FM's; FM launches lofted balls at vz 10–14 m/s (stage 4). Contact height 0: the high
  ball still lands before the duel (stage 10).
- With `FULL_DURATION=1` (3 matches, 90 physical minutes) the peaks are the same (cross 1.10, corner 2.15, long 1.88 m):
  they depend only on the flight times; the ball is in the air 711 s per match.
- Interceptions +24%: on a ground pass the physical ball is fast early and slow late (the old smoothstep was slow early),
  so it reaches a defender's corridor sooner.

### Stage 4: the physical pass (`pass-physics.md`)

`fm-targets.ts 60 premier_league --chunks 1` (seed 9000, compressed clock), before = stage 3 / after = `PASS_PHYSICS` on.
Only recorded, nothing tuned. `DECISION_OVERRIDES='{"PASS_PHYSICS":false}'` gives the stage-3 pass.

| Per match, both teams | Before | After | FM |
|---|---|---|---|
| Launch \|v\| by 0–10 / 10–20 / 20–30 / 30–45 / 45+ m (m/s) | — | 9.7 / 13.3 / 17.3 / 21.3 / 28.6 | 9.7 / 14.2 / 19.6 / 24.5 / 31.3 (R6) |
| Launch vz by the same bands (m/s) | — | 0.97 / 1.82 / 5.19 / 9.26 / 9.69 | 0.85 / 1.8 / 4.7 / 10.2 / 14.3 |
| To the intended receiver by vz ≤1 / 1–3 / 3–6 / 6–10 / >10 m/s | — | 97 / 96 / 81 / 40 / 18% | 92 / 90 / 79 / 32 / 30% (R7) |
| Flight 0–8 / 8–13 / 13–18 / 18–23 / 23–30 / 30+ m (s) | — | 0.6 / 1.0 / 1.4 / 1.4 / 1.6 / 1.8 | 0.65 / 0.95 / 1.18 / 1.45 / 1.75 / 2.4 |
| Peak cross / corner / long ball (m) | 1.31 / 2.15 / 1.85 | 3.97 / 5.78 / 4.40 | 4.0 / 5.6 / 4.4 (R9 §3) |
| Landing vs aim median (p90): cross / corner / long / lofted (m) | — | 2.7 (7.1) / 3.0 (6.3) / 0 (8.2) / 4.6 (9.2) | 6.8 (12) / 4.9 (19) / 4.6 (11) / 7.4 (17) |
| Regular passes / through balls to the receiver | 90.3 / 71.5% | 96.4 / 55.3% | — |
| All kinds to the receiver (to the opponent) | 78.6% (15.2%) | 84.2% (11.5%) | 82% (13.5%) |
| Pass completion (official) | 75.7% | 83.7% | 86% |
| Goals / shots / xG | 1.48 / 4.70 / 2.25 | 1.03 / 2.80 / 1.40 | 1.5 / 21.5 / — |
| Interceptions / corners / crosses | 3.13 / 3.70 / 8.45 | 2.90 / 2.40 / 5.45 | 59 / 12.5 / 64 |
| Holder mix carry / pass / turn / hold | 55.9 / 33.4 / 7.6 / 2.5 | 54.2 / 38.6 / 3.0 / 3.8 | 44 / 34 / 12 / 9 |
| Ball in the air (s, compressed) | 38.9 | 82.6 | — |

- Launch, loft, peaks and flight times follow FM; the speed falls 10–13% short beyond 20 m and the landing error of
  high balls is about half of FM's.
- Shots and goals fall (passes take FM's time and the defence recovers; the arrival lane score picks safer passes).
  Volume is calibrated at the end of the rebuild.

## Target against ours

Premier League, 150 seeded matches each (`fm-targets.ts`, AI formations, balanced). "main" = the seven flags off;
round 1 = first version; round 2 = current. Pass bands: all kinds (in brackets the regular passes to feet).

| Measure | FM | main | round 1 | round 2 |
|---|---|---|---|---|
| 3+ defenders ≤ 8 yd of the ball, Premier 4-3-3 / AI formations (`ball-cluster.ts`, 400) | — | 5.8 / 5.4% | 10.2 / 8.9% | 6.6 / 5.3% |
| ...Championship 4-3-3 / AI formations | — | 6.0 / 5.8% | — | 6.1 / 5.9% |
| Pass to the receiver 13–18 m | 85% | 87 (93) | 78 (85) | 85 (87) |
| 18–22 m | 87% | 79 (95) | 68 (87) | 76 (85) |
| 22–27 m | 79% | 71 (93) | 60 (80) | 70 (83) |
| 27–31 / 31–35 / 35+ m | 36 / 21 / 29% | 67 / 60 / 48 | 50 / 42 / 23 | 63 / 51 / 25 |
| Overall / ground / lofted | 82 / 92 / 31% | 72 / 83 / 10 | 68 / 86 / 13 | 80 / 89 / 13 |
| Through balls per match (to the runner) | — | 24 (61%) | 17 (72%) | 11.7 (72.5%) |
| Crosses per match | — | 10.7 | 16.3 | 8.6 |
| Holder mix carry / pass / turn / hold / shot | 44 / 34 / 12 / 9 / 1 | 80 / 19 / 0 / 0 / 0.6 | 57 / 30 / 8 / 3 / 0.8 | 55 / 34 / 7.5 / 2.6 / 0.7 |
| Decisions per live s / per possession | 0.65 / 2.5–3 | 2.43 / 10 | 1.45 / 6.4 | 1.63 / 5.9 |
| Time on ball median / p90 (s) | 0.7–1.0 / 2–3.4 | 1.2 / 5.2 | 1.2 / 6.4 | 1.0 / 5.8 |
| Dedicated pressers 0 / 1 / 2+ | 75 / 20 / 5 | 68 / 27 / 5 | 77 / 19 / 4 | 76.5 / 20 / 3 |
| Opponents ≤ 10 m of holder, own / mid / final third | 0.85 / 1.8 / 3.1 | 1.27 / 1.26 / 1.63 | 1.27 / 1.55 / 2.24 | 1.04 / 1.43 / 2.03 |
| Back line in / out of possession (yd) | 58 / 24 | 43 / 37 | 47 / 39 | 46 / 36.5 |
| Width in / out of possession (yd) | 40 / 37 | 50 / 41 | 42.5 / 36 | 50.6 / 38.7 |
| Off-ball step out of possession DEF / MID / FWD (yd) | 4.4 / 6 / 7 | 12 / 13 / 13.5 | 3.2 / 4.0 / 4.5 | 2.8 / 3.6 / 4.1 |
| Passes per live s | 0.21 | 0.26 | 0.25 | 0.28 |
| Shots beyond 30 yd | 0 | 0% | 0.3% | 0.8% |

World (`ai-formation-goals.ts --engine 800 --modes ai --quick 0`; volume is calibrated at the end of the rebuild, not
here): Premier goals 2.024 (main) → 1.813 (round 1) → 1.724 (round 2, before the last width / line change), shots
5.62 → 5.29 → 4.80; Championship goals 1.534 → 1.397 → 1.343, shots 5.05 → 4.41 → 4.45. quickSim not recalibrated.

### Round 2: what moved the crowding

Isolated with `ball-cluster.ts` (150 matches, AI formations, flags and `FM_NUMBERS_OVERRIDES` one at a time): only
`PASS_ERROR` off + `SLIDING_BLOCK` off gave back main (5.1%). Inside them: the uniform 8-yd advance in possession
(`IN_ADVANCE_YD`, 8.8 → 5.9%), the risk inside the pass action (`RISK_WEIGHT` 0: −1.4) and the through-ball race price
(`TB_RISK` 0: −1.5). Misses (reach ×10: no change), the out-of-possession drop and depth, the shape shift and the
crowd-edge rule moved little.

## 90 minutes of physics (engine rebuild stage 2)

The engine plays the 90 minutes on the real clock (`match-flow.md` → "Clock and time constants"). Premier League,
24 seeded matches (`fm-targets.ts 24 --chunks 1 --seed 9000`), raw counts per match, both teams; "before" = the
`FULL_DURATION` switch of stage 0 (90 minutes but the restarts still 0.4–2 physical s of dead ball). Recorded only:
nothing calibrated.

| Measure | FM | before | stage 2 |
|---|---|---|---|
| Goals | 1.5 | 37 | 14.8 |
| Shots | 21.5 | 114 | 45.8 |
| Passes (all kinds) | 978 | 975 | 746 |
| Corners | 12.5 | 81 | 39.1 |
| Fouls | 19 | 107 | 59.1 |
| Throw-ins | 23 | 45 | 22.8 |
| Penalties | 0.2 | — | 2.7 |
| Outfield energy at 15' / 45' / 90' | 87 / 77.5 / 73.5 | — / — / 52 | 83.7 / 75.0 / 65.6 |
| Keepers' energy at the end | 96.5 | — | 68.8 |

Restarts now take their dead time on the match clock (a corner 21.6 game-s, a goal kick 18…), so about half the
match the ball is out of play, as in football; the counts fell by about half. Shots are still about twice FM's and
goals ten times (xG per shot 0.48 against 0.15): the next stages (shot choice, keeper, blocks) have to move them.

Cost (`engine-cost.ts`, same 3 seeded matches, machine loaded by other runs): 1.35 → 0.93 ms per tick wall, 0.66
CPU ms per tick, 38 → 26 s per match (15.3 s in the fm-targets run), ~28 100 ticks, RSS 135 MB. Unloaded, 0.48 ms
per tick (13.8 s per match).

## Limitations

- Ball crowding with every team in 4-3-3 (Premier) is still 6.6% against main's 5.8%; with the AI formations and in
  the Championship it is at main's level.
- Pass bands with every kind stay below FM between 18 and 27 m (76 / 70% against 87 / 79): the regular passes are at
  FM's level (85 / 83%); crosses (4.5% to the intended runner) and through balls (72.5%) pull the band down.
- Width in possession went back to 50.6 yd (FM 40): narrowing the attack crowded the ball.
- Decisions per second and per possession still about 2.5× FM's (1.63 / 5.9); holds and turns are rare (2.6 / 7.5%
  against 9 / 12%), carries in the own third 60% against 26%.
- The back line sits 46 yd up in possession (FM 58) and 36.5 out of it (FM 24).
- Off-ball steps are shorter than FM's; short off-ball actions are held ~1 s against ~5 s.
- Fewer through balls and crosses: shots and goals fell (volume is left for the final calibration).

## Etapa 6: xG do FM (antes / depois)

Premier League, 120 partidas com semente (`fm-targets.ts 120 --chunks 2`, formações da IA, equilibrado). Antes =
`DECISION_OVERRIDES='{"FM_XG":false}'` (o `computeXG` antigo); depois = o xG do FM (`xg.md`) como estatística, nota
de chutar e entrada da resolução de hoje. Nada calibrado.

| Medida (por partida, os dois times) | FM | antes | depois |
|---|---|---|---|
| xG por chute, média / mediana | 0,15 / 0,03 | 0,49 / 0,46 | 0,34 / 0,31 |
| xG por chute p25 / p90 | — / 0,17 | 0,28 / 0,81 | 0,14 / 0,76 |
| xG da partida | 3,3 | 2,2 | 1,6 |
| Chances (xG ≥ 0,15) / chances claras (≥ 0,30) | — / 3,5 | 4,3 / 3,2 | 3,4 / 2,3 |
| Chutes | 21,5 | 4,4 | 4,6 |
| Gols / % dos chutes | 1,5 / 7% | 1,53 / 34,5% | 1,10 / 24% |
| Chutes de 18+ jd | 46% | 23% | 20% |

O modelo bate com os exemplos do FM (`FmXg.test.ts`); a diferença que sobra é a escolha do chute: nós chutamos pouco e
quase só de perto e sem bloqueio (77% dos chutes a menos de 18 jd, bloqueados 0,4%), o FM chuta 21,5 vezes de toda
parte, metade de longe e 38% bloqueados. Isso é das etapas 8 e 9. Os gols caem porque a resolução de hoje ainda sorteia
sobre o xG (~30% menor por chute); a etapa 7 troca isso pela trajetória. Custo: ~9 µs por avaliação do xG.

## Etapa 18: camada de lances (só registro)

`bun scripts/highlights-measure.ts` (Premier League, semente 9000, formações da IA, equilibrado). Antes: não havia
lances. Os níveis se contêm (`highlights.md`); segundos = tempo de exibição a 1×. Nada calibrado.

| Por partida, os dois times | Relógio comprimido (24 partidas) | `FULL_DURATION=1` (6 partidas) | Referência |
|---|---|---|---|
| Jogo vivo simulado (s) | 317 | 5651 | — |
| Gols / chances claras no motor | 1,17 / 1,2 | 26 / 32,5 | FM 1,5 / 3,5 |
| Lances principais (duração somada, % do jogo) | 2,5 (47 s, 15%) | 62,8 (19,8 min, 21%) | FM ~15–25 lances principais; meta de produto 2–4 min |
| Lances estendidos | 7,2 (120 s, 38%) | 136,5 (40 min, 43%) | — |
| Lances completos | 10,9 (171 s, 54%) | 203,8 (55 min, 59%) | — |
| Mediana de um lance principal / estendido / completo (s) | 18,8 / 15,4 / 14,0 | 18,0 / 16,4 / 15,0 | — |

- Todo gol fica dentro de um lance principal (28 de 28, 156 de 156).
- Com `FULL_DURATION` o motor ainda faz ~26 gols e ~33 chances claras por jogo (sem calibração): quase todo lance
  principal é um gol ou uma chance clara, então a contagem segue esse volume. No volume do FM (1,5 gols, 3,5 chances
  claras, poucos pênaltis e vermelhos) o nível principal daria ~5–6 lances (~1,7 min); os "15–25 lances principais" do
  FM ficam mais perto do nosso nível estendido (chutes, defesas, escanteios, faltas perigosas, cartões).
- Custo: o `simStep` por passo e o rastreador ficaram dentro do ruído do tempo por partida (PC carregado).

## Etapa 13: impedimento, faltas e cartões (antes / depois)

Premier League, 60 partidas com semente (`fm-targets.ts 60 --chunks 1`, formações da IA, equilibrado). Antes =
`DECISION_OVERRIDES='{"OFFSIDE_RUNS":false,"FM_FOULS":false}'` (idêntico ao motor anterior, conferido); depois = as
duas flags (`offside.md` → "Mistimed runs", `fouls.md` → "Faltas do FM"). Nada calibrado. A partida ainda tem ~319 s de
jogo com física (etapa 2 em paralelo), então vai também a taxa por segundo de jogo contra os 93 min do FM (5580 s).

| Medida (por partida, os dois times) | FM | antes | depois |
|---|---|---|---|
| Impedimentos | 8 | 1,4 | 1,2 |
| … por segundo de jogo | 0,0014 | 0,0045 | 0,0037 |
| … por passe | 0,008 | 0,015 | 0,014 |
| Faltas | 19 | 9,2 | 8,8 |
| … por segundo de jogo | 0,0034 | 0,029 | 0,028 |
| … por passe | 0,019 | 0,10 | 0,10 |
| Faltas sofridas por terço (próprio / meio / último) | 21 / 43 / 36% | 24 / 32 / 44% | 21 / 35 / 44% |
| Falta em quem conduz / logo depois de receber / segurando | 44 / 17 / 9% | 70 / 2 / 13% | 71 / 1 / 13% |
| Faltas de contato (sem desarme) | — | 0 | 0,35 |
| Amarelos / por falta | 3 / 0,16 | 2,1 / 0,23 | 1,8 / 0,20 |
| Vermelhos | 0 | 0,10 | 0,03 |
| Pênaltis | 0,2 | 0,45 | 0,33 |
| Leituras erradas da linha perto dela | — | 0 | 38 |
| Gols / chutes / passes | 1,5 / 21,5 / 978 | 1,3 / 4,8 / 92 | 1,2 / 3,8 / 86 |

- O atacante não fica mais preso na linha (com a flag, 12,6% dos ticks com algum atacante além dela contra 9%, sonda
  de 3 partidas), mas o volume de impedimentos não sobe: quem está além da linha costuma estar atrás dos zagueiros, com
  o passe fechado, e o FM tira os impedimentos sobretudo de corridas feitas no ombro do último zagueiro na hora do
  passe (movimento sem bola, etapa 15). Por segundo e por passe já passamos do FM; o que falta por partida é a duração
  da física.
- Só a leitura da linha, sem projeção (primeira versão), custava ataque: chutes 4,8 → 3,9, gols 1,3 → 1,0 (o atacante
  ficava no ponto antigo com a linha recuando). Com a projeção pela antecipação: chutes 4,2, gols 1,2, impedimentos 1,1
  (60 partidas cada; o ruído entre rodadas com outra sequência de sorteios é de ~±0,4 chute).
- Faltas: o contato no portador quase não dispara (0,35 por partida): quem chega a 2 jd decide desarmar, e o contato
  só sobra para quem está perto marcando ou depois de um desarme. A distribuição por terço e por contexto quase não
  muda (já vinha dos desarmes e dribles); falta em quem conduz fica acima do FM (o FM conta a última ação, nós o que
  ele fazia na hora). O cartão do FM baixa o amarelo por falta de 0,23 para 0,20 (0,16 no FM): nossa mistura tem mais
  faltas por trás e parando ataques do que a suposta.


## Etapa 15: forma do time, pressão na sombra, ações seguradas, corridas no ombro

`team-shape.md`. `bun scripts/fm-targets.ts 8 premier_league --chunks 1 --seed 9000` (relógio físico de 90 min), as
cinco flags desligadas × ligadas:

| Medida | FM | antes | depois |
|---|---|---|---|
| Linha de trás com / sem a bola (jd do próprio gol) | 58 / 24 | 42,5 / 35,2 | 49,7 / 38,8 |
| Comprimento com / sem | 39 / 35 | 36,4 / 32,6 | 28,4 / 29,9 |
| Largura com / sem | 40 / 37 | 54,0 / 36,8 | 40,5 / 33,4 |
| Trás → meio, meio → frente sem a bola | 14 / 12,5 | 12,8 / 11,1 | 13,9 / 8,9 |
| Pressionadores 0 / 1 / 2+ | 75 / 20 / 5% | 82,6 / 14,5 / 2,9% | 71,6 / 23,4 / 5,0% |
| Adversários a 10 m do portador (próprio / meio / último terço) | 0,85 / 1,8 / 3,1 | 0,83 / 1,00 / 2,28 | 1,08 / 2,14 / 2,33 |
| Ação curta segurada (DEF / MEI / ATA, s) | ~5 | 2,2 / 2,4 / 2,4 | 2,4 / 4,8 / 4,6 |
| Posição padrão segurada (DEF / MEI / ATA, s) | 19 / 10 / 12 | 5,4 / 3,6 / 3,6 | 4,8 / 3,6 / 2,4 |
| Passo com a bola (DEF / MEI / ATA, jd) | 4,4 / 6 / 7 | 0,8 / 2,3 / 3,9 | 1,5 / 3,0 / 4,5 |
| Impedimentos por partida / por passe | 8 / 0,0082 | 12,3 / 0,016 | 10,8 / 0,0136 |
| Corridas no ombro (adiantadas) | — | 0 | 37,4 (2,1) |
| Pressões na sombra / coberturas de zona | — | 0 / 0 | 122 / 564 |
| Bola com 3+ defensores a 8 jd | — | 5,6% | 11,5% |
| Gols / chutes / passes | 1,5 / 21,5 / 978 | 6,8 / 26,0 / 764 | 9,3 / 38,3 / 790 |

- A coluna "antes" das ações seguradas é da classificação antiga (pressão, desarme e bola solta ainda contavam).
- O bloco do FM aproxima largura e pressionadores, mas a linha fica longe nas transições (depois da troca de posse os
  defensores ficam ~20 jd acima da linha e levam 5–10 s para descer) e a bola fica cercada (o bloco não se comprime
  na bola). A posição padrão segurada não sobe: o que a encerra é a troca de posse (~12 s por posse) e as bolas soltas.
