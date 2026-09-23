# Tactics as a Collection of Team Intents (Future Vision)

## Purpose

Today, `TacticalStyle` is a static label that maps to a fixed bundle of axes
(`pressing_style`, `defensive_line`, `width`, `build_up`). The engine reads
those axes once at apply time and treats them as constants for the rest of the
match.

Real football tactics are not static. A "counter attack" team holds shape
when the opponent is patient in their own half, then commits to pressing the
moment attackers progress into the structured defensive zone. The same tactic
produces different behaviour at different moments.

The long-term goal: **`TacticalStyle` becomes a probability distribution over
`TeamIntent`s** — each user-facing tactic is just a bundle of intents whose
firing rates differ by tactic. The engine evaluates intents every few seconds
+ on ball change and the picked intent reshapes the static config.

---

## Core Model

| Concept | Lifetime | Purpose |
|---|---|---|
| `TacticalStyle` | Set once per match | Manager preference; controls how often each intent rolls out |
| `TacticalAxes` | Derived from style at apply time | Static base config the intents layer on top of |
| `TeamIntent` | Recomputed on ball change + every ~3s | Mechanic that rewrites tactic config dynamically |

**Exactly ONE intent per team at any moment.** A team has the ball or doesn't,
so offensive intents (e.g. `counter_attack`) and defensive intents (e.g.
`hold_shape`, `press_now`) never need to coexist on the same team.

**Intents are GENERAL mechanics, not tactic-bound.** In the long run any tactic
can fire any intent — `possession` tactic just rolls `counter_attack` intent
much more rarely than `counter_attack` tactic does. For now the gating is
narrow because we are only balancing the counter_attack tactic.

---

## Where We Are

| Layer | Status |
|---|---|
| `TacticalStyle` enum | static — picked once via `applyTeamTacticsConfig()` |
| `TacticalAxes` (pressing_style etc.) | static — derived from style at apply time |
| `TeamIntent` enum | dynamic — `balanced` / `counter_attack` / `hold_shape` / `press_now` |
| Intent detection | dynamic — runs on possession transfer + every 3 game-seconds |
| Intent gating | tactic-scoped (only counter_attack tactic uses dynamic intents today) |
| Intent effects | layered on top of static axes — multipliers + tactic-key overrides |

The intent system covers offensive bias (pass / carry / off-ball / shoot) and
defensive overrides (`pressingStyleOverride`). Each new intent or effect should
follow the same pattern: declare it in `IntentConfig.INTENT_EFFECTS`, gate it
in `IntentDetection.detectTeamIntent`, and consume it in the relevant scoring
function.

---

## Migration Discipline

**Do not do a big-bang migration.** Each iteration adds one more behaviour into
the intent system, only for the tactic currently being balanced. Wrong moves:

- Adding intents speculatively for tactics we are not actively tuning.
- Mixing offensive and defensive effects into a single intent value (e.g. don't
  put a defensive `pressingStyleOverride` on the `counter_attack` intent —
  defense gets its own intents).
- Replacing a static axis (`defensive_line`, `width`, `build_up`) before we have
  validated its dynamic equivalent.
- Inventing intent names for moods or vibes that the engine cannot detect from
  state — every intent must have a concrete numeric gate in `IntentDetection`.

Right moves:

- Add one new intent the moment a real situation needs distinct behaviour.
- Keep offensive and defensive intents separate — one team has the ball OR
  doesn't, so a single-slot `TeamIntent` covers both phases naturally.
- Document the new intent / effect in this file's "Active intents" table below.

---

## Active intents

| Intent | Phase | Tactic gate (today) | Fires when | Effects |
|---|---|---|---|---|
| `counter_attack` | offensive | `counter_attack` | Team has ball AND opponent has > 5 players in their attacking 40 yds | Offensive: PROGRESS-biased pass/carry, make_run-biased off-ball, +0.05 shoot bonus |
| `hold_shape` | defensive | `counter_attack` | Team is defending AND no press_now opportunity | None today — named slot for future stricter shape behaviour (tighter compactness, deeper line) |
| `press_now` | defensive | `counter_attack` | Team is defending AND ball holder enters our goal-score area (penalty box) | Defensive: pressing_style → `high_press` |

## Active effects

| Effect | Where applied | What it does |
|---|---|---|
| `pass.<key>` (multipliers on TeamPassWeights) | `applyPassIntent` in PassLanes scoring | Boosts/dampens specific weights when a holder picks a pass |
| `carry.<key>` (multipliers on TeamCarryWeights) | `applyCarryIntent` in carry lane scoring | Boosts/dampens carry weights for the holder |
| `shoot.scoreBonus` | `getShootIntentBonus` in DecisionTree | Flat add to shoot ActionScore |
| `offBall.<intent>` (multipliers on off-ball intent map) | `applyOffBallIntent` in OffBallMovement | Reweights make_run / hold_space / offer_support |
| `defense.pressingStyleOverride` | `effectivePressingStyle` in DefensivePositioning | Replaces team's static pressing_style for INTENT_PRESSING_STYLE lookup + `effectivePressRange` |

---

## Re-evaluation cadence

Three triggers fire `detectTeamIntent` for both teams:

1. **Possession transfer** — `onPossessionTransfer` in `gameState.ts` calls
   `reevaluateTeamIntents` whenever the team in possession changes.
2. **Pass reception (same team)** — a pass completed to a teammate re-evaluates
   intent, because the new receiver may be in a switch_play position.
3. **Periodic tick** — every `INTENT_REEVAL_INTERVAL` game-seconds (3s) the
   tick loop re-evaluates even when possession has not changed. This catches
   mid-possession shifts (opponent advances, we lose a numbers advantage).

`state.lastIntentEvalTime` tracks the last evaluation match-time. All triggers
bump it.

### switch_play is excluded from the periodic tick

`switch_play` is a **per-possession commitment**, not a moment-to-moment
reading. Its gate (`isSwitchPlayOpportunity`) depends on transient geometry
(holder wide, far flank open), so re-judging it every 3s flips it back to
`balanced` the instant the holder drifts central or an opponent steps into the
far channel — visible flicker.

The periodic tick therefore calls `reevaluateTeamIntents(s, { includeSwitchPlay:
false })`. On that path `detectTeamIntent` receives `allowSwitchPlay: false` (so
the timer can never *newly* trigger a switch), and `recomputeTeamIntent` holds a
team already on `switch_play` untouched (so the timer can never *clear* an
in-progress switch). switch_play is thus only set/cleared at triggers 1 and 2 —
the possession-change / reception events where a switch decision actually
belongs.

---

## When to add a new intent

Reach for a new intent when the static tactic produces wrong behaviour in some
situation but is correct elsewhere. Examples:

- A `counter_attack` team should commit to pressing when attackers reach our
  half with structured numbers → `press_now` intent (DONE).
- A `possession` team should switch to `direct` build-up when chasing a goal
  late → would be a new `chasing_game` intent with `build_up` overrides.
- A `high_press` team should drop to `mid_block` once tired (low team energy) →
  would be a new `tired_press` intent with `pressingStyleOverride: 'mid_block'`.

Each example is a separate iteration. Each iteration adds **one** firing gate
and **one** effect, validated against a debug snapshot, before moving on. Keep
intents single-purpose — if an intent needs both an offensive override AND a
defensive override, it's actually two intents.

---

## Files involved

| File | Role |
|---|---|
| `src/GameEngine/types.ts` | `TeamIntent` enum + `GameState.teamIntent` + `GameState.lastIntentEvalTime` |
| `src/GameEngine/Configs/IntentConfig.ts` | `IntentEffects` interface + `INTENT_EFFECTS` registry + apply helpers |
| `src/GameEngine/Domain/IntentDetection.ts` | `detectTeamIntent` + per-tactic / per-intent firing predicates |
| `src/GameEngine/Domain/gameState.ts` | `onPossessionTransfer` + `reevaluateTeamIntents` + periodic tick |
| `src/GameEngine/Domain/DefensivePositioning.ts` | `effectivePressingStyle`, `effectivePressRange` (intent-aware) |
| `src/GameEngine/Domain/PassLanes.ts` | reads `applyPassIntent` |
| `src/GameEngine/Domain/CarryLaneEval.ts` | reads `applyCarryIntent` |
| `src/GameEngine/Domain/OffBallMovement.ts` | reads `applyOffBallIntent` |
