import { describe, expect, test } from "bun:test";
import { faceRoutes, parseFaceRequest, parsePersonFaceRequest } from "@/backend/faces";
import { croppedPersonFaceSvg } from "@/Domain/faces/personFaceSvg";
import { croppedPlayerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import { faceUrl, managerAvatarUrl, personFaceUrl } from "@/Domain/faces/faceUrl";

const route = faceRoutes["/api/faces/:file"];

function get(path: string): Response | Promise<Response> {
  const url = new URL(path, "http://localhost");
  // Bun's router hands the handler percent-decoded params; mirror that.
  const file = decodeURIComponent(url.pathname.replace("/api/faces/", ""));
  const req = Object.assign(new Request(url), { params: { file } });
  return route(req);
}

describe("GET /api/faces/:playerId.svg", () => {
  test("serves the same SVG the domain builds, as a long-lived immutable image", async () => {
    const res = await get(faceUrl("player_42", "Brazil", ["#DA291C", "#FFE500"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
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
    // Decoded once by the router to `%zz.svg`; a second decode used to throw (500).
    expect((await get("/api/faces/%25zz.svg")).status).toBe(404);
  });

  test("invalid colours never reach the SVG, they fall back to the defaults", () => {
    const parsed = parseFaceRequest("p1.svg", new URLSearchParams({ colors: '"/><script>,00ff00' }))!;
    expect(parsed.colors).toEqual([undefined, "#00ff00"]);
    const svg = croppedPlayerFaceSvg(parsed.playerId, parsed.nationality, parsed.colors);
    expect(svg).not.toContain("<script>");
  });

  test("same region shares a cache entry and the bytes match the domain SVG", async () => {
    const a = await (await get(faceUrl("player_9", "Germany", ["#000000"]))).text();
    const b = await (await get(faceUrl("player_9", "England", ["#000000"]))).text();
    expect(a).toBe(b);
    expect(b).toBe(croppedPlayerFaceSvg("player_9", "England", ["#000000"]));
  });

  test("at most 3 colours, nationality is trimmed and capped", () => {
    const parsed = parseFaceRequest("p1.svg", new URLSearchParams({ colors: "111,222,333,444", nat: ` ${"x".repeat(200)} ` }))!;
    expect(parsed.colors).toEqual(["#111", "#222", "#333"]);
    expect(parsed.nationality!.length).toBe(64);
  });
});

const personRoute = faceRoutes["/api/faces/person/:file"];
const managerRoute = faceRoutes["/api/faces/manager/:file"];

function getFrom(handler: (r: Request & { params: { file: string } }) => Response, prefix: string, path: string) {
  const url = new URL(path, "http://localhost");
  const file = decodeURIComponent(url.pathname.replace(prefix, ""));
  return handler(Object.assign(new Request(url), { params: { file } }));
}

describe("GET /api/faces/person/:id.svg and /api/faces/manager/avatar.svg", () => {
  test("staff / manager face: same bytes as the domain, immutable SVG with the CSP", async () => {
    const res = getFrom(personRoute, "/api/faces/person/", personFaceUrl("staff_12", "Brazil", ["#DA291C"], 55));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(await res.text()).toBe(croppedPersonFaceSvg("staff_12", "Brazil", ["#DA291C"], { age: 55 }));
    const noAge = getFrom(personRoute, "/api/faces/person/", personFaceUrl("coach_3"));
    expect(await noAge.text()).toBe(croppedPersonFaceSvg("coach_3", null, [], { age: null }));
  });

  test("person: 404 for a bad id, 400 for a bad age", () => {
    expect(getFrom(personRoute, "/api/faces/person/", "/api/faces/person/staff_1").status).toBe(404);
    expect(getFrom(personRoute, "/api/faces/person/", "/api/faces/person/%3Cx%3E.svg").status).toBe(404);
    for (const age of ["abc", "5", "200", "-3", "40.5"]) {
      expect(getFrom(personRoute, "/api/faces/person/", `/api/faces/person/s1.svg?age=${age}`).status).toBe(400);
    }
    expect(parsePersonFaceRequest("s1.svg", new URLSearchParams({ age: "61" }))).toMatchObject({ personId: "s1", age: 61 });
  });

  test("manager avatar: rendered from the parameters, 400 on invalid ones, 404 on another file", async () => {
    const face = { seed: 7, skin: 3, hairLength: "short", beard: "full", glasses: true } as const;
    const res = getFrom(managerRoute, "/api/faces/manager/", managerAvatarUrl(face, "Brazil", ["#16a34a"]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(await res.text()).toBe(croppedPersonFaceSvg("avatar", "Brazil", ["#16a34a"], { custom: face }));
    for (const q of ["", "seed=x", "seed=1&skin=9", "seed=1&hl=mullet", "seed=1&beard=x", "seed=1&glasses=yes", "seed=1&hc=<script>"]) {
      expect(getFrom(managerRoute, "/api/faces/manager/", `/api/faces/manager/avatar.svg?${q}`).status).toBe(400);
    }
    expect(getFrom(managerRoute, "/api/faces/manager/", "/api/faces/manager/other.svg?seed=1").status).toBe(404);
  });
});
