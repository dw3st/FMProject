# Youth trials (peneira de jovens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the human club schedules youth trials, signs amateur youngsters for free, and earns reputation, followers,
fans and fame when one of them makes it (spec `docs/superpowers/specs/2026-11-24-youth-trials-design.md`).

**Architecture:** pure rules in `src/Domain/youth/trials.ts` (constants `trialConfig.ts`), types in
`src/types/youthTrialTypes.ts`, state on `SeatState.youthTrials` / `SeatState.trialReveals`, E/S in
`src/backend/youthTrialWorld.ts` (trial day, Monday reveals) called from `advanceDay.ts`, routes in
`src/backend/youthTrialRoutes.ts`, screen `src/GameInterface/Squad/YouthTrialsPanel.tsx` in the Academy tab.

**Tech stack:** Bun, TypeScript, React 19, bun test.

**Deviation from the spec:** the `sold` reveal is read on Monday from `RosterPlayer.arrival` (a transfer or clause
fee of €10M or more at a club other than the trial club), not hooked into every sale path. At most a week late.

---

### Task 1: Config and types

**Files:** create `src/Domain/youth/trialConfig.ts`, `src/types/youthTrialTypes.ts`; modify `src/types/seatTypes.ts`,
`src/types/playerTypes.ts`, `src/types/inboxTypes.ts`.

- `YOUTH_TRIAL`: `SIZES { small: { count: 20, share: 0.002 }, medium: { 40, 0.005 }, large: { 60, 0.01 } }`,
  `AGES [15, 16, 17]`, `MIN_DAYS 14`, `MAX_DAYS 28`, `PER_SEASON 2`, `RESULTS_DAYS 14`, `LEVEL_OFFSET 2.2`,
  `LEVEL_SIGMA 0.5`, `GEM_CHANCE 0.004`, `GEM_BONUS 1.0`, `COACH_GEM [0.75, 1, 1.4]` (1★/3★/5★, none = 2★),
  `FAME_STEP 0.25`, `FAME_MAX 2`, `KNOWLEDGE [30, 50, 70]`, `SIGN_MAX 18`, `REVEAL { FIRST_TEAM_OVERALL 6.0,
  WORLD_TOP 100, SOLD_FEE 10_000_000 }`, `REWARD { FOLLOWERS 0.02, FANS 3, REP_MAX 5, REP_TOP 2 }`.
- Types: `TrialSize`, `TrialAge`, `TrialScheduled { id, date, age, size, cost, scheduledOn }`,
  `TrialResult { id, date, expires, age, players: RosterPlayer[] }`, `YouthTrialsState { scheduled?, results?,
  seasons: { season: string; count: number }[] }`, `TrialReveal = "first_team" | "world_top" | "sold"`,
  `TrialOrigin { clubId, clubName, date, seatId }`, views for the route.
- `SeatState.youthTrials?: YouthTrialsState`, `SeatState.trialReveals?: { count: number; top: number }`.
- `RosterPlayer.trialOf?: TrialOrigin`, `RosterPlayer.trialRevealed?: { kind: TrialReveal; on: string }`.
- `Squad.trialFame?: number` (reveals of the club, the fame multiplier).
- `YouthInboxMessage.kind` gains `"trial" | "trial_revealed"`, fields `trial?: { count, gems }`,
  `revealed?: { id, name, kind: TrialReveal, clubName }`.

### Task 2: Pure rules (`trials.ts` + test)

Functions, all pure:
- `trialCost(size, revenue)` = round(revenue × share), at least 0.
- `parseTrialRequest(body)` → `{ age, size, date }` or null.
- `checkTrialRequest(req, { today, state, season })` → error code (`invalidTrial`, `trialPending`, `trialLimit`) or null.
- `seasonCount(state, season)`, `withScheduled(state, trial, season)` (adds the count).
- `fameMult(reveals)` = min(FAME_MAX, 1 + FAME_STEP × reveals).
- `coachGemMult(stars | undefined)` via `starCurve` (undefined = 2★).
- `trialKnowledge(stars | undefined)` via `starCurve` on `KNOWLEDGE`.
- `generateTrialPlayers({ saveId, seatId, trial, squad, nationality, coachStars, fame })`: count = round(count × fame);
  role weights GK 1 DEF 4 MID 4 FWD 3; level = clamp(lineAverage − LEVEL_OFFSET + σ·gauss, LEVEL_MIN, LEVEL_CAP);
  gem chance × coach × fame, gem +GEM_BONUS cap PROMISE_CAP, Wonderkid; `makeAcademyPlayer` at age `[a, a]`; ids
  `trial_<seat>_<hash>_<i>`; seed `save:seat:date:trial`.
- `revealOf(player, { worldTop, inFirstTeamOf })` → `TrialReveal | null`.
- `trialReputation(reveals)` = min(REP_MAX, count + REP_TOP × top).
- Test: cost, parse, limits, count with fame, determinism, ages, gems frequency over many seeds, reveal rules,
  reputation cap.

### Task 3: World I/O and day hooks (`youthTrialWorld.ts`)

- `runTrialDay(ds, squad, date, saveId)`: scheduled with `date === today` → results (expires today + 14), scheduled
  cleared, inbox `trial` deferred. Results past `expires` are dropped.
- `mondayTrialReveals(service, saveId, date, seats)`: only when some seat has `youthTrials`; reads all squads once,
  `worldTopIds(squads, 100)`; marks `trialRevealed`, writes squads; seat patch `trialReveals`, trial club followers
  +2% and `trialFame` +1; fans +3 through `applyPressEffect` when the seat still runs the trial club; inbox
  `trial_revealed`.
- `advanceDay.ts`: trial day after the youth Monday block; Monday reveals in the same place.
- `managerReputation(..., licencePoints, trialPoints = 0)`: every call site with a seat passes
  `trialReputation(meta.trialReveals)`.

### Task 4: Routes (`youthTrialRoutes.ts` + test)

- `GET /api/saves/:saveId/youth/trials`: state, cost of each size, limit left, results blurred
  (`obscureForViewer` with `uncertaintyOf(trialKnowledge)`), each with seen overall range, potential range, `gem`
  (by `isGem` on the seen potential).
- `POST …/youth/trials`: schedule, charge `recordMoney` ledger `scouting` / `ref.stage = "trial"`.
- `DELETE …/youth/trials/:trialId`: cancel before the day.
- `POST …/youth/trials/sign { ids }`: into `squad.youth` with the academy contract and `trialOf`; full → `youthFull`
  list; 409 `offerClosed` when no valid results.
- Register in `routes.ts`, the three write routes in `worldLobbyGuard.ts`.
- Test: schedule (cost in the ledger), limits, cancel, day generates results, sign, blurred view never exact.

### Task 5: Rewards in achievements

- Track `trial_reveals` (youth, attribute youth, 1/3/8); snapshot `trialReveals` from the seat; i18n names.

### Task 6: Screen

- `YouthTrialsPanel` in the Academy tab: chips age / size / day (+14, +21, +28), cost, limit left, Schedule;
  the scheduled trial with Cancel; the results table (position, name, age, OVR range, potential range, Gem tag,
  tick boxes) and Sign; the player page line "Revelado na peneira do <clube>". Inbox bodies for `trial` and
  `trial_revealed`. i18n en and pt-BR.

### Task 7: Measure, docs, release 12.37

- `scripts/youth-trial-measure.ts`: gems per trial by size and coach, mean level.
- `.claude/rules/game/youth.md` section, changelog 12.37 (+ Em breve), `package.json` 12.37, mark 107866d4 done.
- Tests: `bun test src/Domain/youth src/backend/youthTrial.routes.test.ts src/GameInterface/changelog`, typecheck,
  `bun run ui:audit --hard`.
