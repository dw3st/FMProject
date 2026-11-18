import { describe, expect, test } from "bun:test";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { exportPreset } from "@/Domain/tactics/lineupPresets";

type Handler = (r: Request) => Response | Promise<Response>;

function call(path: string, token: string, method: string, body?: unknown, params?: Record<string, string>) {
  const key = params ? "/api/account/tactics/:id" : path;
  const route = apiRoutes[key as keyof typeof apiRoutes] as unknown as Record<string, Handler>;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return route[method]!(params ? Object.assign(req, { params }) : req);
}

describe("account tactics library", () => {
  test("keeps a valid code, lists it only for its owner, refuses bad ones and deletes", async () => {
    const me = devAutoLogin("tactics-me@test.local");
    const other = devAutoLogin("tactics-other@test.local");
    const code = exportPreset({ formation: "4-3-3", lineup: [], savedOn: "2027-01-01", name: "Pressão" });

    expect((await call("/api/account/tactics", me.session.token, "POST", { name: "x", code: "nope" })).status).toBe(400);
    expect((await call("/api/account/tactics", me.session.token, "POST", { name: "", code })).status).toBe(400);
    const res = await call("/api/account/tactics", me.session.token, "POST", { name: "Pressão alta", code });
    expect(res.status).toBe(201);
    const { tactic } = (await res.json()) as { tactic: { id: string; name: string; code: string } };
    expect(tactic.name).toBe("Pressão alta");

    const mine = (await (await call("/api/account/tactics", me.session.token, "GET")).json()) as { tactics: { id: string }[] };
    expect(mine.tactics.map((x) => x.id)).toContain(tactic.id);
    const theirs = (await (await call("/api/account/tactics", other.session.token, "GET")).json()) as { tactics: { id: string }[] };
    expect(theirs.tactics.map((x) => x.id)).not.toContain(tactic.id);

    const path = `/api/account/tactics/${tactic.id}`;
    expect((await call(path, other.session.token, "DELETE", undefined, { id: tactic.id })).status).toBe(404);
    expect((await call(path, me.session.token, "DELETE", undefined, { id: tactic.id })).status).toBe(200);
    const after = (await (await call("/api/account/tactics", me.session.token, "GET")).json()) as { tactics: { id: string }[] };
    expect(after.tactics.map((x) => x.id)).not.toContain(tactic.id);
  });
});
