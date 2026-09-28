# Tester Reports

A lightweight in-game "Report" button for a small allowlist of testers — bug / improvement /
tweak, one line of context, no ticketing system. Not visible to regular players.

## What it is

- **Front end:** `src/GameInterface/Components/TopNavigation.tsx` shows a "Report" nav item
  right after "Stats", only when the signed-in user is a tester. Clicking it opens
  `src/GameInterface/Components/ReportModal.tsx` (built on the shared `Modal` — Esc/backdrop
  close, focus trap, `DialogTitle` for the accessible name): a type toggle (Bug / Improvement /
  Tweak, `aria-pressed`), a required 5–2000 character description, Cancel/Send. On success it
  shows a short confirmation and auto-closes; on error it shows a message mapped from the response
  status (400/403/413/429 each have their own translated copy; anything else falls back to the
  server's raw text or a generic message) — see `error400`/`error403`/`error413`/`error429`/
  `errorGeneric` under `reports.*` in both locale files.
- **Back end:** `POST /api/reports` (`src/backend/reports.ts`) — auth required, tester required
  (403), `Content-Type: application/json` required (415), body capped at 16 KB (413, checked both
  from `Content-Length` and the actual decoded byte length), strict field validation (400), a
  per-user rate limit (429), and one JSON line appended to `reports.jsonl`. The response carries
  the new report's `id`, used by the front end to attach a screenshot in a follow-up request (see
  "Screenshot attachment" below).
- **Tester check:** `src/backend/auth/testers.ts` — `isTesterEmail(email)` reads the
  `REPORT_TESTERS` env var (comma-separated emails, case-insensitive, trimmed) at call time, so it
  can change without a restart-sensitive cache. `GET /api/auth/me` includes `isTester` in its
  response. `src/GameInterface/AuthGate.tsx` stores the fetched user in a small context
  (`useCurrentUser()`) so `TopNavigation` reads `isTester` from there instead of firing a second
  `/api/auth/me` request of its own.

## Env var

```bash
REPORT_TESTERS=dev@localhost,someone@example.com
```

Not set → nobody is a tester (`isTesterEmail` always false, the Report button never renders, and
`POST /api/reports` always 403s).

**Deploy note:** in the Docker deploy, env vars come from `docker-compose.yml`'s `env_file: .env`
on the server — `REPORT_TESTERS` must be added to that server-side `.env` (next to
`RESEND_API_KEY` etc.) or the feature is silently off for everyone, with no error anywhere. After
adding/changing it, `docker compose up -d --force-recreate` (no rebuild needed — it's just an env
var, not baked into the image).

Locally, combine with dev auto-login (`.claude/rules/dev-login.md`):

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

`saveId` and `gameDate` are `null` (not omitted) when not provided.

## Validation and limits (`src/backend/reports.ts`)

- `Content-Type` media type must be exactly `application/json` (case-insensitive; parameters such as
  `charset` allowed; `application/json` hidden inside a parameter is rejected), else **415**.
- Body capped at 16 KB: a `Content-Length` header claiming more is rejected immediately (**413**);
  the actual decoded byte length is checked too (`req.text()`, not `req.json()`, so this happens
  *before* `JSON.parse` — a client can't bypass the cap by lying about or omitting the header).
  Malformed JSON after that → **400**.
- `type`: one of `bug` | `improvement` | `tweak`.
- `description`: trimmed, 5–2000 characters.
- `page`: required, ≤ 200 characters.
- `gameDate`: optional; `null`/omitted/blank stores `null`, otherwise must match
  `/^\d{4}-\d{2}-\d{2}$/` **and** be a real calendar date (`2027-02-30`, `2027-13-01` reject) — **400** if
  not (wrong shape, impossible date, wrong type, or absurdly long all reject).
- `saveId`: optional context, not a hard requirement — a non-string value is a **400** (wrong JSON
  type), but a syntactically fine string that doesn't exist or isn't owned by the caller
  (`src/backend/auth/saveOwnership.ts` → `isSaveOwner`) is silently stored as `null` and the
  report is still accepted. The tester might be reporting from a stale tab or a save they just
  deleted — that shouldn't lose the report.
- `userAgent`: taken from the request header, capped to 300 characters (truncated, not rejected);
  `null` if the header is absent.
- Rate limit: 20 accepted reports per user per rolling hour (in-memory — resets on process
  restart), **429** past that. A rejected (invalid) submission does not consume the limit.

## Screenshot attachment (`POST /api/reports/:id/attachment`)

A report may carry **one** optional screenshot, uploaded as a **separate request after** the
report itself is accepted — this keeps the 16 KB JSON cap on `/api/reports` untouched instead of
raising it for an image. The body is the **raw image bytes**, no multipart: `Content-Type` is
`image/png` or `image/jpeg`, and the report `id` (from the `/api/reports` response) goes in the
path.

- **Front end:** `ReportModal.tsx` — an "Anexar imagem" (Attach image) button opens a hidden
  `<input type="file" accept="image/png,image/jpeg">`, and pasting (Ctrl+V) anywhere in the modal
  also attaches an image straight from the clipboard (`onPaste` on the modal's root div checks
  `clipboardData.items` for an `image/png`/`image/jpeg` file item). One image at a time — picking
  or pasting a new one replaces the current selection; a thumbnail preview (an
  `URL.createObjectURL` blob, revoked on change/unmount) shows with a small remove button.
  Client-side pre-check — type and ≤ 2 MB — lives in the pure, ReportModal-independent
  `src/GameInterface/Components/reportAttachmentValidation.ts` (`validateAttachmentFile`), tested
  on its own in `reportAttachmentValidation.test.ts`; the server re-validates everything
  independently, so this is only a fast, friendly rejection before any network round-trip. On
  submit, `POST /api/reports` goes out first as usual; only once it succeeds does the picked file
  (if any) go to `POST /api/reports/:id/attachment` with the file's own `type` as `Content-Type`.
  The report is already "sent" at that point, so an attachment failure never blocks the success
  state — it shows a small non-blocking warning instead (`reports.attachmentUploadFailed`).
- **Back end:** same route file (`src/backend/reports.ts`), same auth + tester gate as
  `/api/reports`. Order of checks: method (**405** if not POST) → auth (**401**) → tester
  (**403**) → the `id` must look exactly like a value `randomUUID()` produces, else **404** (a
  malformed id is treated as "not found" and never reaches a filesystem path) → the id must exist
  in `reports.jsonl` **and** belong to the caller's `userId`, else **404** (an unknown id and
  someone else's id are indistinguishable on purpose — the route never reveals which) → the report
  must not already have an attachment, else **409** → `Content-Type` must be exactly `image/png`
  or `image/jpeg`, else **415** → body capped at 2 MB, checked from `Content-Length` first
  (**413**) and then the actual read byte length (**413**, `req.arrayBuffer()`) → the first bytes
  must match the declared type's magic number (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`),
  else **400** (a non-image, or one format's bytes served under the other's `Content-Type`, is
  rejected here even though the header claimed otherwise) → a **separate**, small per-user hourly
  rate limit (20 uploads/hour, same window and same in-memory-resets-on-restart shape as the
  report limit, but its own counter — a retried upload after a transient failure shouldn't burn
  into the budget for filing new reports), **429** past that → written to disk, **200**.
- **Storage:** `reports.jsonl` is append-only, so the attachment is never recorded in it. Instead
  the image is saved as a standalone file at
  `${RUNTIME_DATA_DIR}/report-attachments/<id>.png` or `.jpg` (`attachmentsDir()`, exported from
  `reports.ts` for tests/scripts) — its *presence* on disk is what "this report has an attachment"
  means; nothing else tracks it. In the Docker deploy this lands at
  `persistent/report-attachments/` — inside the **same** `./persistent:/app/persistent` volume
  `docker-compose.yml` already mounts for `reports.jsonl`/`fmproject.db`/`saves/`, so **no compose
  change is needed** to ship this.

## Pulling reports

`scripts/fetchReports.ts` — newest first, with `--type`, `--since YYYY-MM-DD`, `--user
<substring>`, `--json`. Every printed field (including a malformed line's preview) has ASCII/C1
control characters and bidi override/isolate characters replaced with `\uFFFD` first — untrusted
report text should never be able to spoof terminal output (`\r` overwrite, ANSI escapes, a
right-to-left override flipping how a line reads) or corrupt `--json`'s output.

A report with a screenshot is flagged inline — `[imagem anexada: <id>.png]` under its description
(and an `"attachment": "<id>.png" | null` field in `--json` output). The attachment directory is
listed alongside `reports.jsonl` (over SSH by default, or the `report-attachments` sibling folder
of a `--local` file) and matched by filename (`<uuid>.png|jpg` — anything else found in that
directory is ignored and never used to build a path). `--download-attachments <dir>` copies the
attachment of every report currently being shown (after `--type`/`--since`/`--user` filters) into
`<dir>`, fetched byte-for-byte over `ssh VMHOME "cat ...report-attachments/<file>"` (or copied
directly from the local sibling folder with `--local`) — the filename is validated against that
same `<uuid>.png|jpg` shape before it's ever interpolated into the remote command or a local path.

```bash
# from the homelab (ssh VMHOME, see the user's homelab-deploy memory note)
bun scripts/fetchReports.ts
bun scripts/fetchReports.ts --type bug --since 2026-09-01
bun scripts/fetchReports.ts --download-attachments ./downloaded-attachments

# from a local file (a downloaded copy, or a fixture)
bun scripts/fetchReports.ts --local path/to/reports.jsonl
```

Without `--local` it runs `ssh VMHOME "cat /opt/docker/projects/fmproject/persistent/reports.jsonl"`
for the JSONL file and `ssh VMHOME "ls -1 .../persistent/report-attachments"` for the attachment
listing (a directory that doesn't exist yet — no report has ever had an attachment — is treated as
empty, not an error). Malformed lines are skipped with a warning to stderr rather than aborting the
whole read.

## Test isolation

`bunfig.toml`'s `[test] preload = ["./scripts/testPreload.ts"]` sets `RUNTIME_DATA_DIR` to a
fresh, disposable temp directory **before any test file (or anything it imports) loads** — see
the comment in `scripts/testPreload.ts` for the full mechanism. This is why
`src/backend/reports.test.ts`, `src/backend/auth/devLogin.test.ts` and
`src/backend/auth/meRoute.test.ts` can just statically import the auth/db modules like any other
test file: nothing needs its own per-file temp dir or env-var juggling.

Before this preload existed, both `devLogin.test.ts` and `reports.test.ts` set their own temp
`RUNTIME_DATA_DIR` in `beforeAll` — which mostly worked in isolation but silently broke under
`bun test`'s full run, because `src/backend/advanceUntil.ts` statically imports
`requireSaveOwner` from `@/backend/auth/middleware`. Loading `advanceUntil.test.ts` was therefore
enough to import the whole auth/db chain — with `RUNTIME_DATA_DIR` unset — before either file's
own `beforeAll` got a chance to override it, freezing the module-level db singleton onto the real
`src/Data` for the rest of the process. Reports and sessions from test runs ended up in the
developer's actual local `src/Data/fmproject.db` / `reports.jsonl`. The preload fixes this at the
root instead of working around it per file.

Verified: `bun test` (run repeatedly) leaves `src/Data/fmproject.db` and `src/Data/reports.jsonl`
byte-for-byte and mtime-unchanged, whether or not those files exist beforehand.

## Tests

`bun test src/backend/reports.test.ts src/backend/auth/testers.test.ts src/backend/auth/meRoute.test.ts`
— validation (type, description bounds, page, `gameDate` shape), the tester gate (401
unauthenticated, 403 non-tester), `Content-Type`/body-size gates (415/413), the rate limit,
`saveId` behavior (owned/unowned/nonexistent/wrong-type), the exact append format (including a
description with embedded newlines and control characters staying one JSONL line and round-
tripping exactly), `userAgent` capping, and `/api/auth/me`'s `isTester` field. The same file also
covers `/api/reports/:id/attachment`: auth/tester gates, method gate, a garbage-shaped id and an
unknown id both landing on 404, a report id owned by someone else also 404 (never distinguished
from unknown), the already-attached 409, the content-type 415, the two 413s (declared
`Content-Length` and actual body), the magic-byte-mismatch 400 (including a PNG served under
`image/jpeg`), a successful PNG and a successful JPEG upload each landing under `attachmentsDir()`
with the right extension, and its own, independent 429 after 20 uploads in the window (reports for
that test are seeded straight into `reports.jsonl` rather than filed through the rate-limited
`/api/reports` route, so the two limits stay decoupled in the test). The client-side pre-check
(`validateAttachmentFile` — type and 2 MB size) has its own pure unit test,
`src/GameInterface/Components/reportAttachmentValidation.test.ts`, independent of `ReportModal`.

## Triage flow

1. `bun scripts/fetchReports.ts --since <last triage date>` pulls the new reports from the homelab.
2. Each useful report becomes a GitHub issue (repo is **public**): label `tester-report` plus the type
   label (`bug`, `balanceamento`, `dados`, …). Put only the report content, page and game date —
   never the tester's e-mail or name.
3. Discard noise/duplicates. Record the triage date in the roadmap's "Bugs, correções e
   apontamentos" section when useful. See `docs/ROADMAP.md`.
