---
description: Overall project structure and architecture decisions.
alwaysApply: true
---

## Meta rule
**Any structural decision (new layer, new pattern, new cross-cutting contract) is documented here
before or right after implementation.** A new module boundary or a change in how layers talk to
each other updates this file in the same session.

---

## Directory layout
```
FMProject/
├── src/
│   ├── index.ts            # Bun.serve(): page bundles + API routes (backend/routes.ts and friends)
│   ├── createPage.tsx      # Mounts a page: LanguageProvider → ScreenSizeGate → AuthGate → GameSaveProvider
│   ├── pages/<page>/       # index.html + entry.tsx per screen (dashboard, match, squad, …)
│   ├── GameEngine/         # Match engine: pure TS, no Pixi/DOM/React (see game-engine.md)
│   │   ├── Configs/        # Tunable constants per system (pass, carry, defense, aerial, fouls, …)
│   │   ├── Domain/         # gameState (tick), DecisionTree, positioning, outcomes callers, SimulateMatch, Statistics
│   │   ├── Infrastructure/ # EventBus, ActionOutcomes (dice rolls), CrowdGrid, PenaltyShootout
│   │   └── Support/        # DebugLog, DebugSubscriber, TestCases (/test scenarios)
│   ├── GraficsEngine/      # Pixi rendering of a GameState (PixiPitch drives the match clock)
│   ├── GameInterface/      # React screens and components; ui/ is the standard kit
│   ├── Domain/             # Pure game rules outside the match: season, finance, contracts, cups,
│   │                       #   continental, injuries, youth, stats, plus shared helpers
│   │                       #   (dates, math, money, rng, roles, attributes, color)
│   ├── backend/            # Server: routes, SaveService + DAL (dal/), advanceDay, auth/, *World I/O
│   ├── types/              # Shared data types (players, calendar, inbox, tactics, …)
│   ├── lab/                # /lab, /test, /simulate, /matrix, /promo (separate server: lab/server.ts)
│   ├── mcp/                # fmproject-engine MCP server (queries over debug snapshots)
│   ├── i18n/               # i18next setup + locales/{en,pt-BR}.json
│   ├── example_data/       # Committed world (squads, leagues, logos, start kits) — source of truth
│   └── Data/               # Runtime copy of example_data + saves (gitignored)
├── scripts/                # Importers, calibration, smoke runs, audits (see scripts/README.md)
├── data_process/           # Inputs for the world importers (native, open-football, ESPN)
├── docs/                   # ROADMAP.md, specs, plans (docs/superpowers/archive = finished plans)
└── .claude/rules/          # Scoped rules — keep them current
```

---

## Layer rules
| Layer | May import | Never imports |
|---|---|---|
| `types` | other `types` | anything else |
| `Domain` | `types`, `Domain`, `GameEngine` (simulation entry points), `Data` JSON | `GameInterface`, `GraficsEngine`, `backend`, React |
| `GameEngine` | `types`, `Domain` (pure helpers: fitness, injury, math…), `Data` JSON | `GameInterface`, `GraficsEngine`, `backend`, React, Pixi |
| `GraficsEngine` | `GameEngine`, `Domain`, `types` | `GameInterface`, `backend` |
| `backend` | `Domain`, `GameEngine`, `types` | `GameInterface`, `GraficsEngine` |
| `GameInterface` | `Domain`, `GameEngine`, `GraficsEngine`, `types`; `backend` only as `import type` (API shapes such as `SaveMeta`) | runtime code from `backend` (a pure helper the client needs lives in `Domain`) |

- Shared pure helpers have one home: `@/Domain/dates`, `math` (clamp), `money` (labels), `rng`
  (mulberry32, seedFrom, shuffle), `roles` (MainRole), `attributes`, `color`.
- Imports always use `@/` (see `frontend.md`).

---

## Cross-layer communication: EventBus
All engine → UI/statistics communication goes through `GameEngine/Infrastructure/EventBus.ts`
(`gameBus`). No callbacks are passed into `GraficsEngine` components.

- The engine emits (`gameBus.emit("goalScored", …)`); `Statistics.ts`, `PlayerRating.ts`, the
  match screens and the debug panels subscribe.
- `GameEvents` in `EventBus.ts` is the list of events and payloads; keep it the only source.
- Adding an event: add it to `GameEvents`, emit it where it happens, subscribe where needed. If it
  is a statistic, wire it in `Statistics.ts` so `/test`, the live match and `/lab` all see it
  (see `CLAUDE.md`).

---

## Engine debug log
Engine debug output goes through `GameEngine/Support/DebugLog.ts` (`debugLog(category, message,
meta?)`), a no-op unless debug mode is on (`setDebugMode`). Never `console.log` game events.
`DebugCategory` lists the categories; `GameInterface/DebugPanel.tsx` (`CATEGORY_COLOR`) colours them.
Adding a category: extend `DebugCategory`, add its colour, call `debugLog` at the engine point.

Server-side logs use `@/Logger`: `logDebug(namespace, …)` (only for namespaces in
`config.debugNamespaces`), `logSeason`, `logError`.

---

## UI replaceability contract
Shared components stay dumb (props in, render out); the `gameBus` subscriptions live in the match
screens (see `frontend.md`). Replacing React means re-subscribing those screens to `gameBus`;
`GameEngine` and `GraficsEngine` are untouched.
