# Dev auto login

`GET /api/auth/dev-login` (`src/backend/auth/routes.ts`) skips the email-code flow during local
development. It behaves as 404 unless **all** of these hold:

- `DEV_AUTO_LOGIN=1` (exactly `"1"` — `"true"`, `"0"`, etc. all refuse)
- `NODE_ENV === "development"` (fails closed — unset, `"test"`, or anything else refuses, not
  just `"production"`)
- the request's `Host` resolves to `localhost`, `127.0.0.1` or `[::1]`
- **and** the socket the request actually arrived on is loopback
  (`server.requestIP(req)?.address` ∈ `{"127.0.0.1", "::1", "::ffff:127.0.0.1"}`)

The socket check exists because the `Host` header is just a string the client sends — it proves
nothing on its own. Checking the real socket address is what makes the route inert in Docker or
behind a reverse proxy, even if something forwards a `Host: localhost` header.

`AuthService.devAutoLogin` also refuses to run (throws) when `NODE_ENV === "production"`, as a
second, independent guard in case the route's own gate is ever changed or bypassed.

When allowed, it finds-or-creates the `dev@localhost` user, opens a session the same way
`verifyLoginCode` does, sets the same session cookie (`fs_session`), and redirects (302) to
`/start`.

## Usage

```bash
DEV_AUTO_LOGIN=1 bun run dev
```

**Windows: start it from the real path casing, `C:\Projects\FMProject`.** Starting `bun run dev`
from `C:\projects\fmproject` makes Bun's HMR register modules under two casings, and every page
fails with "Failed to load bundled module … bug in Bun's bundler". From PowerShell:

```powershell
$env:DEV_AUTO_LOGIN = "1"; Start-Process bun -ArgumentList "run","dev" -WorkingDirectory "C:\Projects\FMProject"
```

`bun run dev` sets `NODE_ENV=development` for you (see `package.json`). Then open
`http://localhost:3000/api/auth/dev-login` in the browser — it logs you in and redirects to
`/start`. If you start the server another way, set `NODE_ENV=development` explicitly.

## Notes

- Inert in production (`NODE_ENV=production` — or anything but `development`) and inert in Docker
  or behind a proxy, because the deploy's socket address is never loopback there.
- It's a plain `GET` with no CSRF token. That's acceptable only because the route is unreachable
  except from a process running on your own machine — it grants a session to whoever loads that
  URL, so never make it reachable from anywhere else.

## Match screen under the dev server (issue #4) — fixed

`/match` (and any other screen mounting `PixiPitch`) used to throw
`TypeError: Cannot read properties of undefined (reading 'add')` while loading
`pixi.js/lib/index.mjs`, but **only** under `bun run dev`/`bun --hot` — production
(`bun run start`, `NODE_ENV=production`) was never affected.

**Root cause:** `bun-plugin-tailwind` declares a loose peer dependency (`"bun": ">=1.0.0"`), and
`bun install` had pinned an actual `bun` npm package in `bun.lock` to satisfy it — this is Bun's
own official npm distribution (the same binary as the CLI, published as a package so JS tooling can
depend on it), installed under `node_modules/bun` with a `node_modules/.bin/bun.exe` shim. Because
`bun run <script>` prepends `node_modules/.bin` to `PATH`, every bare `bun` inside a `package.json`
script (`"dev": "... bun --hot src/index.ts"`) resolves to **that pinned copy**, not whatever `bun`
is installed globally — even if the global one is newer. The pinned copy had drifted to `1.3.10`
while the global install on this machine had moved on to `1.4.2`.

Bun 1.3.10's dev/HMR module bundler has a module-execution-order bug with pixi.js's
`node_modules/pixi.js/lib/extensions/index.mjs`: by the time `pixi.js/lib/index.mjs`'s top-level
`extensions.add(browserExt, webworkerExt)` runs, `extensions` (the import of that submodule) is
still `undefined` — hence "Cannot read properties of undefined (reading 'add')". This only shows up
through the `--hot` dev bundler's module registry (each `.mjs` submodule of pixi.js is wrapped as
its own lazily-executed entry in a big module-id → loader map); a plain `bun -e "import('pixi.js')"`
or the production bundle (no HMR wrapper) never hits it. Confirmed via a headless-Chrome + CDP
repro (`Runtime.exceptionThrown` on `/test` and `/match`) that `bun@1.3.10` throws every time and
`bun@1.4.2` never does, with the pitch actually rendering and the match simulating normally.

**Fix:** `bun update bun` (run once, from any newer Bun) bumped the pinned copy in `bun.lock` from
`1.3.10` to `1.4.2` — no source change needed. Re-run this (or `bun install` after bumping the
global Bun) if `bun.lock`'s `bun` entry ever drifts stale again; check with
`node_modules/.bin/bun.exe --version` vs your global `bun --version`. Verified in both modes after
the bump: `bun run dev` (`/test` on the lab server and `/match` on the main server, via a
dev-login + `localStorage` session) renders the pitch and simulates with no console errors; `bun
run start` still serves `/match`'s bundle unchanged (production was never on the buggy path).

**Docker follow-up:** `Dockerfile` was pinned from `oven/bun:1-alpine` to `oven/bun:1.4-alpine`, for
the same reason as the `bun.lock` bump above — the lockfile now carries `1.4.2` entries, and
`bun install --frozen-lockfile` on an older `1.x` image can fail (or silently resolve the pinned
`bun` npm package differently) against a lockfile generated by a newer Bun. The floating `1-alpine`
tag isn't safe to rely on once the lockfile has moved past whatever `1.x` patch that tag happens to
resolve to on a given build day.
