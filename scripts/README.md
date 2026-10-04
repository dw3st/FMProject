# scripts/

Offline tools. Run with `bun scripts/<name>.ts` (each file's header comment has its options).
Scripts import app code through `@/…`; script-to-script imports use `@/../scripts/…`.

## World data

| Script | Purpose |
|---|---|
| `importOpenFootball.ts` | Builds the base world in `src/example_data` from `data_process/native` + the open-football seed (`.claude/rules/data/openfootball-import.md`) |
| `fetchEspn.ts` | Downloads the ESPN snapshot (the only step that touches the network) |
| `importEspn.ts` | Applies the ESPN snapshot on top of the base world: 2026/27 squads, pyramid, calendar, crests (`.claude/rules/data/espn-import.md`) |
| `generateStartKits.ts` | Pre-simulates the start kits (`bun run kits:generate`) |
| `generate-world-map.ts` | Regenerates the new-game world map paths (`NewGame/worldMapPaths.ts`) |
| `espn/`, `openfootball/`, `world/` | Pure modules (with tests) used by the importers |

## Smoke runs

| Script | Purpose |
|---|---|
| `season-rollover-smoke.ts` | A whole season day by day through the country rollover, with checks for every system (~15 min) |
| `membership-smoke.ts` | A club changes league inside a save |
| `bench-advance-day.ts` | Times the live `advanceOneDay` on the full world |
| `contracts-sim.ts` | Multi-season AI wage economy with contracts |
| `mcp-smoke.ts` | Runs every MCP query against a debug snapshot |
| `_bench.ts` | Per-match timing of the full engine |

## Calibration and balance

| Script | Purpose |
|---|---|
| `quicksim-calibrate.ts`, `quicksim-spread.ts`, `quicksim-crossleague.ts`, `quicksim-discipline.ts` | quickSim against the full engine (`.claude/rules/non-player-games.md`) |
| `fatigue-calibrate.ts` | Fitness drain and start-energy compression |
| `injury-calibrate.ts` | Injury rates (engine and quickSim) |
| `fouls-calibrate.ts`, `aerial-calibrate.ts`, `setpiece-calibrate.ts` | Fouls/cards, aerial play, set pieces |
| `wage-calibrate.ts` | Wage curve and club wage factor |
| `familiarity-measure.ts` | Style familiarity effect |
| `width-measure.ts` | Attacking width axis |
| `passing-mix-diagnostic.ts`, `byline-diagnostic.ts` | Passing mix per line; goal-line runs |
| `formation-balance.ts` (+ `-worker`), `tactics-balance.ts` (+ `-worker`) | Formation / tactic pairs, one Bun Worker per pair (`bun run balance:formations`, `balance:tactics`) |
| `formation-vs-433.ts` (+ `-worker`), `formation-matrix.ts` | Each formation against 4-3-3; the full formation matrix |
| `ai-formation-world.ts`, `ai-formation-goals.ts` (+ `-shared`, `-worker`) | AI formation choice across the world and its goal volume |

## Project checks

| Script | Purpose |
|---|---|
| `ui-audit.ts` | Screens against `.claude/rules/ui-standard.md` (`bun run ui:audit`) |
| `find-untranslated.ts` | Hard-coded UI text and missing i18n keys (`bun run i18n:lint`) |
| `fetchReports.ts` | Pulls tester reports (`.claude/rules/tester-reports.md`) |
| `testPreload.ts` | `bun test` preload: isolates `RUNTIME_DATA_DIR` |

Simulation scripts run matches in Bun Workers when they parallelise: each Worker has its own
module registry, so the engine's `Statistics`/`PlayerRating` singletons never collide.
