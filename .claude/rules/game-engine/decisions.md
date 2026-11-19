# Decisions (FM-style decisions, phases 2–3)

Spec: `docs/superpowers/specs/2026-11-18-fm-style-decisions-design.md` (§3, §5–7). Phase 2 is the telemetry (no dice).
Phase 3 is the ball holder's mind (`HOLDER`, **on by default**), section "Phase 3" below. Phases 4–5 (off-ball and
defence noise, release) are measured against the same baseline.

## Flags (`src/GameEngine/Configs/DecisionConfig.ts`)

- `DECISION_FLAGS`: `HOLDER` (on, phase 3), `OFFBALL`, `DEFENSE`, `DISCIPLINE_LAG`, `CONSISTENCY_CAP` (off). Stage 4
  (`movement.md`, on): `ANTICIPATION_PRESS`, `SECOND_PRESSER`, `ROLLING_BALL`, `DEFLECTIONS`, `SHOT_BLOCKS`, `BACK_LINE`,
  `SUPPORT_SHORT`.
- `DECISION_OVERRIDES='{"HOLDER":true}'` (env, read once at load) sets the base flags; `simulateMatch(..., { decisions })`
  sets them per match (always reset to the base when absent, nothing leaks).
- `DECISION_TELEMETRY`: pressure constants, bucket thresholds, near-tie margin.

## Events

`holderDecision`, `offBallDecision`, `defensiveDecision` (`DecisionTelemetryEvent`, `EventBus.ts`): `playerId`, `team`,
`family`, `chosen` (holder: action; off-ball / defence: intent), `decision` (the `PlayerDecision` type), `scores` (holder:
the seven compressed action scores; off-ball / defence: the intent scores), `argmax`, `margin` (top − second), `bucket`,
`pressure`, `t`.

- Emitted only while somebody listens (`gameBus.has`): the tick loop turns capture on (`DecisionTelemetry.ts`
  `setDecisionCapture`), the evaluators (`decideBallHolder`, `evaluateOffBall`, `evaluateDefensiveDecision`) hand their
  score vector to `captureDecision`, and after each fresh `decide()` the loop emits it. Nobody listening = no capture,
  no pressure, no object.
- Only fresh scored decisions: committed decisions are not re-emitted; set-piece takers and the unscored early returns
  (tackle range, duel recovery, keeper) emit nothing. The holder is re-evaluated every tick, so one holder event per tick.

## Pressure (`src/GameEngine/Domain/Pressure.ts`, FM's scalar)

Distances in metres (yd × 0.9144). For every opponent within R = 12 m (≈ 13.12 yd):
`c = 10 · ((R − d) / k)² / R`, k = 1 free, 2 in `recoveryTime` ≤ one tick (0.2 s), 3 longer. Extra pressers count half:
`P = Σ − (Σ − strongest) / 2` (on the raw sum). Nearest opponent beyond 1 m (≈ 1.09 yd): `P = max(P / d0, (P + 1) / 2)`,
d0 in metres. Nobody within R = 0. Raw, not normalised: typical values 0..~70 (one free opponent at 0.5 m = 110), so the
§3 panic gate (`pressure ≥ 0.55`) needs a normalisation in phase 3. Computed once per tick on the ball (holder's point,
the holder's opponents); the off-ball and defensive events carry the same situation pressure.

## Situation buckets (`situationBucket`)

`bucket = third × 4 + pressure × 2 + channel`, 12 buckets:
- third: the ball relative to the DECIDING player's attack: 0 own third, 1 middle, 2 final (a defender's "final third" is
  where his team attacks, i.e. the opponent's own third);
- pressure: holder pressure < 15 (`PRESSURE_HIGH`, the measured median) low, else high;
- channel: |ball y − 37| < 18.5 central, else wide.

## Statistics (`Statistics.ts`)

- Per player: `holderDecisions`, `offBallDecisions`, `defenseDecisions`; `getDecisionMix(id)` (action → count per family),
  `getLastDecision(id)`.
- Per team (`getTeamStats`, so `simulateMatch` teamStats): the three counts, `holderNearTies` / `offBallNearTies` /
  `defenseNearTies` (margin < 0.05), `holderEntropy` / `offBallEntropy` / `defenseEntropy` (Shannon entropy in bits of the
  chosen action within each bucket, averaged over the buckets weighted by their decisions, this match),
  `holderPressureSum`, `shotPressureSum` / `shotPressureCount` (the pressure at the shooter's last holder decision);
  `getTeamDecisionMix(team)`.
- `setDecisionTelemetry(false)` unsubscribes the listeners (the engine then emits nothing). Not in the live-match resume
  snapshot except the per-player counts and the team sums (the bucket mixes restart).

## `/lab`, `/test`

- `/lab`: `TeamRawStats` (counts, near-ties, entropy sums, pressure sum) → `balanceWorker` → `PerMatchView` /
  `VariantSummary` (`avgHolderEntropy`, `avgOffBallEntropy`, `avgDefenseEntropy`, `*NearTiePct`, `avgHolderPressure`) →
  `PairDetail` rows. The quickSim has none (zero).
- `/test`: DebugPanel shows, for the selected player (else the holder), the last decision event: scores sorted, argmax
  highlighted, margin (near-tie flag), bucket, pressure.

## Identity and cost

- `DecisionTelemetry.engine.test.ts`: a seeded match with the listeners off and on gives the same score, team stats (the
  telemetry fields aside), player stats and ratings.
- Cost (`decision-baseline.ts 40 premier_league --chunks 1`, same seeds, two runs each): off 962 / 1078 ms per match, on
  1033 / 1040 ms (≈ +2%, within the run-to-run noise); goals and shots identical.

## Baseline (`bun scripts/decision-baseline.ts 200 <league> --chunks 4`, seed 9000, 2026-11-18)

AI formations, balanced, fitness 88, `Math.random` seeded per match (mulberry32). Per match, both teams.

| | premier_league | of_championship |
|---|---|---|
| Goals / shots | 1.930 / 5.42 | 1.600 / 5.08 |
| Holder decisions | 1410 | 1415 |
| Holder mix | carry 55.3 · pass 14.0 · through 12.7 · cross 7.6 · dribble 6.7 · long 2.6 · shoot 1.1% | carry 57.7 · through 13.4 · pass 11.7 · cross 7.7 · dribble 5.9 · long 2.6 · shoot 1.0% |
| Holder entropy (per team-match / pooled) | 1.49 / 1.69 bits | 1.42 / 1.64 bits |
| Holder near-ties | 41.6% | 38.6% |
| Off-ball decisions | 2212 | 2216 |
| Off-ball mix | offer 49.5 · hold 43.1 · run 7.4% | offer 53.2 · hold 38.8 · run 8.1% |
| Off-ball entropy | 1.24 / 1.28 bits | 1.26 / 1.29 bits |
| Off-ball near-ties | 9.3% | 8.9% |
| Defensive decisions | 1486 | 1479 |
| Defensive mix | mark 53.7 · shape 41.0 · press 3.4 · carry lane 1.8% | mark 56.5 · shape 37.8 · press 3.8 · carry lane 1.8% |
| Defensive entropy | 1.00 / 1.05 bits | 0.98 / 1.04 bits |
| Defensive near-ties | 25.3% | 23.2% |
| Holder pressure p10 / p50 / p90 | 0.25 / 15.3 / 49.8 | 0.75 / 16.3 / 49.8 |
| Pressure at shots p10 / p50 / p90 | 7.3 / 32.3 / 62.3 | 6.8 / 33.3 / 62.3 |

Holder entropy per bucket (premier_league): lowest in own·low·wide (0.85: carry 82%) and own·high·wide (1.06), highest in
final·high·central (2.31) and final·low·central (2.15). Defence is most deterministic in the final third (hold_shape
81–88%, H 0.53–0.70). Off-ball is almost flat across buckets (1.16–1.37). The argmax is always the choice today
(off-argmax 0%: the holder's low-score fallback never fired in 400 matches).

## Phase 3: the ball holder's mind (`HOLDER`, on by default)

Code: `Domain/HolderMind.ts` (rules), `Infrastructure/ActionOutcomes.ts` (`mentalRoll`, `gaussianDraw`, `lapseScale`),
`DecisionTree.ts` (`holderMind` inside `decideBallHolder`), constants `HOLDER_MIND` (`DecisionConfig.ts`,
`HOLDER_MIND_OVERRIDES` env for tuning). Calibrated on FM27 live values read by the coordinator (pressure deciles, the
"must act" verdict, lapse rates).

- **Profile** (`GamePlayer.mental`, `MentalMatchConfig.ts`): decisions, composure, flair, anticipation (roster / 10,
  derived when missing), hidden consistency (`consistencyOf`) and the mood fixed at kickoff,
  `clamp(0.5·moraleFactor + 0.5·form, −1, 1)`, form = `clamp((mean recent rating − 6.6)/0.8, −1, 1)`; good ≥ 0.35, bad
  ≤ −0.35. `simulateMatch(..., { mental: { A, B } })` forces a side (0..10). Off for the keeper, set-piece takers and
  under the one-on-one gate (their rules are unchanged).
- **Window**: every 4 decision ticks (0.8 s), re-rolled for a new holder (`GamePlayer.decisionNoise`, cleared off the
  ball). Rolls on FM's 1..100 scale = roster × 10: normal U·(a+2), good max(U1,U2)·(a+2), bad U1·U2·(a+2). Form window
  s = (whole game seconds mod 15) + 35: at or above it a roll is ≥ 1 (never a lapse); below it the decisions roll ÷
  fatigue `1 + 4·(1 − energy/100)²·(1.5 − consistency)` under `LAPSE_ROLL` (4) is a **lapse** (every perceived score ×
  U(0.55, 1) for the window). FM's zero roll is `LAPSE_ROLL` 1; 4 brings the average lapse share to FM27's ~4%.
- **Perceived scores**: `s + bias + σ·z` (z held for the window), σ = 0.005 + 0.02·(1 − test),
  test = (decisions stretched to the world, `fmScale`: roster 6.5 = 100) × (0.4 + 0.6·roll/(a+2)). An option with a
  gated score 0 stays 0. The design's σ 0.01 + 0.09 cost ~30% of the goals (42% of the decisions are near-ties).
- **Release under pressure** (composure): pN = clamp(P/60, 0, 1); fires when
  `pN·100 − composureRoll/2 > D·4·(1 + 6n)/10·(1 + w)`, D metres to goal, n open passes (pass score ≥ 0.5). FM's binary
  reads `D·k/(5n+10)`, but its live rates (1–2% with an open option, the verdict mostly without one) need the bar to grow
  with n. Effect (FM27: escape carry ×8, long ball ×2.6, rarely a short pass): no dribble, carry × 1.3, long ball × 1.3,
  pass × 0.6.
- **Facing away** (last movement > 112° from the goal, speed ≥ 0.5 yd/s): w = min(pN·10 + 10, 12)%: the release bar ×
  (1 + w) and a backward / lateral pass (progress ≤ 0.6) × (1 + w).
- **Simple-minded** (decisions roll < 8): through ball only with a race ≥ 0.5 s, no cross nor long ball beyond 30 m,
  dribble only with carryBias ≥ 0.6.
- **Long-shot range** 27 + 22·((flair + composure rolls)/2)/100 yd (≤ 49): no shot from beyond.
- **Flair bias** 0.03·clamp((flairRoll − 14)/14, −1, 1) on dribble, through ball and a shot from beyond 20 yd.
- Off: no die, nothing reads the profile (`HolderMind.engine.test.ts`; seeded baseline identical to phase 2).

Events and stats: `holderMind` (rolls, σ, gates, mood, pressure, open options, true vs perceived scores, pick).
`Statistics` team counters `holderMindDecisions`, `holderOffArgmax`, `holderWindows`, `holderLapses`, `holderReleases`,
`holderHighPressure`, `holderReleasesHigh`, `holderPanics` (a lapse window rolled at pN ≥ 0.55), `holderSimple`;
`getLastHolderMind(id)`. `/lab`: `Variant.decisions` (`mental` 0..10 per side, `holder` on/off from variant A), rows
"Holder off-argmax%", "Holder lapses%", "Holder release%", "Release% (high P)". `/test`: Mind block in Decision Scores,
scenarios `decision-iq` (8 vs 3) and `tired-lapse`. Scripts: `decision-baseline.ts` (`--mental 8,3 --same`, mind
tallies, release by P band and n), `decision-release-tune.ts` (release grid against FM27).

### Measurements (2026-11-18)

`decision-baseline.ts 200 <league> --chunks 4`, seed 9000 (balanced, AI formations, fitness 88); off =
`DECISION_OVERRIDES='{"HOLDER":false}'`, which reproduces the phase-2 baseline exactly (1.930 / 5.42, same mix).

| | premier off | premier on | championship off | championship on |
|---|---|---|---|---|
| Goals / shots / xG | 1.930 / 5.42 / 3.03 | 2.050 / 5.63 / 3.15 | 1.600 / 5.08 / 2.86 | 1.605 / 5.08 / 2.83 |
| Passes (completed %) | 47.2 (94.6%) | 49.1 (94.8%) | 43.9 (94.3%) | 49.4 (94.6%) |
| Turnovers | 20.8 | 22.1 | 20.5 | 21.1 |
| Holder entropy (team-match) | 1.487 | 1.522 | 1.420 | 1.491 |
| Off-argmax (mind / telemetry) | 0% | 13.7% / 12.9% | 0% | 14.3% / 13.5% |
| Lapse (% of decisions) | — | 4.0% | — | 9.7% |
| Simple-minded | — | 16.9% | — | 19.8% |
| Release (all / pN ≥ 0.55) | — | 8.7% / 17.1% | — | 9.5% / 18.2% |
| Release n = 0 / n ≥ 1 | — | 66% / 1.1% | — | 69% / 1.2% |
| Release by raw P 0–9 / 10–19 / 20–29 / 30–39 / 40–79 / 80+ | — | 0.1 / 4.7 / 16.5 / 19.5 / 17.5 / 15.0% | — | 0.1 / 5.1 / 16.2 / 20.6 / 18.7 / 15.5% |
| Pick after a release | — | carry 80 · through 13 · cross 5 · shoot 1 · pass 1% | — | same |

FM27 targets: release 15% overall, 96% of them without an open pass, mostly an escape carry then a long ball; lapse
~4% per decision (~1% elite). Ours: the release share is lower (~9%) because only 12% of our holder decisions have no
open pass; high-pressure decisions here usually still have one. The long ball is rarely available when released.

World volume (`ai-formation-goals.ts --engine 800 --chunks 4 --modes ai --quick 0`): premier_league 2.031 → 2.053
goals (+1.1%), 5.60 → 5.73 shots (+2.3%); of_championship 1.583 → 1.603 (+1.3%), 5.02 → 5.10 (+1.6%). The quickSim
does not change, so its gap to the engine widens by the same ~1.2%; not recalibrated (end of the decision work).

M4 effect size (same club, mental 8 vs 3, sides swapped every other match, 400 matches each): seed 9000 V−D +3.5 pp,
seed 12000 −1.3 pp, pooled +1.1 pp (±3); control 3 vs 3 (200): −3.0 pp. The holder mind alone does not reach the
+3..+6 pp target: off-ball, defence (phase 4) and the consistency cap (phase 5) add the rest of the mental layer.

Tuning history: σ 0.01 + 0.09 (design): 1.35 goals / 3.96 shots (−30%), off-argmax 34%; noise off: 2.01 (gates alone
cost nothing). σ 0.005 + 0.02 kept. Release `D·k/(5n+10)` with k = 40: 1.3% with no open pass, 12% with one (the
opposite of FM27): reformulated.

## Holder moves (phase 3, flags `SHIELD`, `CUT_INSIDE`, `LAY_OFF`, `CHIP`, `ROUND_KEEPER`, on by default)

Approved scope addition. Each move is its own scored option of `decideBallHolder` (`Domain/HolderMoves.ts`, pure),
compressed like the other actions (`HOLDER_MOVES.STRONG_RAW` 0.8), executed by an existing action with a `move` tag
(`PlayerDecision.move`); with the holder's mind on it shares the noise of that action. The mental profile only counts
with `HOLDER` on (off, every player reads the default: no mental effect, identity test). Constants `HOLDER_MOVES`
(`DecisionConfig.ts`, `HOLDER_MOVES_OVERRIDES` env). Set-piece takers and the keeper never use them.

| Move | When | Score (raw) | Execution |
|---|---|---|---|
| Shield / turn | back to goal (last movement > 112° from goal, or the nearest opponent ≤ 4 yd on his goal side) and an opponent ≤ 2.5 yd | 0.45 × (strength + composure)/2 × (0.5 + pN) | carry away from the presser at 0.3 × speed; a tackle on him × (1 − 0.35 × strength), its foul chance × 1.4. He turns when the carry wins again |
| Cut inside | 14+ yd off the centre line, 16–40 yd from the goal line, first 6 yd toward the box edge (20 yd out, 8 yd wide) clear by 3 yd | 0.8 × (0.4 + 0.6 × (dribbling + flair)/2) × (0.5 on the natural foot) × 1.3 if the full-back shows him outside | carry along the diagonal |
| First-time lay-off | just received, back to goal, an opponent ≤ 5 yd, a teammate 4–18 yd away, ≤ 3 yd ahead, arriving (≥ 0.8 yd/s), lane clear by 2.5 yd | 1.0 × (0.35 + 0.3 × passing + 0.35 × decisions) | pass to him at once (before the reception burst) |
| Chip | keeper ≥ 5 yd off his line and within 3 yd of the shot line, shooter 10–26 yd out and 4+ yd beyond him | chance = 0.8 × depth factor × angle × (0.4 + 0.6 × (finishing + composure + flair)/3); score = 2 × compressed like a shot | decided at the strike (`resolveChip`): a goal flies in, a miss lands wide; the keeper never meets it |
| Round the keeper | one-on-one gate on, keeper ≤ 5 yd in front, not recovering | 1.6 × (0.3 + 0.7 × (dribbling + composure)/2) × (1 − d/7) | dribble at the keeper; P(win) = skill / (skill + smother) (`resolveRoundKeeper`); beaten, the keeper is out 1.4 s |

Event `holderMove { move, phase: start | success | fail }` (start counted once per streak). `Statistics` team counters
`moveShield`, `moveShieldHeld` (a challenge held off), `moveCutInside`, `moveLayOff`, `moveChip`, `moveChipGoals`,
`moveRound`, `moveRoundWon`. `/lab` rows "Shields", "Cut-ins", "Lay-offs", "Chips", "Chip goals", "Round the keeper",
"Keeper rounded". `/test` scenarios `move-shield`, `move-cut-inside`, `move-lay-off`, `move-chip`, `move-round-keeper`.
`decision-baseline.ts` prints the moves per match. Test `HolderMoves.test.ts`.

Measurements (2026-11-19; `decision-baseline.ts 200 <league> --chunks 4`, seed 9000; world =
`ai-formation-goals.ts --engine 800 --chunks 4 --modes ai --quick 0`; "mind only" = the phase-3 commit before the moves):

| | premier mind only | premier + moves | championship mind only | championship + moves |
|---|---|---|---|---|
| Moves / match (shield · cut · lay-off · chip · round) | — | 0.41 · 0.85 · 0.55 · 0.42 · 0.56 | — | 0.32 · 0.41 · 0.43 · 0.28 · 0.22 |
| Successes (shield held · chip goals · keeper rounded) | — | 0.02 · 0.13 · 0.38 | — | 0.04 · 0.08 · 0.14 |
| World goals / shots | 2.053 / 5.73 | 1.960 / 5.51 (−4.5% / −3.8%) | 1.603 / 5.10 | 1.623 / 5.00 (+1.2% / −2.0%) |

Against the engine without the decision layer (`HOLDER` off, 2.031 / 1.583) the two leagues together are −0.8% in goals.
Tuning: the first weights (shield 0.65, cut 1, lay-off 1.3, chip 3, round 2.5) gave 2.5 · 4 · 3.5 · 0.4 · 1.1 moves per
match and −5% / −9% goals and shots in the Premier League; one move off at a time showed each costing goals (shield
−0.25, round −0.16, lay-off −0.14, cut −0.13 per match): the holder picked them over better actions. The frequency of
each move falls steeply with its weight; at the final weights each is under one per match.

Stage 4 (`movement.md`) retuned the move gates and weights: 1–3 per match each in the Premier League (shield 1.5, cut 2.0,
lay-off 3.0, chip 1.5, round 1.3) and the M4 effect to +5.8 pp with the anticipation layer.

## Limitations

- The pressure scale is raw FM; phase 3 normalises it (pN = P/60) for its gates.
- Holder mind: the lapse share doubles in weak leagues (9.7% in the Championship); the facing direction is the last
  movement (no body orientation); the mental effect size of the holder alone is ~+1 pp.
- Holder moves: since stage 4 each fires 1–3 per match (Championship shield and cut just under 1); the drawing maps each to
  an existing pose (`movement.md` § 6); the AI never reacts to a shielding holder.
- Shot pressure reads the shooter's last holder decision (set-piece shots and shots after a foul have none).
- Entropy depends on the bucket grid; compare runs only with the same `PRESSURE_HIGH` and channel split.
