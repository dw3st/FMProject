import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { randomUUID } from "node:crypto";
import {
  attachmentsDir,
  reportRoutes,
  reportsFilePath,
  resetReportRateLimit,
} from "@/backend/reports";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

// RUNTIME_DATA_DIR is isolated to a disposable temp dir for the whole test run by the
// `[test] preload` in bunfig.toml (scripts/testPreload.ts), which runs before this file (or
// anything it imports, like the auth DB or reports.jsonl) loads — so plain static imports are
// enough here, and every test in the suite shares one fresh temp dir for the run. Every saveId
// used below is still randomly generated rather than a fixed literal, defensively: it costs
// nothing and protects against `--rerun-each` or test retries reusing the same run's temp dir.

beforeEach(() => {
  resetReportRateLimit();
  process.env.REPORT_TESTERS = "tester@example.com";
});

afterEach(() => {
  delete process.env.REPORT_TESTERS;
});

const handler = () => reportRoutes["/api/reports"];
const attachmentHandler = () => reportRoutes["/api/reports/:id/attachment"];

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

function pngBytes(extra = 16): Uint8Array {
  const bytes = new Uint8Array(PNG_MAGIC.length + extra);
  bytes.set(PNG_MAGIC);
  return bytes;
}

function jpegBytes(extra = 16): Uint8Array {
  const bytes = new Uint8Array(JPEG_MAGIC.length + extra);
  bytes.set(JPEG_MAGIC);
  return bytes;
}

function postAttachment(
  token: string | null,
  id: string,
  bytes: Uint8Array,
  contentType = "image/png",
): Request & { params: Record<string, string> } {
  const req = new Request(`http://localhost:3000/api/reports/${id}/attachment`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      ...(token ? { cookie: `fs_session=${token}` } : {}),
    },
    body: bytes as BodyInit,
  }) as Request & { params: Record<string, string> };
  req.params = { id };
  return req;
}

/** Files a valid report and returns its id. */
async function fileReport(token: string): Promise<string> {
  const res = await handler()(postReport(token, VALID_BODY));
  const body = (await res.json()) as { id: string };
  return body.id;
}

/**
 * Appends a report line directly to reports.jsonl, bypassing the `/api/reports` route (and so
 * its own, separate rate limit) — used to set up many reports for an attachment-only test
 * without tripping the report rate limit first.
 */
function seedReportRecord(userId: string, email: string): string {
  const id = randomUUID();
  const record = {
    id,
    createdAt: new Date().toISOString(),
    userId,
    email,
    type: "bug",
    description: "seeded directly for attachment tests",
    saveId: null,
    page: "/test",
    gameDate: null,
    userAgent: null,
  };
  appendFileSync(reportsFilePath(), `${JSON.stringify(record)}\n`, "utf8");
  return id;
}

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

/** Like postReport, but with full control over headers and the raw body string. */
function postRaw(token: string, headers: Record<string, string>, rawBody: string): Request {
  return new Request("http://localhost:3000/api/reports", {
    method: "POST",
    headers: { cookie: `fs_session=${token}`, ...headers },
    body: rawBody,
  });
}

const VALID_BODY = {
  type: "bug",
  description: "The pitch overlay flickers when I open the stats tab.",
  page: "/dashboard",
};

/** The most recently appended line in reports.jsonl, parsed. */
function lastReportLine(): Record<string, unknown> {
  const contents = readFileSync(reportsFilePath(), "utf8");
  const lines = contents.trim().split("\n");
  return JSON.parse(lines[lines.length - 1]!);
}

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

  test("accepts a null gameDate", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, gameDate: null }));
    expect(res.status).toBe(200);
  });

  test.each([
    "2027/03/14",
    "14-03-2027",
    "2027-3-14",
    "not-a-date",
    "2027-03-14T00:00:00.000Z",
    "",
  ])("rejects a malformed gameDate %p", async (gameDate) => {
    const res = await handler()(postReport(token, { ...VALID_BODY, gameDate }));
    if (gameDate === "") {
      // An empty/blank gameDate is treated as "not provided", same as omitting it.
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/gameDate/);
    }
  });

  test("rejects a gameDate that is way too long (not just wrong-shaped)", async () => {
    const res = await handler()(
      postReport(token, { ...VALID_BODY, gameDate: "2027-03-14".repeat(50) }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects a non-string gameDate", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, gameDate: 20270314 }));
    expect(res.status).toBe(400);
  });

  test("rejects an impossible gameDate", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, gameDate: "2027-02-30" }));
    expect(res.status).toBe(400);
  });

  test("rejects a gameDate with an out-of-range month", async () => {
    const res = await handler()(postReport(token, { ...VALID_BODY, gameDate: "2027-13-01" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/reports — request shape (Content-Type, body size)", () => {
  test("415 when Content-Type is not application/json", async () => {
    const { token } = sessionFor("tester@example.com");
    const req = postRaw(token, { "content-type": "text/plain" }, JSON.stringify(VALID_BODY));
    const res = await handler()(req);
    expect(res.status).toBe(415);
  });

  test("415 when Content-Type is missing entirely", async () => {
    const { token } = sessionFor("tester@example.com");
    const req = new Request("http://localhost:3000/api/reports", {
      method: "POST",
      headers: { cookie: `fs_session=${token}` },
      body: JSON.stringify(VALID_BODY),
    });
    const res = await handler()(req);
    expect(res.status).toBe(415);
  });

  test("413 when Content-Length header alone claims more than 16 KB, even though the body is small", async () => {
    const { token } = sessionFor("tester@example.com");
    const req = postRaw(
      token,
      { "content-type": "application/json", "content-length": String(20 * 1024) },
      JSON.stringify(VALID_BODY),
    );
    const res = await handler()(req);
    expect(res.status).toBe(413);
  });

  test("413 when the actual body exceeds 16 KB regardless of headers (no Content-Length sent)", async () => {
    const { token } = sessionFor("tester@example.com");
    const oversized = JSON.stringify({ ...VALID_BODY, description: "x".repeat(20_000) });
    const req = postRaw(token, { "content-type": "application/json" }, oversized);
    const res = await handler()(req);
    expect(res.status).toBe(413);
  });

  test("a normal, well within 16 KB body is unaffected by the size gate", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(postReport(token, VALID_BODY));
    expect(res.status).toBe(200);
  });

  test("415 when application/json only appears as a parameter", async () => {
    const { token } = sessionFor("tester@example.com");
    const req = postRaw(token, { "content-type": "text/plain; x=application/json" }, JSON.stringify(VALID_BODY));
    const res = await handler()(req);
    expect(res.status).toBe(415);
  });

  test("accepts application/json with a charset parameter", async () => {
    const { token } = sessionFor("tester@example.com");
    const req = postRaw(token, { "content-type": "Application/JSON; charset=utf-8" }, JSON.stringify(VALID_BODY));
    const res = await handler()(req);
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

  test("a saveId owned by a different user is accepted, but stored as null", async () => {
    const { userId: otherUserId } = sessionFor("someone-else@example.com");
    const saveId = `save-owned-by-someone-else-${randomUUID()}`;
    recordSaveOwnership(saveId, otherUserId);
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(postReport(token, { ...VALID_BODY, saveId }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };

    const last = lastReportLine();
    expect(last.id).toBe(body.id);
    expect(last.saveId).toBeNull();
  });

  test("a saveId that does not exist is accepted, but stored as null", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(
      postReport(token, { ...VALID_BODY, saveId: `no-such-save-${randomUUID()}` }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };

    const last = lastReportLine();
    expect(last.id).toBe(body.id);
    expect(last.saveId).toBeNull();
  });

  test("a non-string saveId is rejected (wrong JSON type, not an ownership question)", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(postReport(token, { ...VALID_BODY, saveId: 12345 }));
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

    const last = lastReportLine();
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
    expect(new Date(last.createdAt as string).toString()).not.toBe("Invalid Date");
  });

  test("saveId and gameDate are null (not undefined/missing) when omitted", async () => {
    const { token } = sessionFor("tester@example.com");
    await handler()(postReport(token, VALID_BODY));

    const last = lastReportLine();
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

  test("a description with embedded newlines and control chars stays one line and round-trips exactly", async () => {
    const { token } = sessionFor("tester@example.com");
    const tricky = "Line one\nLine two\u001b[31mred\u001b[0m\ttabbed\rcarriage";

    const before = readFileSync(reportsFilePath(), "utf8").trim().split("\n").filter(Boolean).length;
    const res = await handler()(postReport(token, { ...VALID_BODY, description: tricky }));
    expect(res.status).toBe(200);

    const allLines = readFileSync(reportsFilePath(), "utf8").trim().split("\n").filter(Boolean);
    expect(allLines).toHaveLength(before + 1); // exactly one new line, not split across several
    const last = JSON.parse(allLines[allLines.length - 1]!);
    expect(last.description).toBe(tricky); // round-trips byte-for-byte through JSON escaping
  });

  test("userAgent is capped to 300 characters", async () => {
    const { token } = sessionFor("tester@example.com");
    const longUA = "Mozilla/5.0 ".repeat(40); // > 300 chars
    expect(longUA.length).toBeGreaterThan(300);
    const req = postReport(token, VALID_BODY);
    req.headers.set("user-agent", longUA);
    const res = await handler()(req);
    expect(res.status).toBe(200);

    const last = lastReportLine();
    expect(last.userAgent).toBe(longUA.slice(0, 300));
    expect((last.userAgent as string).length).toBe(300);
  });

  test("userAgent is null when the header is absent", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await handler()(postReport(token, VALID_BODY)); // postReport never sets one
    expect(res.status).toBe(200);
    expect(lastReportLine().userAgent).toBeNull();
  });
});

describe("POST /api/reports/:id/attachment — auth and tester gates", () => {
  test("401 with no session cookie", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const res = await attachmentHandler()(postAttachment(null, id, pngBytes()));
    expect(res.status).toBe(401);
  });

  test("403 for an authenticated user who is not a tester", async () => {
    const { token: testerToken } = sessionFor("tester@example.com");
    const id = await fileReport(testerToken);
    const { token: otherToken } = sessionFor("not-a-tester@example.com");
    const res = await attachmentHandler()(postAttachment(otherToken, id, pngBytes()));
    expect(res.status).toBe(403);
  });

  test("405 for non-POST methods", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const req = new Request(`http://localhost:3000/api/reports/${id}/attachment`, {
      method: "GET",
      headers: { cookie: `fs_session=${token}` },
    }) as Request & { params: Record<string, string> };
    req.params = { id };
    const res = await attachmentHandler()(req);
    expect(res.status).toBe(405);
  });
});

describe("POST /api/reports/:id/attachment — id ownership", () => {
  test("404 for an id that does not exist", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await attachmentHandler()(postAttachment(token, randomUUID(), pngBytes()));
    expect(res.status).toBe(404);
  });

  test("404 for an id shaped like garbage (never even reaches a file lookup)", async () => {
    const { token } = sessionFor("tester@example.com");
    const res = await attachmentHandler()(
      postAttachment(token, "../../etc/passwd", pngBytes()),
    );
    expect(res.status).toBe(404);
  });

  test("404 for a report id belonging to someone else", async () => {
    const { token: ownerToken } = sessionFor("owner@example.com");
    process.env.REPORT_TESTERS = "owner@example.com,other@example.com";
    const id = await fileReport(ownerToken);

    const { token: otherToken } = sessionFor("other@example.com");
    const res = await attachmentHandler()(postAttachment(otherToken, id, pngBytes()));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/reports/:id/attachment — validation and storage", () => {
  test("415 when Content-Type is neither image/png nor image/jpeg", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const res = await attachmentHandler()(
      postAttachment(token, id, pngBytes(), "application/octet-stream"),
    );
    expect(res.status).toBe(415);
  });

  test("413 when Content-Length header alone claims more than 2 MB", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const req = postAttachment(token, id, pngBytes());
    req.headers.set("content-length", String(3 * 1024 * 1024));
    const res = await attachmentHandler()(req);
    expect(res.status).toBe(413);
  });

  test("413 when the actual body exceeds 2 MB regardless of headers", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const oversized = pngBytes(3 * 1024 * 1024);
    const res = await attachmentHandler()(postAttachment(token, id, oversized));
    expect(res.status).toBe(413);
  });

  test("400 when the declared Content-Type is image/png but the bytes are not a PNG", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const notPng = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const res = await attachmentHandler()(postAttachment(token, id, notPng, "image/png"));
    expect(res.status).toBe(400);
  });

  test("400 when the declared Content-Type is image/jpeg but the bytes are a PNG", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const res = await attachmentHandler()(
      postAttachment(token, id, pngBytes(), "image/jpeg"),
    );
    expect(res.status).toBe(400);
  });

  test("200 for a valid PNG, and the file lands under attachmentsDir()", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const res = await attachmentHandler()(postAttachment(token, id, pngBytes(), "image/png"));
    expect(res.status).toBe(200);
    expect(existsSync(`${attachmentsDir()}/${id}.png`)).toBe(true);
  });

  test("200 for a valid JPEG, and the file lands under attachmentsDir() with a .jpg extension", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const res = await attachmentHandler()(postAttachment(token, id, jpegBytes(), "image/jpeg"));
    expect(res.status).toBe(200);
    expect(existsSync(`${attachmentsDir()}/${id}.jpg`)).toBe(true);
  });

  test("409 when the report already has an attachment", async () => {
    const { token } = sessionFor("tester@example.com");
    const id = await fileReport(token);
    const first = await attachmentHandler()(postAttachment(token, id, pngBytes(), "image/png"));
    expect(first.status).toBe(200);

    const second = await attachmentHandler()(postAttachment(token, id, pngBytes(), "image/png"));
    expect(second.status).toBe(409);
  });
});

describe("POST /api/reports/:id/attachment — rate limit", () => {
  test("429 after 20 successful uploads in the window, per user", async () => {
    // Reports are seeded directly (not via the rate-limited /api/reports route) so this test
    // isolates the attachment rate limit from the report-filing rate limit.
    const { token, userId } = sessionFor("tester@example.com");
    for (let i = 0; i < 20; i++) {
      const id = seedReportRecord(userId, "tester@example.com");
      const res = await attachmentHandler()(postAttachment(token, id, pngBytes(), "image/png"));
      expect(res.status).toBe(200);
    }
    const id21 = seedReportRecord(userId, "tester@example.com");
    const res21 = await attachmentHandler()(postAttachment(token, id21, pngBytes(), "image/png"));
    expect(res21.status).toBe(429);
  });
});
