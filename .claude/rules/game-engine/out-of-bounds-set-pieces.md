# Out-of-Bounds Set Pieces — Plan

## Goal

Convert the current "drift OOB → instant possession transfer to nearest opposing player" stub into proper football set pieces:

- **Touchline (y < 0 or y > PITCH_WIDTH)** → throw-in for the team that did NOT make the last touch.
- **Goal line (x < 0 or x > PITCH_LENGTH)** → goal kick OR corner depending on which team last touched the ball:
  - Last touch by attacker (passer's team is attacking that goal) → goal kick for the defending team.
  - Last touch by defender (passer's own goal line crossed) → corner for the opposing team.

Players reposition into the relevant set-piece layout, the taker holds the ball briefly (countdown freeze), then plays it normally.

---

## What's already in place

| Piece | Status |
|---|---|
| `SetPieceLayouts.ts` | All 9 layouts already defined for 4-3-3, 4-4-2, 3-5-2 (kickOff, kickOffDefend, goalKick, corner_Attack, corner_Defend, throwIn_Attack, throwIn_Defend, freeKick_Attack, freeKick_Defend, offside_fk). **Layouts exist for all the set pieces we need — no new layout work.** |
| `applySetPieceToTeam(players, team, layout)` | Already teleports a team into the layout, mirrors for attackDir, handles multi-instance roles. Reusable as-is. |
| `SetPiece` interface (`types.ts`) | `{ type, takerId, countdown, position? }`. The `position` field already supports off-centre restarts (used by `offside_fk`). Reusable. |
| `SetPieceType` enum | `'kickoff' \| 'offside_fk' \| 'goal_kick'`. **Needs `'throw_in'` and `'corner'` added.** |
| `goal_kick` flow | Already used after GK saves and shots-off-target — calls `applySetPieceToTeam` with `goalKick` layout, sets countdown 1, hands ball to GK. **Reusable for ball-OOB-over-goal-line case.** |
| Countdown drain | `tickState` already drains `setPiece.countdown` at line ~1199. Generic — works for any new type. |
| Decision restrictions during set piece | `state.setPiece && state.setPiece.countdown > 0 → taker cannot carry, must pass`. Generic — works for any type. |

---

## What's NOT in place

1. `SetPieceType` doesn't include `'throw_in'` or `'corner'`.
2. `handleLooseBall` currently does a stub possession transfer when the ball goes OOB, with no set-piece freeze and no layout reposition.
3. No taker selection logic for throw-ins (closest defender of the awarded team to the ball's exit point) or corners (nearest winger / wing-back).
4. No restart-position logic — the ball needs to be placed at the corner flag (corner), at the touchline (throw-in), or in the box (goal kick) rather than wherever it drifted out.

---

## Boundary classification

When `handleLooseBall` detects `x < 0 || x > PITCH_LENGTH || y < 0 || y > PITCH_WIDTH`, classify the crossing:

```
const lastTouchTeam   = lb.fromTeamLastTouch;          // 'A' | 'B'
const passer          = state.players.find(p => p.id === lb.fromPasserId);
const attackingGoalX  = passer.attackDir === 1 ? PITCH_LENGTH : 0;   // goal the passer attacks
const defendingGoalX  = passer.attackDir === 1 ? 0           : PITCH_LENGTH; // passer's own goal

if      (y < 0 || y > PITCH_WIDTH)        → 'throw_in'
else if (x < 0 || x > PITCH_LENGTH) {
  const overAttackingGoal = (passer.attackDir === 1 && x > PITCH_LENGTH)
                         || (passer.attackDir === -1 && x < 0);
  if (overAttackingGoal) → 'goal_kick'  // defending team's GK takes from box
  else                   → 'corner'     // opposing team takes corner (rare for through balls)
}
```

For through balls specifically, `goal_kick` is the overwhelmingly common goal-line case. `corner` is theoretical (the passer played the ball backward over their own line) — keep the branch for completeness.

The team awarded:
- `throw_in`: opposing team (≠ lastTouchTeam)
- `goal_kick`: opposing team (defenders of the line crossed = ≠ lastTouchTeam)
- `corner`: opposing team (≠ lastTouchTeam)

In all three cases the awarded team is `oppositeOf(lastTouchTeam)`. The difference is the *layout* and *restart position*.

---

## Restart positions

The `position` field on `SetPiece` (already exists, used by `offside_fk`) overrides the taker's slot location for the actual ball spot:

| Set piece | `position` (yards) |
|---|---|
| `throw_in` | `{ x: clampedX, y: y < 0 ? 0 : PITCH_WIDTH }` — ball at touchline at the same x where it went out |
| `goal_kick` | `{ x: 6 yds in from the goal line of the awarded team, y: 37 (centre) }` — six-yard box edge |
| `corner` | `{ x: corner of the line crossed, y: 0 or PITCH_WIDTH (whichever side it went out) }` |

Players will use the `applySetPieceToTeam` layout to teleport into formation; the *taker* override (see below) keeps the actual ball point.

---

## Taker selection

| Set piece | Taker rule |
|---|---|
| `throw_in` | Nearest player from the awarded team to the touchline exit point. In a 4-3-3 the slot index 0 of `throwIn_Attack` is the LW — but we should let the closest player take it for realism. |
| `goal_kick` | The awarded team's GK. Always. |
| `corner` | Nearest winger (LW/RW based on which side) of the awarded team. Fallback: any midfielder. |

For all three, after taker selection:
- Set `state.ballHolderId = taker.id`.
- Set `setPiece = { type, takerId, countdown, position: <restart position> }`.
- Call `applySetPieceToTeam(players, awardedTeam, layout)` to reposition that team.
- Call `applySetPieceToTeam(players, oppositeTeam, defendLayout)` to reposition the OTHER team into the corresponding `_Defend` layout.
- Move the taker from their layout slot to the actual ball position (so they're standing on the ball, not at slot).

Countdown values:
- `throw_in`: 1.5s — quick restart
- `goal_kick`: 1s (matches existing usage after saves)
- `corner`: 2s — defenders need time to set up the box

---

## SetPieceType enum extension

```ts
// types.ts
export type SetPieceType = 'kickoff' | 'offside_fk' | 'goal_kick' | 'throw_in' | 'corner';
```

The countdown drain and "taker cannot carry" gates already key off the *presence* of `setPiece`, not the specific type, so adding new variants is mechanically safe. No other consumer needs a switch update unless we want type-specific behaviour later (e.g. "throw-in cannot directly score").

---

## Code changes

### 1. `src/GameEngine/types.ts`
- Extend `SetPieceType` to include `'throw_in' | 'corner'`.

### 2. `src/GameEngine/Domain/gameState.ts` — `handleLooseBall` OOB branch
Replace the current possession-transfer stub with three cases:

```ts
if (x < 0 || x > PITCH_LENGTH || y < 0 || y > PITCH_WIDTH) {
  const passer       = s.players.find(p => p.id === lb.fromPasserId);
  const lastTouchTm  = lb.fromTeamLastTouch;
  const awardedTeam  = lastTouchTm === 'A' ? 'B' : 'A';
  const oppositeTeam = lastTouchTm;

  // Classify boundary
  let kind: 'throw_in' | 'goal_kick' | 'corner';
  if (y < 0 || y > PITCH_WIDTH) {
    kind = 'throw_in';
  } else {
    const overAttackingGoal =
      (passer!.attackDir === 1 && x > PITCH_LENGTH) ||
      (passer!.attackDir === -1 && x < 0);
    kind = overAttackingGoal ? 'goal_kick' : 'corner';
  }

  // Resolve restart position, taker, layouts → call resolveOOBSetPiece(...)
  return resolveOOBSetPiece(s, kind, awardedTeam, x, y, lb.fromPasserId);
}
```

Extract `resolveOOBSetPiece(state, kind, awardedTeam, exitX, exitY, fromPasserId)` as a new helper:

```ts
function resolveOOBSetPiece(
  s: GameState,
  kind: 'throw_in' | 'goal_kick' | 'corner',
  awardedTeam: TeamId,
  exitX: number,
  exitY: number,
  fromPasserId: number,
): TickResult {
  // 1. Compute restart position (clamped, snapped to corner/six-yard/touchline)
  const position = computeOOBRestartPosition(kind, exitX, exitY, awardedTeam, s);

  // 2. Pick taker (GK for goal_kick, nearest winger for corner, nearest player for throw_in)
  const taker = pickOOBTaker(kind, awardedTeam, position, s.players);

  // 3. Apply layouts (awarded team into _Attack; opposite team into _Defend)
  const fmtA = s.formationA; const fmtB = s.formationB;
  const awFmt = awardedTeam === 'A' ? fmtA : fmtB;
  const opFmt = awardedTeam === 'A' ? fmtB : fmtA;
  const aLayouts = getFormationSetPieces(awFmt.id);
  const oLayouts = getFormationSetPieces(opFmt.id);
  let players = s.players;
  if (aLayouts) players = applySetPieceToTeam(players, awardedTeam, layoutFor(kind, 'attack', aLayouts));
  if (oLayouts) players = applySetPieceToTeam(players, awardedTeam === 'A' ? 'B' : 'A', layoutFor(kind, 'defend', oLayouts));

  // 4. Move the taker to the actual ball position
  players = players.map(p => p.id === taker.id ? { ...p, x: position.x, y: position.y, targetPosition: position } : p);

  // 5. Emit existing throughBall stat events for accountability
  gameBus.emit('throughBallLostInRace', { player: fromPasserId, defenderWinnerId: taker.id });
  debugLog('throughBall', `Ball OOB at (${exitX.toFixed(1)}, ${exitY.toFixed(1)}) → ${kind} for team ${awardedTeam}`, {
    playerId: taker.id, data: { fromId: fromPasserId, kind },
  });

  // 6. Set state — possession transfer + setPiece freeze
  const prevHolderId = s.ballHolderId;
  return {
    state: onPossessionTransfer({
      ...s,
      players,
      looseBall:    null,
      ballHolderId: taker.id,
      possessionTime: 0,
      lastPasserId: null,
      setPiece: { type: kind, takerId: taker.id, countdown: countdownFor(kind), position },
    }, prevHolderId),
    passCompleted: false, tackled: false, goalScored: null,
  };
}
```

Helpers (small, all in `gameState.ts`):

```ts
function layoutFor(kind, side, layouts: FormationSetPieces): SetPieceLayout {
  if (kind === 'throw_in')  return side === 'attack' ? layouts.throwIn_Attack  : layouts.throwIn_Defend;
  if (kind === 'corner')    return side === 'attack' ? layouts.corner_Attack   : layouts.corner_Defend;
  return layouts.goalKick; // goal_kick has no _Defend layout — opposite team uses kickOffDefend or stays put
}

function countdownFor(kind): number {
  if (kind === 'throw_in')  return 1.5;
  if (kind === 'corner')    return 2;
  return 1; // goal_kick
}

function computeOOBRestartPosition(kind, exitX, exitY, awardedTeam, s): { x: number; y: number } {
  // throw_in: clamp x, snap y to nearest touchline
  if (kind === 'throw_in') {
    const x = Math.max(0, Math.min(PITCH_LENGTH, exitX));
    const y = exitY < 0 ? 0 : PITCH_WIDTH;
    return { x, y };
  }
  // corner: snap to corner flag of the line crossed
  if (kind === 'corner') {
    const x = exitX < 0 ? 0 : PITCH_LENGTH;
    const y = exitY < PITCH_WIDTH / 2 ? 0 : PITCH_WIDTH;
    return { x, y };
  }
  // goal_kick: six-yard box edge of the awarded team
  // Attack direction of awarded team determines own goal line.
  const someAwardedPlayer = s.players.find(p => p.team === awardedTeam);
  const attackDir = someAwardedPlayer?.attackDir ?? 1;
  const ownGoalX  = attackDir === 1 ? 0 : PITCH_LENGTH;
  const x = ownGoalX === 0 ? 6 : PITCH_LENGTH - 6;
  return { x, y: 37 };
}

function pickOOBTaker(kind, awardedTeam, position, players: GamePlayer[]): GamePlayer {
  const team = players.filter(p => p.team === awardedTeam);
  if (kind === 'goal_kick') {
    return team.find(p => p.role === 'GK') ?? nearestTo(team, position);
  }
  if (kind === 'corner') {
    // Prefer winger on the side of the corner
    const isLeftSide = position.y === 0;
    const preferred  = isLeftSide ? ['LW', 'LM', 'LWB', 'LB'] : ['RW', 'RM', 'RWB', 'RB'];
    for (const role of preferred) {
      const found = team.find(p => p.role === role);
      if (found) return found;
    }
    return nearestTo(team, position);
  }
  // throw_in: nearest field player to the throw point (excluding GK)
  const outfield = team.filter(p => p.role !== 'GK');
  return nearestTo(outfield.length > 0 ? outfield : team, position);
}

function nearestTo(pool: GamePlayer[], pos: { x: number; y: number }): GamePlayer {
  return pool.reduce((best, p) => {
    const d  = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2;
    const bd = (best.x - pos.x) ** 2 + (best.y - pos.y) ** 2;
    return d < bd ? p : best;
  });
}
```

### 3. `src/GraficsEngine/PixiPitch.tsx`
Audit any `setPiece.type` switch / colour map to make sure `throw_in` and `corner` render reasonably (e.g. ball indicator at `setPiece.position`, taker marker, etc.). If the rendering keys off `setPiece` presence rather than type, no change needed.

### 4. `src/GameEngine/Infrastructure/EventBus.ts`
Optional: add a dedicated `setPieceAwarded: { type: SetPieceType; team: TeamId; reason: 'oob_throw_in' | 'oob_goal_kick' | 'oob_corner' }` event for telemetry / `/lab` aggregation. Defer until we want set-piece counts in stats.

### 5. `src/GameEngine/Domain/Statistics.ts`
Optional: track per-team `throwInsWon`, `cornersWon`, `goalKicksConceded` if useful for `/lab`. Defer.

### 6. Documentation
- `.claude/rules/game-engine/through-ball.md` — update OOB section to point to this doc.
- `.claude/rules/project-structure.md` — update `SetPieceType` entry.

---

## Sequencing

Do this in three steps so each one is independently verifiable:

### Step 1 — Wire `goal_kick` for OOB (no enum change yet)
- Replace the OOB stub in `handleLooseBall` to call `applySetPieceToTeam` with `goalKick` layout when the ball crosses any goal line.
- Use the existing `goal_kick` SetPieceType.
- Touchline OOB still uses the simple stub.
- Verify in `/test`: drift a through ball over the byline; confirm GK ends up on the six-yard line and play resumes after countdown.

### Step 2 — Add `throw_in` type and wire it
- Extend `SetPieceType`.
- Wire `handleLooseBall` touchline branch to apply `throwIn_Attack` / `throwIn_Defend` layouts and pick the nearest field player.
- Verify in `/test`.

### Step 3 — Add `corner` type and wire it
- Extend `SetPieceType` (already done in step 2 if combined).
- Wire `handleLooseBall` for the rare "ball over passer's own goal line" branch.
- Verify in `/test` with a scripted scenario (give the holder a backward through ball).

Each step is a small commit. Total scope: ~150 lines of helper code + 1 type-enum addition.

---

## Acceptance criteria

- A through ball drifting over the touchline puts the receiving team in `throwIn_Attack` layout, places the ball at the touchline at the exit x, the closest field player becomes the taker, and play freezes for ~1.5s before resuming.
- A through ball drifting over the defending GK's goal line puts the GK on the six-yard line with the `goalKick` layout, freezes for 1s, then the GK plays out.
- A backward-played through ball (or any drift over the passer's own goal line) awards a corner — winger from the opposite team teleports to the corner flag on the correct side, opposite team sets up `corner_Defend`, freeze 2s.
- During the freeze, the taker can pass but not carry (existing rule, already enforced).
- The ball never sits "outside the pitch" — drift is always converted to a set piece on the next tick after the boundary cross.
- Ball state on the rendered pitch matches the taker's slot during the freeze.

---

## Out of scope (future)

- **Quick throw-ins / quick corners** — taker plays before the layout fully settles. Defer until set pieces are stable.
- **Aerial corner deliveries / heading mechanics** — currently the engine has no aerial pass model. Corners will be played as ground passes via the normal pass system.
- **Throw-in distance limit** — real throws are short. Could be modelled later as a temporary `MAX_PASS_DISTANCE` cap during the throw-in countdown.
- **Defensive wall on free kicks** — already a separate feature (`offside_fk` / `freeKick_*`) and out of scope here.
