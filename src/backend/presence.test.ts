import { beforeEach, describe, expect, test } from "bun:test";
import { onlineCount, presenceRoutes, PRESENCE_WINDOW_MS, recordPresence, resetPresence } from "@/backend/presence";
import { devAutoLogin } from "@/backend/auth/AuthService";

beforeEach(() => resetPresence());

describe("presence counter (#134)", () => {
  test("counts distinct users seen within the window", () => {
    recordPresence("u1", 1_000);
    recordPresence("u1", 2_000);
    recordPresence("u2", 3_000);
    expect(onlineCount(3_000)).toBe(2);
    // u1's last ping (2 000) falls out of the window first.
    expect(onlineCount(2_000 + PRESENCE_WINDOW_MS + 1)).toBe(1);
    expect(onlineCount(3_000 + PRESENCE_WINDOW_MS + 1)).toBe(0);
  });

  test("the window is 2 to 3 minutes", () => {
    expect(PRESENCE_WINDOW_MS).toBeGreaterThanOrEqual(120_000);
    expect(PRESENCE_WINDOW_MS).toBeLessThanOrEqual(180_000);
  });
});

describe("presence routes (#134)", () => {
  const ping = () => presenceRoutes["/api/presence/ping"];
  const get = () => presenceRoutes["/api/presence"];
  const req = (method: string, token?: string) =>
    new Request("http://localhost/api/presence/ping", { method, headers: token ? { cookie: `fs_session=${token}` } : {} });

  test("401 without a session, 405 on the wrong method", async () => {
    expect((await ping()(req("POST"))).status).toBe(401);
    expect((await get()(req("GET"))).status).toBe(401);
    const { session } = devAutoLogin("presence-a@example.com");
    expect((await ping()(req("GET", session.token))).status).toBe(405);
    expect((await get()(req("POST", session.token))).status).toBe(405);
  });

  test("a ping counts the user once; the GET returns only the number", async () => {
    const a = devAutoLogin("presence-b@example.com").session.token;
    const b = devAutoLogin("presence-c@example.com").session.token;
    expect(await (await ping()(req("POST", a))).json()).toEqual({ online: 1 });
    expect(await (await ping()(req("POST", a))).json()).toEqual({ online: 1 });
    expect(await (await ping()(req("POST", b))).json()).toEqual({ online: 2 });
    const body = await (await get()(req("GET", a))).json();
    expect(body).toEqual({ online: 2 });
  });
});
