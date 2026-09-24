---
name: debug
description: Diagnose engine behaviour from a captured match snapshot. Use whenever the user says "debug", "do the debug", "debug this", or asks why a player/ball did something on the pitch. Reads the latest snapshot in debug/ (state.json + pitch.png) and answers using the fmproject-engine MCP — never a hand-rolled replay script.
---

# Engine Debug from a Snapshot

When the user asks you to "debug" a situation, they have just clicked the **Debug**
button on the `/test` screen. That captured the live match state. Your job is to
load that capture, look at the rendered pitch, and explain the engine's behaviour
using the **`fmproject-engine` MCP** — not by reading or replaying engine code.

## Snapshot layout

Each Debug click writes one folder:

```
debug/{ISO-timestamp}/
  state.json   ← full snapshot (rawState = a complete GameState) — feed this path to the MCP
  pitch.png    ← PNG of exactly what Pixi rendered, including any active debug overlays
```

Folder names are ISO timestamps, so they sort chronologically. The **latest** is:

```bash
ls -1d debug/*/ | sort | tail -1
```

(Older snapshots may exist as legacy flat files `debug/{timestamp}.json` with no
image — only relevant if the user explicitly asks about an old one.)

## Workflow

1. **Find the snapshot.** Default to the newest folder (command above). If the user
   names a specific timestamp, use that folder instead.
2. **Look at the pitch.** `Read` the `pitch.png` — it is a real image and you can see
   it. Use it to orient yourself: who has the ball, where the shape is, which player
   the user is probably asking about. This is the fastest way to ground the question.
3. **Confirm the question.** Translate the user's ask into a specific player + behaviour
   ("why did Okeke step off Rossi?", "why this pass?", "is the GK positioned right?").
4. **Query the MCP.** Pass `debug/{timestamp}/state.json` as `snapshotPath`. Always call
   `summary` first to get player IDs, then the matching tool. Do **not** write a replay
   script unless the MCP genuinely cannot answer.
5. **Answer.** State what the engine chose and why, citing the MCP's score breakdown.
   Compare `storedScores` (what actually happened at capture) vs the fresh re-run
   (what the engine would choose now).

## MCP tool map

Always `summary(snapshotPath)` first. Then:

| Question | Tool |
|---|---|
| Match time / score / ball holder / roster (ids, roles, x/y) | `summary` |
| Why did an attacking non-holder move there? | `score_off_ball` |
| Why did a defender hold/mark/press/step? | `score_defensive_intent` |
| Which pass options exist and their scores? | `evaluate_all_passes` |
| Score one specific pass holder→receiver | `score_pass` |
| Why this carry direction? | `evaluate_carry` |
| Why this through ball / where does it target? | `evaluate_through_ball` |
| xG breakdown for a shot (supports hypothetical `fromX/fromY`) | `evaluate_shot` |
| Is the GK on its optimal arc? | `gk_position_quality` |
| Each defender's interception corridor | `interception_corridors` |

## Caveats (important — see `.claude/rules/game-engine/mcp-debug.md` for the full list)

- **Team intent is hardcoded to `balanced`** in the MCP. If `rawState.teamIntent` is
  something else (e.g. `counter_attack`), the re-run scores differ — factor in the
  `IntentConfig.ts` multipliers before drawing conclusions.
- **Decision commitment is not honoured.** The snapshot's stored `decisions` /
  `storedScores` are the source of truth for *what happened*; the MCP's fresh re-run
  shows what the engine *would choose now*. They can differ — say which one you're using.
- The snapshot path is **relative to repo root** (`debug/{timestamp}/state.json`).

## Don't

- Don't write a Python/JS replay script as your first move — it drifts from engine code.
  Reach for one only when the behaviour isn't reproducible from a single snapshot
  (e.g. it emerges over many ticks, or there's no snapshot input like calendar gen).
- Don't read engine source to "simulate in your head" what a score would be — call the
  MCP, which runs the real code.
