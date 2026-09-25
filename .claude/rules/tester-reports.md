# Tester Reports

A lightweight in-game "Report" button for a small allowlist of testers — bug / improvement /
tweak, one line of context, no ticketing system. Not visible to regular players.

## What it is

- **Front end:** `src/GameInterface/Components/TopNavigation.tsx` shows a "Report" nav item
  right after "Stats", only when the signed-in user is a tester. Clicking it opens
  `src/GameInterface/Components/ReportModal.tsx` (built on the shared `Modal` — Esc/backdrop
  close, focus trap): a type selector (Bug / Improvement / Tweak), a required 5–2000 character
  description, Cancel/Send. On success it shows a short confirmation and auto-closes; on error it
  shows the server's message inline.
- **Back end:** `POST /api/reports` (`src/backend/reports.ts`) — auth required, tester required
  (403 otherwise), strict validation, a per-user rate limit, and one JSON line appended to
  `reports.jsonl`.
- **Tester check:** `src/backend/auth/testers.ts` — `isTesterEmail(email)` reads the
  `REPORT_TESTERS` env var (comma-separated emails, case-insensitive, trimmed) at call time, so it
  can change without a restart-sensitive cache. `GET /api/auth/me` includes `isTester` in its
  response so the front end can decide visibility from the call it already makes
  (`src/GameInterface/AuthGate.tsx` → `CurrentUser.isTester`); `TopNavigation` fetches it on mount.

## Env var

```bash
REPORT_TESTERS=dev@localhost,someone@example.com
```

Not set → nobody is a tester (`isTesterEmail` always false, the Report button never renders, and
`POST /api/reports` always 403s). Locally, combine with dev auto-login
(`.claude/rules/dev-login.md`):

```powershell
$env:DEV_AUTO_LOGIN = "1"; $env:REPORT_TESTERS = "dev@localhost"
Start-Process bun -ArgumentList "run","dev" -WorkingDirectory "C:\Projects\FMProject"
```

Then `GET /api/auth/dev-login` logs you in as `dev@localhost`, which is now a tester.

## Where the file lands

`reports.jsonl` is written under `RUNTIME_DATA_DIR` (`src/backend/runtimeDir.ts`) — the same
runtime-writable root as the auth DB and saves. Locally that's `src/Data/reports.jsonl` (gitignored,
never commit it). In the Docker deploy (`docker-compose.yml`: `RUNTIME_DATA_DIR=/app/persistent`,
volume `./persistent:/app/persistent`) it lands at `persistent/reports.jsonl` on the host, next to
`fmproject.db` and `saves/` — survives redeploys, never baked into the image.

One JSON object per line:

```json
{"id":"...","createdAt":"2026-09-25T12:00:00.000Z","userId":"...","email":"tester@example.com","type":"bug","description":"...","saveId":"...","page":"/dashboard","gameDate":"2027-03-14","userAgent":"..."}
```

`saveId` and `gameDate` are `null` (not omitted) when not provided. `saveId`, when given, must
belong to the requesting user (`src/backend/auth/saveOwnership.ts` → `isSaveOwner`) or the request
is rejected with 400.

## Validation and limits (`src/backend/reports.ts`)

- `type`: one of `bug` | `improvement` | `tweak`.
- `description`: trimmed, 5–2000 characters.
- `page`: required, ≤ 200 characters.
- `saveId`: optional; must belong to the caller.
- `gameDate`: optional, passed through as-is.
- Rate limit: 20 accepted reports per user per rolling hour (in-memory — resets on process
  restart), 429 past that. A rejected (invalid) submission does not consume the limit.

## Pulling reports

`scripts/fetchReports.ts` — newest first, with `--type`, `--since YYYY-MM-DD`, `--user
<substring>`, `--json`.

```bash
# from the homelab (ssh VMHOME, see the user's homelab-deploy memory note)
bun scripts/fetchReports.ts
bun scripts/fetchReports.ts --type bug --since 2026-09-01

# from a local file (a downloaded copy, or a fixture)
bun scripts/fetchReports.ts --local path/to/reports.jsonl
```

Without `--local` it runs `ssh VMHOME "cat /opt/docker/projects/fmproject/persistent/reports.jsonl"`.
Malformed lines are skipped with a warning to stderr rather than aborting the whole read.

## Tests

`bun test src/backend/reports.test.ts src/backend/auth/testers.test.ts` — validation, the tester
gate (401 unauthenticated, 403 non-tester), the rate limit, `saveId` ownership, and the exact
append format. Follows the same temp-`RUNTIME_DATA_DIR` isolation pattern as
`src/backend/auth/devLogin.test.ts`; every `saveId` used is randomly generated (not a fixed
literal) so a `PRIMARY KEY` collision can never happen on repeated runs even if this file ends up
sharing a real, persistent sqlite database with another test file (see the comment at the top of
`reports.test.ts` for why that can happen — a pre-existing test-isolation gap, not specific to
this feature).
