# Off-Ball Movement

What attacking teammates without the ball do: make themselves an option, hold the team shape, or
run in behind. Applies only to the team in possession; goalkeepers are excluded.

## Files

| File | Role |
|------|------|
| `Domain/OffBallMovement.ts` | `evaluateOffBall()` — intent selection, grid candidates, cell scoring |
| `Configs/OffBallConfig.ts` | `OFF_BALL_CONFIG` weights/radii, `INTENT_BUILD_UP`, `INTENT_WIDTH` |
| `Configs/IntentConfig.ts` | `applyOffBallIntent` — team-intent multipliers (`tactics-as-intents.md`) |
| `Domain/roleEngineData.ts` + `roles.json` | Per-role `offBallIntentWeights` and `offBallBias` |
| `Domain/gameState.ts` | Executes the decision (lookahead, formation pull, offside clamp) |

## Entry

`decide()` calls `evaluateOffBall(player, ballHolder, allPlayers, offsideLine, teamIntent, crowdGrid)`
for every outfield teammate of the holder. While a pass or shot is in flight the player keeps last
tick's decision (re-evaluating mid-flight made players shake as the offside line moved). Without a
crowd grid (some MCP queries) the result is `idle`.

## Stage 1 — intent

Three intents (`OffBallIntent`):

| Intent | Meaning | Anchor of the cell search |
|---|---|---|
| `offer_support` | Become a clean passing option now | 60% player / 40% holder, radius 12 yds |
| `hold_space` | Occupy a quiet zone in the team shape (ball-independent) | The attacking formation slot (`attackingAnchor`), radius 16 |
| `make_run` | Break behind the line into open space ahead | Player + 10 yds forward, radius 20 |

Score of each intent = role weight × `INTENT_BUILD_UP[build_up]` × `INTENT_WIDTH[width]`, then:
- `offer_support`: × (1 + 1.5 × (1 − pass score)) when the current pass score (`scorePassQuality`
  holder → player) is below 0.35, and × (0.4 + 0.6 × local pressure + 0.5 × urgency), where
  urgency = 1 − pass score and local pressure counts opponents within 6 yds (2 = full)
- `hold_space`: × (0.6 + 0.6 × (1 − urgency) + 0.3 × (1 − local pressure))
- `make_run`: + 0.35 when the holder just received within 15 yds (give-and-go); faded linearly to
  × 0.1 between 10 and 30 yds ahead of the holder; × 0.5 when more than 20 yds behind
- then the team-intent multipliers (`applyOffBallIntent`, e.g. `counter_attack` boosts runs)

The highest score wins. Role weights (`roles.json` → `offBallIntentWeights`):

| Role | offer_support | hold_space | make_run |
|---|---|---|---|
| CB | 0.30 | 0.80 | 0.05 |
| LB / RB | 0.45 | 0.55 | 0.20 |
| LWB / RWB | 0.40 | 0.60 | 0.30 |
| CDM | 0.70 | 0.65 | 0.10 |
| CM | 1.10 | 0.35 | 0.30 |
| CAM | 1.00 | 0.30 | 0.55 |
| LM / RM | 0.55 | 0.55 | 0.40 |
| LW / RW | 0.40 | 0.55 | 0.65 |
| ST | 0.30 | 0.40 | 0.80 |

Tactic multipliers (support / hold / run): possession 1.4 / 1.2 / 0.6, balanced 1 / 1 / 1, direct
0.8 / 0.7 / 1.5; wide play × 1.15 on `hold_space`, narrow × 0.95.

## Stage 2 — candidate cells

A square grid of cells every 4 yds (`CANDIDATE_STEP`) around the intent's anchor, clamped 1 yd
inside the pitch.

## Stage 3 — cell score

Signals from the crowd grid (3×3 samples): `separation` (teammates nearby, self excluded) and
`markFreedom` (opponents nearby), both 0..1, saturating at 1.5 players. Every intent subtracts the
same penalties: role fit (yards outside the role `bounds` × 0.05 × 0.20), same-role clustering
(inside 15 yds, 2 × 0.35 per player) and offside overrun (`OFFSIDE_AWARENESS` × 0.15 per yard past
`offsideLine − OFFSIDE_MARGIN`).

| Intent | Positive terms |
|---|---|
| `offer_support` | pass quality holder → cell × 0.55 + markFreedom × 0.25 + separation × 0.20 |
| `hold_space` | separation × 0.50 + slot proximity (0 at 18 yds) × 0.30 + markFreedom × 0.20 |
| `make_run` | forward progress / 20 yds × 0.50 + markFreedom × 0.35 + (0.5 + 0.5 × separation) × 0.15 |

The best cell becomes `support_run { dx, dy }` (unit direction to it). If the best score is below
`MIN_SCORE_THRESHOLD` (0.2), roles with `offBallBias ≥ 0.5` (CM, CAM, LM, RM, LW, RW, ST) get
`create_space` (straight away from the nearest opponent) and the others `idle`.

## Execution (`gameState.ts`)

- Raw target = position + direction × lookahead; lookahead = 8 → 16 yds with vision, × the role's
  `offBallBias` (ST 1.0, LW/RW 0.9, CAM 0.8, LM/RM 0.7, CM 0.6, CDM 0.3, LWB/RWB 0.25, LB/RB 0.15,
  CB 0.1)
- Blended 70/30 with the attacking formation slot (`FORMATION_PULL` 0.3), the slot pushed up with
  possession time
- Hard clamp to `offsideLine − OFFSIDE_MARGIN` and to the pitch; role bounds act only through the
  role-fit penalty
- Runners move at `pressSpeed`; within 15 yds of a holder who just received they get the
  acceleration burst (give-and-go)

## Debug

With debug on, every evaluation emits `offBallScores` (intent scores, chosen intent, best cell
score, decision); `/test` shows it in the decision panel and the MCP `score_off_ball` re-runs it.
