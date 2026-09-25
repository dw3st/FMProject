/**
 * bun test preload (see bunfig.toml `[test] preload`) — runs before any test file, or anything
 * it imports, loads.
 *
 * Several backend modules read `RUNTIME_DATA_DIR` (`src/backend/runtimeDir.ts`) exactly once, at
 * module-import time, into a top-level singleton: `src/backend/db.ts` opens its sqlite
 * connection there, and `src/backend/dal/FileSystemDAL.ts` derives its saves directory from it.
 * Left unset, both default to the real `src/Data` — the developer's actual local save/auth data.
 *
 * Without this preload, whichever module happens to import that chain FIRST during the whole
 * test run wins that default for every test file for the rest of the run — including test files
 * that never meant to touch it. That import can come from a file that never explicitly sets
 * RUNTIME_DATA_DIR at all: `src/backend/advanceUntil.ts` statically imports
 * `requireSaveOwner` from `@/backend/auth/middleware`, so `src/backend/advanceUntil.test.ts`
 * loading it is enough to freeze the real `src/Data` in for the rest of the process — before
 * `src/backend/auth/devLogin.test.ts` or `src/backend/reports.test.ts` (both of which used to set
 * their own temp `RUNTIME_DATA_DIR` in `beforeAll`) ever got a chance to.
 *
 * Setting it here, in a preload that bunfig.toml guarantees runs before every test file's own
 * module graph loads, removes that race entirely: every test in the run shares ONE disposable
 * temp directory, and nothing ever touches the real `src/Data`.
 *
 * Static game content (leagues, squads, roles, formations, startKits) is unaffected — those are
 * read from a separate, hardcoded `fileURLToPath(new URL("../Data", import.meta.url))` constant
 * in each module that needs them (`SaveService.ts`, `advanceDay.ts`, `routes.ts`,
 * `scoutSearch.ts`, `startKits.ts`), never from `RUNTIME_DATA_DIR`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fmproject-test-runtime-"));
process.env.RUNTIME_DATA_DIR = dir;

process.on("exit", () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort: an open sqlite handle can keep the directory locked on Windows at
    // process-exit time. It's a disposable OS temp dir either way.
  }
});
