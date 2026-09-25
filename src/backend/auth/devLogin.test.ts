import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { authRoutes, type RequestIPServer } from "@/backend/auth/routes";

// RUNTIME_DATA_DIR is isolated to a disposable temp dir for the whole test run by the
// `[test] preload` in bunfig.toml (scripts/testPreload.ts), which runs before this file (or
// anything it imports, like the auth DB) loads — so a plain static import is enough here; no
// per-file temp dir or db lifecycle management needed.
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["DEV_AUTO_LOGIN", "NODE_ENV"] as const;

beforeAll(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

afterEach(() => {
  delete process.env.DEV_AUTO_LOGIN;
  delete process.env.NODE_ENV;
});

const handler = () => authRoutes["/api/auth/dev-login"];

/** Stub `Server` — only `requestIP` matters to the route's gate. */
function stubServer(address: string | null): RequestIPServer {
  return { requestIP: () => (address ? { address } : null) };
}

const LOOPBACK = stubServer("127.0.0.1");

describe("GET /api/auth/dev-login", () => {
  test("404 without DEV_AUTO_LOGIN set (even with NODE_ENV=development + loopback)", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DEV_AUTO_LOGIN;
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(404);
  });

  test('404 for DEV_AUTO_LOGIN="true" (must be exactly "1")', async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTO_LOGIN = "true";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(404);
  });

  test('404 for DEV_AUTO_LOGIN="0"', async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTO_LOGIN = "0";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(404);
  });

  test("404 when NODE_ENV=production, even with DEV_AUTO_LOGIN=1 and loopback", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "production";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(404);
  });

  test("404 when NODE_ENV is unset (fail closed — only 'development' is accepted)", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    delete process.env.NODE_ENV;
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(404);
  });

  test("404 when NODE_ENV is something other than development/production (e.g. 'test')", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "test";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(404);
  });

  test("404 for a non-local Host, even with everything else set", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req = new Request("http://example.com/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(404);
  });

  test("404 when the socket is not loopback, even with a localhost Host header", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, stubServer("10.0.0.5"));
    expect(res.status).toBe(404);
  });

  test("404 when requestIP returns null (closed/unix socket)", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, stubServer(null));
    expect(res.status).toBe(404);
  });

  test("302 + Set-Cookie with a valid session for localhost + loopback socket", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/start");

    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("fs_session=");
    expect(setCookie).toContain("HttpOnly");

    const token = decodeURIComponent(setCookie!.split(";")[0]!.split("=")[1]!);
    const { getSessionByToken } = await import("@/backend/auth/AuthService");
    const session = getSessionByToken(token);
    expect(session).not.toBeNull();
    expect(session!.user.email).toBe("dev@localhost");
  });

  test("302 for 127.0.0.1 Host + loopback socket", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req = new Request("http://127.0.0.1:3000/api/auth/dev-login");
    const res = await handler()(req, LOOPBACK);
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toContain("fs_session=");
  });

  test("302 for [::1] Host + IPv6 loopback socket", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req = new Request("http://[::1]:3000/api/auth/dev-login");
    const res = await handler()(req, stubServer("::1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toContain("fs_session=");
  });

  test("302 for the IPv4-mapped IPv6 loopback socket address", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req, stubServer("::ffff:127.0.0.1"));
    expect(res.status).toBe(302);
  });

  test("reuses the same dev user across calls", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "development";
    const req1 = new Request("http://localhost:3000/api/auth/dev-login");
    const res1 = await handler()(req1, LOOPBACK);
    const token1 = decodeURIComponent(
      res1.headers.get("Set-Cookie")!.split(";")[0]!.split("=")[1]!,
    );

    const req2 = new Request("http://localhost:3000/api/auth/dev-login");
    const res2 = await handler()(req2, LOOPBACK);
    const token2 = decodeURIComponent(
      res2.headers.get("Set-Cookie")!.split(";")[0]!.split("=")[1]!,
    );

    const { getSessionByToken } = await import("@/backend/auth/AuthService");
    const session1 = getSessionByToken(token1);
    const session2 = getSessionByToken(token2);
    expect(session1!.user.id).toBe(session2!.user.id);
  });
});

describe("devAutoLogin", () => {
  test("throws when NODE_ENV=production, even called directly", async () => {
    process.env.NODE_ENV = "production";
    const { devAutoLogin } = await import("@/backend/auth/AuthService");
    expect(() => devAutoLogin("dev@localhost")).toThrow(/production/);
  });

  test("does not throw outside production", async () => {
    process.env.NODE_ENV = "development";
    const { devAutoLogin } = await import("@/backend/auth/AuthService");
    expect(() => devAutoLogin("dev@localhost")).not.toThrow();
  });
});

describe("verifyLoginCode (regression — unaffected by the dev-login refactor)", () => {
  test("valid code returns a user + session", async () => {
    const { db } = await import("@/backend/db");
    const { verifyLoginCode, normalizeEmail } = await import("@/backend/auth/AuthService");
    const email = "regression-1@example.com";
    db.prepare(
      "INSERT INTO magic_codes (email, code, expires_at, used) VALUES (?, ?, ?, 0)",
    ).run(normalizeEmail(email), "111111", Date.now() + 60_000);

    const result = verifyLoginCode(email, "111111");
    expect(result).not.toBeNull();
    expect(result!.user.email).toBe(normalizeEmail(email));
    expect(result!.session.userId).toBe(result!.user.id);
  });

  test("a code cannot be used a second time", async () => {
    const { db } = await import("@/backend/db");
    const { verifyLoginCode, normalizeEmail } = await import("@/backend/auth/AuthService");
    const email = "regression-2@example.com";
    db.prepare(
      "INSERT INTO magic_codes (email, code, expires_at, used) VALUES (?, ?, ?, 0)",
    ).run(normalizeEmail(email), "222222", Date.now() + 60_000);

    const first = verifyLoginCode(email, "222222");
    expect(first).not.toBeNull();

    const second = verifyLoginCode(email, "222222");
    expect(second).toBeNull();
  });

  test("an expired code is rejected", async () => {
    const { db } = await import("@/backend/db");
    const { verifyLoginCode, normalizeEmail } = await import("@/backend/auth/AuthService");
    const email = "regression-3@example.com";
    db.prepare(
      "INSERT INTO magic_codes (email, code, expires_at, used) VALUES (?, ?, ?, 0)",
    ).run(normalizeEmail(email), "333333", Date.now() - 1000);

    const result = verifyLoginCode(email, "333333");
    expect(result).toBeNull();
  });

  test("email is normalized (mixed case / padded) to the same user", async () => {
    const { db } = await import("@/backend/db");
    const { verifyLoginCode, normalizeEmail } = await import("@/backend/auth/AuthService");
    const canonical = "regression-4@example.com";
    db.prepare(
      "INSERT INTO magic_codes (email, code, expires_at, used) VALUES (?, ?, ?, 0)",
    ).run(normalizeEmail(canonical), "444444", Date.now() + 60_000);

    const first = verifyLoginCode(canonical, "444444");
    expect(first).not.toBeNull();

    db.prepare(
      "INSERT INTO magic_codes (email, code, expires_at, used) VALUES (?, ?, ?, 0)",
    ).run(normalizeEmail(canonical), "555555", Date.now() + 60_000);

    const second = verifyLoginCode("  Regression-4@Example.com  ", "555555");
    expect(second).not.toBeNull();
    expect(second!.user.id).toBe(first!.user.id);
  });
});
