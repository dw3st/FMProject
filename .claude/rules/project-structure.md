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
│   │                       #   daySeats.ts (one DaySeat per human seat in the day), seats.ts (addSeat, removeSeat)
│   │                       #   worlds/ (friends' league: lobby/running, invite codes, join/leave routes)
│   │                       #   rivals/ (friends' results feed, live scores, taunts)
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
`DebugCategory` lists the categories; `GameInterface/DebugPanel.tsx` (`CATEGORY_CLASS`) colours them.
Adding a category: extend `DebugCategory`, add its colour, call `debugLog` at the engine point.

Server-side logs use `@/Logger`: `logDebug(namespace, …)` (only for namespaces in
`config.debugNamespaces`), `logSeason`, `logError`.

---

## UI replaceability contract
Shared components stay dumb (props in, render out); the `gameBus` subscriptions live in the match
screens (see `frontend.md`). Replacing React means re-subscribing those screens to `gameBus`;
`GameEngine` and `GraficsEngine` are untouched.

---

## Realtime: WebSocket `/api/ws` (Etapa 44, 4.24)
The only server → browser push channel. `Bun.serve` in `src/index.ts` upgrades `/api/ws` in `fetch` (the fallback
for paths no route matched) and hands the socket to `handleSocialUpgrade` (`src/backend/social/realtime.ts`). Auth is the
session cookie at the upgrade; the payloads are typed in `src/types/socialTypes.ts` (`ClientEvent`, `ServerEvent`) and
carry nicknames, never user ids. Writes stay HTTP; the socket only delivers. Connections live in memory per process.
A new push feature adds a `ServerEvent` member there instead of opening another socket. See `.claude/rules/social.md`.
Multiplayer part 6 (rivals) adds `live_score` (client → server) and `world_results` / `friend_live` (server → client);
the live match opens its own socket (`src/GameInterface/World/useLiveRivals.ts`). Live scores live in memory
(`src/backend/rivals/liveScores.ts`).

## Save version (#155, 4.22)
`SaveMeta.gameVersion` is written by `createSave` from `GAME_VERSION` (`@/Domain/saveVersion`, read
from `package.json`). `MIN_COMPATIBLE_SAVE_VERSION` in the same file is the oldest version whose saves
still load: **raise it in the same branch whenever the save format changes**. `GET /api/saves` adds
`compatible` (`saveCompatibility`: absent or older = outdated); the start screen shows `vX.Y` on every
save, a warning line on an outdated one and asks before loading it. No migration (prototype).

## Seats (multiplayer part 1, Etapa 43)
A save is a world with N human seats: the world meta (`saves/{id}.json`) plus one folder per seat
(`saves/{id}/seats/{seatId}/`: `seat.json`, tactics, achievements, scouting, inbox, ledger, market). Every manager
route acts on the caller's seat (`requireSeat`); world routes answer any member (`save_members` in SQLite). The
format changed without a new version: saves from before have no members and leave the list. See
`.claude/rules/game/multiplayer.md`.

## Group advance (multiplayer part 3)
In a `running` multi world only `src/backend/groupAdvance.ts` advances the day (in the background, one run per world, a deadline clock started by `startWorldClock()` in `src/index.ts`); `/advance-day` and `/advance-until` answer 409 `groupAdvance`. Pure rules in `src/Domain/groupAdvance/`, routes in `src/backend/groupAdvanceRoutes.ts`, push as the `world_progress` `ServerEvent`. See `.claude/rules/game/multiplayer.md`.
