---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

- Never use relative imports use @
- This is a prototype — no backward compatibility with existing save files is required. When the save format changes, old saves are simply invalid. Do not add migration code or legacy fallbacks.
- For any question about engine behaviour from a debug snapshot (`debug/*.json`), call the `touchlines-engine` MCP tools first (`summary`, `score_off_ball`, `score_defensive_intent`, `evaluate_all_passes`, `evaluate_carry`, `evaluate_shot`, etc.). Do not write a replay script unless the MCP can't answer the question. See [.claude/rules/game-engine/mcp-debug.md](.claude/rules/game-engine/mcp-debug.md) for caveats.
- **Tactics → team intents migration (long-term):** the eventual goal is for `TacticalStyle` to be a *collection of TeamIntents* — each user-facing tactic is just a bundle of conditional intents that fire based on situation, not a static config snapshot. We are migrating incrementally: each iteration adds one more behaviour into the intent system. Do NOT do a full migration in one go — extend the intent registry one intent/effect at a time, and only for the tactic currently being balanced. See [.claude/rules/game-engine/tactics-as-intents.md](.claude/rules/game-engine/tactics-as-intents.md) for the design.
- **New engine features must reach BOTH `/lab` and `/test` before they're considered shipped.** When you add a new mechanic to the engine (a new pass type, a new intent, a new outcome resolver, a new statistic, anything observable):
  1. **`/test`** — add the matching debug visualization (Pixi overlay, debug-event payload, score-breakdown panel, and a `TestCases.ts` scenario that exercises it). Without `/test` debug surfaces the feature can't be inspected, tuned, or diagnosed from a snapshot.
  2. **`/lab`** — extend `lab/types.ts` `TeamRawStats`, `lab/balanceWorker.ts` aggregation, `lab/scenarioRunner.ts` `PerMatchView` + `VariantSummary`, and at least one display component (`PairDetail`, `WinMatrix`, `SummaryBars`) so the lab can compare formations / tactics on the new metric across hundreds of matches.
  3. **`Statistics.ts`** is the bridge: every new stat field must be added there with a gameBus subscription so the same counter feeds both the live `StatsPanel` and the headless `simulateMatch` result that `/lab` aggregates.
  Adding the engine logic without these surfaces means the feature is invisible to tuning and untestable in isolation. Any PR that adds an engine mechanic should also touch the `/test` debug overlay and the `/lab` results path.