import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The auth DB path is read from RUNTIME_DATA_DIR at import time (src/backend/db.ts), so it
// must be set to an isolated temp directory before anything that transitively imports the
// db module is imported. A dynamic import after setting the env var achieves that.
let tmpDir: string;
let authRoutes: typeof import("@/backend/auth/routes").authRoutes;

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["RUNTIME_DATA_DIR", "DEV_AUTO_LOGIN", "NODE_ENV"] as const;

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  tmpDir = mkdtempSync(join(tmpdir(), "fmproject-dev-login-"));
  process.env.RUNTIME_DATA_DIR = tmpDir;
  ({ authRoutes } = await import("@/backend/auth/routes"));
});

afterAll(async () => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  const { db } = await import("@/backend/db");
  db.close();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Windows can briefly hold the sqlite file handle after close(); best-effort cleanup.
  }
});

afterEach(() => {
  delete process.env.DEV_AUTO_LOGIN;
  delete process.env.NODE_ENV;
});

const handler = () => authRoutes["/api/auth/dev-login"];

describe("GET /api/auth/dev-login", () => {
  test("404 without DEV_AUTO_LOGIN set", async () => {
    delete process.env.DEV_AUTO_LOGIN;
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req);
    expect(res.status).toBe(404);
  });

  test("404 when NODE_ENV=production, even with DEV_AUTO_LOGIN=1", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    process.env.NODE_ENV = "production";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req);
    expect(res.status).toBe(404);
  });

  test("404 for a non-local host, even with everything else set", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    const req = new Request("http://example.com/api/auth/dev-login");
    const res = await handler()(req);
    expect(res.status).toBe(404);
  });

  test("302 + Set-Cookie with a valid session for localhost", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    const req = new Request("http://localhost:3000/api/auth/dev-login");
    const res = await handler()(req);

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

  test("302 for 127.0.0.1 as well", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    const req = new Request("http://127.0.0.1:3000/api/auth/dev-login");
    const res = await handler()(req);
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toContain("fs_session=");
  });

  test("reuses the same dev user across calls", async () => {
    process.env.DEV_AUTO_LOGIN = "1";
    const req1 = new Request("http://localhost:3000/api/auth/dev-login");
    const res1 = await handler()(req1);
    const token1 = decodeURIComponent(
      res1.headers.get("Set-Cookie")!.split(";")[0]!.split("=")[1]!,
    );

    const req2 = new Request("http://localhost:3000/api/auth/dev-login");
    const res2 = await handler()(req2);
    const token2 = decodeURIComponent(
      res2.headers.get("Set-Cookie")!.split(";")[0]!.split("=")[1]!,
    );

    const { getSessionByToken } = await import("@/backend/auth/AuthService");
    const session1 = getSessionByToken(token1);
    const session2 = getSessionByToken(token2);
    expect(session1!.user.id).toBe(session2!.user.id);
  });
});
