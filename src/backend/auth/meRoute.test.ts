import { afterEach, describe, expect, test } from "bun:test";
import { authRoutes } from "@/backend/auth/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";

// RUNTIME_DATA_DIR is isolated for the whole test run by bunfig.toml's `[test] preload`
// (scripts/testPreload.ts) — see the comment at the top of reports.test.ts / devLogin.test.ts.

afterEach(() => {
  delete process.env.REPORT_TESTERS;
});

const handler = () => authRoutes["/api/auth/me"];

function reqWithCookie(token: string): Request {
  return new Request("http://localhost:3000/api/auth/me", {
    headers: { cookie: `fs_session=${token}` },
  });
}

describe("GET /api/auth/me", () => {
  test("401 with no session cookie", async () => {
    const res = await handler()(new Request("http://localhost:3000/api/auth/me"));
    expect(res.status).toBe(401);
  });

  test("isTester: true for an email listed in REPORT_TESTERS", async () => {
    process.env.REPORT_TESTERS = "me-route-tester@example.com";
    const { session } = devAutoLogin("me-route-tester@example.com");
    const res = await handler()(reqWithCookie(session.token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string; isTester: boolean };
    expect(body.email).toBe("me-route-tester@example.com");
    expect(body.isTester).toBe(true);
  });

  test("isTester: false when REPORT_TESTERS is unset", async () => {
    delete process.env.REPORT_TESTERS;
    const { session } = devAutoLogin("me-route-not-tester@example.com");
    const res = await handler()(reqWithCookie(session.token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isTester: boolean };
    expect(body.isTester).toBe(false);
  });

  test("isTester: false when the email is not in the (non-empty) REPORT_TESTERS list", async () => {
    process.env.REPORT_TESTERS = "someone-else@example.com";
    const { session } = devAutoLogin("me-route-also-not-tester@example.com");
    const res = await handler()(reqWithCookie(session.token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isTester: boolean };
    expect(body.isTester).toBe(false);
  });
});
