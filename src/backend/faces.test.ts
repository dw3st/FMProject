import { describe, expect, test } from "bun:test";
import { faceRoutes, parseFaceRequest } from "@/backend/faces";
import { croppedPlayerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import { faceUrl } from "@/Domain/faces/faceUrl";

const route = faceRoutes["/api/faces/:file"];

function get(path: string): Response | Promise<Response> {
  const url = new URL(path, "http://localhost");
  const file = url.pathname.replace("/api/faces/", "");
  const req = Object.assign(new Request(url), { params: { file } });
  return route(req);
}

describe("GET /api/faces/:playerId.svg", () => {
  test("serves the same SVG the domain builds, as a long-lived immutable image", async () => {
    const res = await get(faceUrl("player_42", "Brazil", ["#DA291C", "#FFE500"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.text()).toBe(croppedPlayerFaceSvg("player_42", "Brazil", ["#DA291C", "#FFE500"]));
  });

  test("is deterministic across requests (cache hit returns identical bytes)", async () => {
    const path = faceUrl("player_7", "Italy", ["#123456", "#abcdef"]);
    const a = await (await get(path)).text();
    const b = await (await get(path)).text();
    expect(a).toBe(b);
    expect(a.toLowerCase()).toContain("#123456");
  });

  test("404 for a missing .svg suffix or an invalid id", async () => {
    expect((await get("/api/faces/player_1")).status).toBe(404);
    expect((await get("/api/faces/%3Cscript%3E.svg")).status).toBe(404);
    expect((await get("/api/faces/..%2Fsecret.svg")).status).toBe(404);
  });

  test("invalid colours never reach the SVG, they fall back to the defaults", () => {
    const parsed = parseFaceRequest("p1.svg", new URLSearchParams({ colors: '"/><script>,00ff00' }))!;
    expect(parsed.colors).toEqual([undefined, "#00ff00"]);
    const svg = croppedPlayerFaceSvg(parsed.playerId, parsed.nationality, parsed.colors);
    expect(svg).not.toContain("<script>");
  });

  test("at most 3 colours, nationality is trimmed and capped", () => {
    const parsed = parseFaceRequest("p1.svg", new URLSearchParams({ colors: "111,222,333,444", nat: ` ${"x".repeat(200)} ` }))!;
    expect(parsed.colors).toEqual(["#111", "#222", "#333"]);
    expect(parsed.nationality!.length).toBe(64);
  });
});
