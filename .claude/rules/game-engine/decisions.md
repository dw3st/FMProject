# Decision telemetry (FM-style decisions, phase 2)

Spec: `docs/superpowers/specs/2026-11-18-fm-style-decisions-design.md` (§5–7). Phase 2 is **instrumentation only**: no
decision changes, no die is drawn. Phases 3–5 (holder gates and noise, off-ball and defence noise, release) will be
measured against the baseline below.

## Flags (`src/GameEngine/Configs/DecisionConfig.ts`)

- `DECISION_FLAGS`: `HOLDER`, `OFFBALL`, `DEFENSE`, `ANTICIPATION_PRESS`, `SECOND_PRESSER`, `DISCIPLINE_LAG`,
  `CONSISTENCY_CAP`, all `false`. Nothing reads them yet.
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

## Limitations

- The pressure scale is raw FM; phase 3 must normalise it before using §3's thresholds.
- Shot pressure reads the shooter's last holder decision (set-piece shots and shots after a foul have none).
- Entropy depends on the bucket grid; compare runs only with the same `PRESSURE_HIGH` and channel split.
