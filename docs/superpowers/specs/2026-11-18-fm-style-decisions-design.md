# FM-style decisions (engine rebuild, step 2)

Approved by the user on 2026-11-18. Inspired by a reverse-engineering study of Football Manager's match engine
(gates on attribute sums, attribute tests with a mood-dependent roll, fatigue lapses, a consistency cap on stacked
bonuses, a second presser standing off). User decisions: mental attributes are real roster attributes; morale feeds
mood at half weight; the scope is every player (holder, off-ball, defence); if goal volume moves across all steps,
it is adjusted at the end.

## 1. What is robotic today

- `decideBallHolder` takes the argmax of compressed scores with no randomness; `OffBallMovement` and
  `DefensivePositioning` too (fixed tie-break order). Same geometry, same choice, for every player.
- Attributes barely enter the choice (shoot ignores finishing; dribble ignores dribbling; passing skill and vision add
  at most +0.15 gated by the lane).
- No mental layer: morale, familiarity and settling only scale attributes; fatigue never causes a wrong choice.
- World scale: outfield attributes are low (vision p50 2.8), so every gate works on normalised 0..1 values.

## 2. Mental attributes on the roster

- `PlayerStatsRecord` gets 4 required keys, 0.0–10.0 one decimal: `decisions`, `composure`, `flair`, `anticipation`.
  Same keys in `DevelopmentProgress`, `AttributeId`, `ATTRIBUTE_LABELS`, i18n.
- Consistency stays hidden, derived per match from personality and experience.
- Derivation (`src/Domain/mental/mental.ts`, `deriveMental(stats13, age, id, personalityShift)`):
  `n(a) = clamp(a/6.5, 0, 1)`, `exp = clamp((age−18)/12, 0, 1)`, `g(k)` = deterministic N(0,1) from
  `seedFrom("mental:<id>:<k>")`, personality shifts from `mentalShiftOf(p)` in `personality.ts`.

  ```
  decisions    = 6.5·clamp(.45n(vis)+.25n(pas)+.15n(press)+.15exp+.05t_prof        +.06g)
  composure    = 6.5·clamp(.30n(fin)+.25n(dri)+.15n(str)+.10n(pas)+.20exp−.10t_temp +.06g)
  flair        = 6.5·clamp(.50n(dri)+.25n(vis)+.15n(fin)+.10n(acc)+.08t_amb−.04t_prof+.06g)
  anticipation = 6.5·clamp(.40n(press)+.30n(vis)+.15n(tack)+.15exp                +.06g)
  consistency  = clamp(.50 + .25t_prof − .15t_temp + .15(exp − .5), 0, 1)   (hidden)
  ```
- World generation: a final data step `scripts/applyMentalAttributes.ts` after `applyPlayerCorrections.ts` (and the
  other curated steps), before `kits:generate`.
- Load-time fill: `withMentalAttributes` fills only missing keys by the same derivation (deterministic by id) in the
  DAL reads (squads, youth, free agents, retired). Not migration: absent fields derived like `personalityOf`; players
  with the keys are untouched. Keeps the live friends world loading. Engine safety net: `teamLineup` derives when a
  key is missing.
- Generators that must produce the keys: youth intake and youth-competition fillers (`statsFor`: the "weight 0 → ≤ 2"
  clamp skips mental keys, derived after the solve), created player, real legends, reborn, free-agent youths,
  national fillers, ESPN clones.
- Overall and market value: weight 0 in `attrWeights` (overall, value, wages, aptitude stay bit-identical; tested).
- Development: separate additive pool from matches only, `mentalDP = earnedDP × 0.25 × mentalAgeGrowth(age) ×
  GROWTH_DP_SCALE`, `mentalAgeGrowth` ≤21 0.5 · 22–27 0.7 · 28–31 0.6 · 32–34 0.3 · 35+ 0.1, split by
  `roles.json → mentalWeights`; decline only from 33 at 0.3 × the age decay; existing cost, soft cap and elite brake.
- Scouting blurs the keys automatically; scout filters get a "Mental" group; PlayerScreen, PlayerCard and
  DevelopmentScreen a "Mental" block, behind `SHOW_MENTAL` until the engine uses them.
- quickSim unchanged at first; revisit if residuals correlate with team mental level.

## 3. Engine: ball holder

- `PlayerStats.mental` (0..1). Mood fixed at kickoff: `mood = clamp(.5·moraleFactor + .5·formF, −1, 1)`; bands good
  ≥ 0.35, bad ≤ −0.35. AI: form (plus `aiFormMorale` against a human).
- Gates: panic (pressure ≥ 0.55 and (composure+decisions+vision)/3 below a threshold rising with pressure and falling
  with time on ball: only safest pass, best-clearance carry, long ball in own half, shot only with xG ≥ 0.15);
  simple-minded (decisions < 0.30: through ball only with raceMargin ≥ 0.5 s, no cross/long ball beyond 33 yd,
  dribble only with carryBias ≥ 0.6); long-shot range 27 + 22·(flair+composure)/2 yd (≤ 49). One-on-one gate, set
  pieces and the keeper unchanged.
- Attribute test: T = max(U1,U2) good mood, U1·U2 bad, U1 neutral; `test = dec·(0.4+0.6T)`;
  `σ = 0.01 + 0.09·(1−test)`; perceived score `s + σ·z`, noise held for a 4-tick window (0.8 s), re-rolled on a new
  holder; flair bias +0.03·(2flair−1) on dribble, through ball, long shot.
- Lapse: `p = 0.20·(1−energy/100)²·(1.5−consistency)` per window; on a lapse each perceived score × U(0.55, 1).
- Dice in `ActionOutcomes.ts`; noise state in `GamePlayer.decisionNoise`.

## 4. Engine: off-ball and defence

- Noise rolled on a fresh decision only (decisions are already committed for `COMMIT_TICKS`), multiplicative.
- Off-ball: `test = ((dec+antic)/2)·(0.4+0.6T)`, `s' = s·(1 + σ_rel·z)`, `σ_rel = 0.03 + 0.25·(1−test)`; flair
  `make_run × (1 + 0.06·(2flair−1))`; lapse → `hold_space`; offside awareness × (0.7 + 0.6·antic).
- Defence: same form, `σ_rel = 0.02 + 0.20·(1−test)`; lapse: `track_mark → hold_shape`, press held back for the
  window. Tackle range stays a hard rule.
- Anticipation in pressing: carry-intercept lookahead × (0.6 + 0.8·antic); second presser stops 5 yd short.
- Positioning discipline: the target lags the shape anchor with `τ = 0.15 + 0.5·(1 − (dec+antic)/2)` s.

## 5. Flags, surfaces

- `Configs/DecisionConfig.ts`: `HOLDER`, `OFFBALL`, `DEFENSE`, `ANTICIPATION_PRESS`, `SECOND_PRESSER`,
  `DISCIPLINE_LAG`, `CONSISTENCY_CAP`; `DECISION_OVERRIDES` env and `simulateMatch(..., { decisions })`. A flag off
  makes no `Math.random` call (game-for-game identical with a fixed engine seed).
- Events `holderDecision`, `offBallDecision`, `defensiveDecision` (12 situation buckets). Statistics: decisions,
  deviations from argmax, lapses per family, panic, lapse → turnover, lapse → shot conceded, decision mix.
- `/lab`: entropy per family, off-argmax %, lapses, `Variant.decisions`. `/test`: perceived vs true scores, gates,
  mood, lapse, scenarios `decision-iq`, `tired-lapse`, `anticipation-press`, a per-team "Decisions" selector.

## 6. Calibration

M0 identity (flags off), M1 world volume per flag (`ai-formation-goals.ts`), M2 action mix
(`passing-mix-diagnostic.ts`), M3 formation balance (`formation-matrix.ts`), M4 effect size (decisions 0.8 vs 0.3
on the same club, target V−D +3..+6 pp), M5 seat edge. Goal volume: measured and reported per step; the user
accepted adjusting the total at the end.

## 7. Phasing

1. Data: roster keys, derivation, load-time fill, generators, pipeline step, mental development, scouting, UI behind
   `SHOW_MENTAL`. Engine reads nothing. Proof: overall diff 0.
2. Instrumentation, no behaviour change; baseline entropy.
3. Ball holder.
4. Off-ball and defence, one flag at a time.
5. Release: consistency cap, in-match confidence, `SHOW_MENTAL` on, quickSim refit if needed, kits regenerated, docs.
