import { describe, expect, test } from "bun:test";
import { withJsonErrors } from "@/backend/routeErrors";

describe("withJsonErrors", () => {
  test("a handler that throws answers JSON 500 instead of Bun's plain-text error", async () => {
    const routes = withJsonErrors({
      "/api/boom": async (_req: Request): Promise<Response> => { throw new Error("kaboom"); },
      "/api/sync-boom": (_req: Request): Response => { throw new TypeError("sync"); },
      "/api/ok": (_req: Request) => Response.json({ ok: true }),
    });
    const res = await routes["/api/boom"](new Request("http://localhost/api/boom"));
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "internal error: kaboom" });
    const sync = await routes["/api/sync-boom"](new Request("http://localhost/api/sync-boom"));
    expect(sync.status).toBe(500);
    expect(((await sync.json()) as { error: string }).error).toContain("sync");
    const ok = await routes["/api/ok"](new Request("http://localhost/api/ok"));
    expect(await ok.json()).toEqual({ ok: true });
  });

  test("method objects are wrapped too; non-function values pass through", async () => {
    const page = { index: "x" };
    const routes = withJsonErrors({
      "/api/m": { GET: (_req: Request): Response => { throw new Error("get"); } },
      "/page": page,
    });
    expect((await routes["/api/m"].GET(new Request("http://localhost/api/m"))).status).toBe(500);
    expect(routes["/page"]).toBe(page);
  });
});
