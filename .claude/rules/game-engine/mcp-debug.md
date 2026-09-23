# Engine Debugging — Use the MCP

When you need to inspect engine values from a debug snapshot (`debug/*.json`), **use the `touchlines-engine` MCP tools** instead of writing a Python/JS replay script. The MCP runs the actual engine code against the snapshot, so you get real engine values — not an approximation that may drift from current code.

---

## When to use the MCP

- "Why did player X choose decision Y?" — re-run the relevant evaluator
- "What's the score breakdown for this pass / shot / carry?" — call the matching `evaluate_*` / `score_*` tool
- "Is the offside line / GK position / interception corridor correct?" — direct queries
- Any time the user asks about behaviour from a saved snapshot

## When NOT to use the MCP

- The behaviour isn't reproducible from a single saved snapshot (e.g. emerges over many ticks)
- You're inspecting code paths that have no snapshot input (calendar generation, save migration)
- The user's question is about static config or types — read source instead

---

## Available tools

Always call `summary` first to get player IDs.

| Tool | Use for |
|---|---|
| `summary` | Match time, score, ball holder, full player roster (id/team/role/x/y) |
| `score_off_ball` | Re-run `evaluateOffBall` for an attacking non-holder; returns chosen decision + intent breakdown |
| `score_defensive_intent` | Re-run defensive intent for a defender; hold_shape / track_mark / press_holder / step_into_carry_lane scores |
| `evaluate_all_passes` | Score every pass option from the holder; sorted, with `open` flag |
| `score_pass` | Score one specific pass holder→receiver |
| `evaluate_carry` | Score the three carry lanes for the holder |
| `evaluate_shot` | xG breakdown — distance, open angle, pressure, shooter/GK effects, final goalChance. `fromX/fromY` to test hypothetical positions |
| `gk_position_quality` | How well a GK is on the optimal angle-bisector arc |
| `interception_corridors` | Each defender's interception corridor (yards) |

---

## Known caveats

1. **Team intent is hardcoded to `balanced`** in [queries.ts](src/mcp/queries.ts) (`score_off_ball`, etc.). If the original tick ran with `counter_attack` or another intent, the re-run will produce different scores. To check: read `rawState.teamIntent` from the snapshot and compare with the multipliers in [IntentConfig.ts](src/GameEngine/Configs/IntentConfig.ts).

2. **Decision commitment is not honoured.** Snapshots store cached decisions in `rawState.decisions` from when the player committed. The MCP re-evaluates from scratch — so the MCP's reported decision can differ from `player.decision` in the snapshot. When the user reports a behaviour from gameplay, the snapshot's stored decision is the source of truth; the MCP shows what the engine *would* choose right now.

3. **Stored scores vs re-run.** The MCP returns both `decision` (fresh re-run) and `storedScores` (the `offBallScores` / `defensiveScores` event captured at the actual tick). Use `storedScores` to confirm what happened, `decision` to test what the engine *would* now do.

4. **Snapshot path** is relative to the repo root: `debug/2026-04-30T12-08-58-322Z.json` — not absolute.

---

## Workflow example

User: "Why is player X moving toward Y in this snapshot?"

1. `summary(snapshotPath)` → find X's player ID
2. `score_off_ball(snapshotPath, playerId)` → see chosen intent + score breakdown
3. Compare `storedScores` (what actually happened) vs `decision` (what fresh evaluation would do)
4. Check `rawState.teamIntent` — if not `balanced`, factor in the IntentConfig multipliers
5. If the issue is in the cell/lane scoring itself, only then reach for a replay script — and structure it to mirror the engine code in `OffBallMovement.ts` / `PassLanes.ts` / etc.

**Don't replay-script first.** Hand-rolled scripts drift from engine code, and most "why did X happen" questions are answered in one MCP call.
