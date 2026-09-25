import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "node:crypto";

// The auth DB and the reports file both read RUNTIME_DATA_DIR at import time, so it must be
// set to an isolated temp directory before anything that transitively imports those modules
// is imported — same pattern as devLogin.test.ts. Note this only takes effect if nothing else
// in the whole test run has imported that chain first with a different RUNTIME_DATA_DIR (e.g. a
// file that statically imports "@/backend/auth/middleware" at module scope) — the db connection
// is a module-level singleton, bound to whichever directory won that race. To stay correct
// either way, every saveId used below is randomly generated rather than a fixed literal, so a
// PRIMARY KEY collision can never happen even if this file ends up sharing a real, persistent
// sqlite file with another test file across repeated `bun test` runs.
let tmpDir: string;
let reportRoutes: typeof import("@/backend/reports").reportRoutes;
let reportsFilePath: typeof import("@/backend/reports").reportsFilePath;
let resetReportRateLimit: typeof import("@/backend/reports").resetReportRateLimit;
let devAutoLogin: typeof import("@/backend/auth/AuthService").devAutoLogin;
let recordSaveOwnership: typeof import("@/backend/auth/saveOwnership").recordSaveOwnership;

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["RUNTIME_DATA_DIR", "REPORT_TESTERS", "NODE_ENV"] as const;

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  tmpDir = mkdtempSync(join(tmpdir(), "fmproject-reports-"));
  process.env.RUNTIME_DATA_DIR = tmpDir;
  ({ reportRoutes, reportsFilePath, resetReportRateLimit } = await import("@/backend/reports"));
  ({ devAutoLogin } = await import("@/backend/auth/AuthService"));
  ({ recordSaveOwnership } = await import("@/backend/auth/saveOwnership"));
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  // Deliberately does NOT close the db: bun test runs files concurrently in one process with
  // a shared module registry (no --isolate by default), so "@/backend/db" is the same singleton
  // devLogin.test.ts uses. Closing it here could break that file's still-running tests (and vice
  // versa) — the process exit at the end of the run reclaims the handle either way.
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // The sqlite file handle is still open (see above) — best-effort cleanup only.
  }
});

beforeEach(() => {
  resetReportRateLimit();
  process.env.REPORT_TESTERS = "tester@example.com";
});

afterEach(() => {
  delete process.env.REPORT_TESTERS;
});

const handler = () => reportRoutes["/api/reports"];

function sessionFor(email: string): { token: string; userId: string } {
  const { user, session } = devAutoLogin(email);
  return { token: session.token, userId: user.id };
}

function postReport(token: string | null, body: unknown): Request {
  return new Request("http://localhost:3000/api/reports", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `fs_session=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  type: "bug",
  description: "The pitch overlay flickers when I open the stats tab.",
  page: "/dashboard",
};

describe("POST /api/reports — auth gate", () => {
  test("401 with no session cookie", async () => {
    const res = await handler()(postReport(null, VALID_BODY));
    expect(res.status).toBe(401);
  });

  test("401 with a bogus session token", async () => {
    const res = await handler()(postReport("not-a-real-token", VALID_BODY));
    expect(res.status).toBe(401);
  });

  test("405 for non-POST methods", async () => {
    const { token } = sessionFor("tester@example.com");
    const req = new Request("http://localhost:3000/api/reports", {
      method: "GET",
      headers: { cookie: `fs_session=${token}` },
    });
    const res = await handler()(req);
    expect(res.status).toBe(405);
  });
});

describe("POST /api/reports — tester gate", () => {
  test("403 for an authenticated user who is not a tester", async () => {
    const { token } = sessionFor("not-a-tester@example.com");
    const res = await handler()(postReport(token, VALID_BODY));
    expect(res.status).toBe(403);
  });

  test("succeeds for a listed tester (case-insensitive)", async () => {
    process.env.REPORT_TESTERS = "Tester@Example.com";
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(postReport(token, VALID_BODY));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/reports — validation", () => {
  let token: string;
  beforeEach(() => {
    ({ token } = sessionFor("tester@example.com"));
  });

  test("rejects an invalid type", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, type: "feature" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/type/);
  });

  test("rejects a missing type", async () => {
    const { type: _drop, ...rest } = VALID_BODY;
    const res = await handler()(postReport(token, rest));
    expect(res.status).toBe(400);
  });

  test("rejects a description shorter than 5 characters", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, description: "hi" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/description/);
  });

  test("rejects a description longer than 2000 characters", async () => {
    const res = await handler()(
      postReport(token, { ...VALID_BODY, description: "x".repeat(2001) }),
    );
    expect(res.status).toBe(400);
  });

  test("accepts a description at the boundaries (5 and 2000 chars)", async () => {
    const res5 = await handler()(postReport(token, { ...VALID_BODY, description: "x".repeat(5) }));
    expect(res5.status).toBe(200);
    const res2000 = await handler()(
      postReport(token, { ...VALID_BODY, description: "x".repeat(2000) }),
    );
    expect(res2000.status).toBe(200);
  });

  test("trims description whitespace before checking length", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, description: "   hi   " }));
    expect(res.status).toBe(400);
  });

  test("rejects a missing page", async () => {
    const { page: _drop, ...rest } = VALID_BODY;
    const res = await handler()(postReport(token, rest));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/page/);
  });

  test("rejects a page longer than 200 characters", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, page: "/a".repeat(150) }));
    expect(res.status).toBe(400);
  });

  test("rejects an invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `fs_session=${token}` },
      body: "not json",
    });
    const res = await handler()(req);
    expect(res.status).toBe(400);
  });

  test("accepts an optional gameDate", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, gameDate: "2027-03-14" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/reports — saveId ownership", () => {
  test("accepts a saveId that belongs to the user", async () => {
    const { token, userId } = sessionFor("tester@example.com");
    const saveId = `save-owned-by-tester-${randomUUID()}`;
    recordSaveOwnership(saveId, userId);
    const res = await handler()(postReport(token, { ...VALID_BODY, saveId }));
    expect(res.status).toBe(200);
  });

  test("rejects a saveId owned by a different user", async () => {
    const { userId: otherUserId } = sessionFor("someone-else@example.com");
    const saveId = `save-owned-by-someone-else-${randomUUID()}`;
    recordSaveOwnership(saveId, otherUserId);
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(postReport(token, { ...VALID_BODY, saveId }));
    expect(res.status).toBe(400);
  });

  test("rejects a saveId that does not exist", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(
      postReport(token, { ...VALID_BODY, saveId: `no-such-save-${randomUUID()}` }),
    );
    expect(res.status).toBe(400);
  });

  test("saveId is optional", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(postReport(token, VALID_BODY));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/reports — rate limit", () => {
  test("429 after 20 successful reports in the window, per user", async () => {
    const { token } = sessionFor("tester@example.com");
    for (let i = 0; i < 20; i++) {
      const res = await handler()(postReport(token, VALID_BODY));
      expect(res.status).toBe(200);
    }
    const res21 = await handler()(postReport(token, VALID_BODY));
    expect(res21.status).toBe(429);
  });

  test("rate limit is per-user — a different tester is unaffected", async () => {
    const { token: tokenA } = sessionFor("tester@example.com");
    for (let i = 0; i < 20; i++) {
      await handler()(postReport(tokenA, VALID_BODY));
    }
    expect((await handler()(postReport(tokenA, VALID_BODY))).status).toBe(429);

    process.env.REPORT_TESTERS = "tester@example.com,tester2@example.com";
    const { token: tokenB } = sessionFor("tester2@example.com");
    const resB = await handler()(postReport(tokenB, VALID_BODY));
    expect(resB.status).toBe(200);
  });

  test("a rejected (invalid) submission does not consume the rate limit", async () => {
    const { token } = sessionFor("tester@example.com");
    for (let i = 0; i < 20; i++) {
      await handler()(postReport(token, { ...VALID_BODY, type: "not-a-type" }));
    }
    const res = await handler()(postReport(token, VALID_BODY));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/reports — append format", () => {
  test("appends one well-formed JSON line per report with the expected fields", async () => {
    const { token, userId } = sessionFor("tester@example.com");
    const saveId = `save-append-test-${randomUUID()}`;
    recordSaveOwnership(saveId, userId);

    const res = await handler()(
      postReport(token, {
        type: "improvement",
        description: "Add a quick filter to the scout table.",
        page: "/scout",
        saveId,
        gameDate: "2027-08-20",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");

    const contents = readFileSync(reportsFilePath(), "utf8");
    const lines = contents.trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]!);

    expect(last).toMatchObject({
      id: body.id,
      userId,
      email: "tester@example.com",
      type: "improvement",
      description: "Add a quick filter to the scout table.",
      saveId,
      page: "/scout",
      gameDate: "2027-08-20",
    });
    expect(typeof last.createdAt).toBe("string");
    expect(new Date(last.createdAt).toString()).not.toBe("Invalid Date");
  });

  test("saveId and gameDate are null (not undefined/missing) when omitted", async () => {
    const { token } = sessionFor("tester@example.com");
    await handler()(postReport(token, VALID_BODY));

    const contents = readFileSync(reportsFilePath(), "utf8");
    const lines = contents.trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]!);
    expect(last.saveId).toBeNull();
    expect(last.gameDate).toBeNull();
    expect("saveId" in last).toBe(true);
    expect("gameDate" in last).toBe(true);
  });

  test("each report is a single line — file stays valid JSONL across multiple writes", async () => {
    const { token } = sessionFor("tester@example.com");
    await handler()(postReport(token, { ...VALID_BODY, type: "bug" }));
    await handler()(postReport(token, { ...VALID_BODY, type: "tweak" }));

    const contents = readFileSync(reportsFilePath(), "utf8");
    const lines = contents.trim().split("\n");
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
