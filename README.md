# FMProject

An arcade-flavoured football management simulation. Pick a club, set your formation and tactics, manage transfers and player development across a living, multi-league world, then watch your matches play out in a custom 2D match engine — or simulate them instantly.

> Status: prototype / work in progress. Save files are not backward-compatible between versions.

## Features

- **Custom 2D match engine** — every player runs a decision tree (pass / carry / shoot / dribble / through-ball / off-ball movement) with tackles, interceptions, xG-based shooting, goalkeeper positioning, offside, and set pieces. The same engine powers both watchable and headless matches.
- **Tactics that matter** — formation, pressing style, defensive line, width, and build-up each map to real engine weights, with an evolving "tactics as team intents" system that adapts behaviour to the situation.
- **Living world** — per-league season calendars, AI-vs-AI transfer market, player development by age/role/performance, and tiered AI club finances all tick forward day by day.
- **Instant or interactive** — simulate a match headlessly in milliseconds, or play it out live with Pixi.js rendering, statistics, and per-player match ratings.
- **Pre-simulated start kits** — a new career starts in a world where the earlier-starting leagues have already played out, so it feels alive from day one.
- **Accounts** — passwordless email magic-code login with per-user save isolation.
- **Localised** — English and Brazilian Portuguese.

## Tech stack

- **Runtime / server:** [Bun](https://bun.com) (`Bun.serve` with a custom router)
- **Frontend:** React 19 + TypeScript, Tailwind CSS v4
- **Match rendering:** Pixi.js
- **Storage:** JSON save files + SQLite (`bun:sqlite`) for auth
- **i18n:** i18next

## Getting started

Clone the repository:

```bash
git clone https://github.com/dw3st/FMProject.git
cd FMProject
```

Install dependencies:

```bash
bun install
```

Provide the game data. The app reads game content — leagues, squads, logos,
formations, roles, and the pre-simulated start kits — from `src/Data/`, which is
gitignored. A committed starter snapshot lives in `src/example_data/`; copy it in
before the first run:

```bash
cp -R src/example_data src/Data
```

Most leagues (`of_*`) are generated from the open-football dataset; see
[`.claude/rules/data/openfootball-import.md`](.claude/rules/data/openfootball-import.md)
for how to regenerate them and [`data_process/openfootball/NOTICE.md`](data_process/openfootball/NOTICE.md)
for attribution and license.

The auth database (`fmproject.db`) and the dev email log are **not** part of the
snapshot — they are created automatically on first run.

Run the development server (hot reload):

```bash
bun dev
```

Run for production:

```bash
bun start
```

Build:

```bash
bun run build
```

## Configuration

Bun auto-loads a `.env` file. Copy the template and fill in what you need:

```bash
cp .env.example .env
```

With no `SMTP2GO_API_KEY` set, login-code emails fall back to a dev log (console + `src/Data/email-log.json`) — so local development needs no credentials. Set `SMTP2GO_API_KEY` and `EMAIL_FROM` to deliver real email via [SMTP2GO](https://www.smtp2go.com/) in production.

## Developer tooling

| Command | What it does |
|---|---|
| `bun dev` | Dev server with hot reload |
| `bun run build` | Production build |
| `bun run balance:formations` | Headless formation balance run |
| `bun run balance:tactics` | Headless tactics balance run |
| `bun run lab` | Balance lab — compare formations/tactics across hundreds of matches |
| `bun run mcp` | Engine-debug MCP server (inspect decisions from a saved snapshot) |
| `bun run kits:generate` | Regenerate the pre-simulated start kits |
| `bun run i18n:lint` | Find hardcoded UI strings and missing translation keys |
| `bun test` | Run the test suite |

There are also in-app debug surfaces: `/test` (engine overlays and scenario cases) and `/lab` (the balance lab UI).

## Documentation

The engine's rules and mechanics are documented in depth under
[`.claude/rules/`](.claude/rules/). These are the design source-of-truth (and
double as guidance for AI coding assistants):

- [`.claude/rules/game-engine/`](.claude/rules/game-engine/) — match-engine
  mechanics: carrying, passing, defensive positioning, off-ball movement,
  shooting & xG, interceptions, tackling, through balls, set pieces, offside,
  movement bounds, and tactical config.
- [`.claude/rules/`](.claude/rules/) — surrounding systems: transfers, player
  development, AI club finances, match flow, statistics, and player ratings.
- [`CLAUDE.md`](CLAUDE.md) — project conventions and contributor guidance.
- [`src/mcp/README.md`](src/mcp/README.md) — the engine-debug MCP server.

## Project structure

```
src/
  GameEngine/      Pure match engine — decisions, positioning, outcomes (no DOM/React)
  GraficsEngine/   Pixi.js rendering layer
  GameInterface/   React UI screens and components
  backend/         Bun server: routes, saves, transfers, auth
  Domain/          Game-domain logic (players, transfers, development, calendar)
  Data/            Local game data and saves (gitignored)
  i18n/            Translations (en, pt-BR)
  lab/             Balance lab
  mcp/             Engine-debug MCP server
```

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

FMProject is a fork of [TouchLines](https://github.com/brenosss/touchlines) (AGPL-3.0); the
original copyright and license notices are preserved.

See the [LICENSE](LICENSE) file for details.
