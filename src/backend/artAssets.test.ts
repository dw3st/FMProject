import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artAssetRoutes, setArtDirForTests } from "@/backend/artAssets";

let dir = "";
const route = artAssetRoutes["/assets/art/v1/*"] as (req: Request) => Response | Promise<Response>;
const faces = artAssetRoutes["/api/art/faces"] as () => Response;
const get = (path: string) => route(new Request(`http://x/assets/art/v1/${path}`));

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "art-"));
  mkdirSync(join(dir, "faces", "players"), { recursive: true });
  writeFileSync(join(dir, "faces", "players", "p1.webp"), "RIFF0000WEBP");
  writeFileSync(join(dir, "secret.txt"), "no");
  writeFileSync(join(dir, "index.json"), JSON.stringify({
    version: 1,
    faces: { players: { p1: "faces/players/p1.webp", p2: "faces/players/p2.webp", odd: "elsewhere/odd.webp" }, coaches: {}, referees: {} },
    news: { "news-x": "../escape.webp" },
    backdrops: { match: { "match-backdrop-grass-a": "backdrops/match/match-backdrop-grass-a.webp", odd: "x/odd.webp" } },
  }));
});
afterEach(() => { delete process.env.ART_FACES; delete process.env.ART_VISUAL; });
afterAll(() => { setArtDirForTests(null); rmSync(dir, { recursive: true, force: true }); });

describe("art assets", () => {
  test("a listed file is served as webp, cached forever", async () => {
    setArtDirForTests(dir);
    const res = await get("faces/players/p1.webp");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
  });

  test("unlisted, listed but missing, or escaping paths: 404", async () => {
    setArtDirForTests(dir);
    expect((await get("secret.txt")).status).toBe(404);
    expect((await get("faces/players/p2.webp")).status).toBe(404);
    expect((await get("../escape.webp")).status).toBe(404);
    expect((await get("index.json")).status).toBe(404);
  });

  test("no index (art not copied yet): 404 and no painted faces", async () => {
    setArtDirForTests(join(dir, "nothing"));
    process.env.ART_FACES = "1";
    expect((await get("faces/players/p1.webp")).status).toBe(404);
    expect(await faces().json()).toEqual({ players: [], coaches: [], referees: [], backdrops: [], penaltyBackdrops: [], facilities: [], news: [], visual: true });
  });

  test("the face list only with ART_FACES=1, and only ids on the client's path convention", async () => {
    setArtDirForTests(dir);
    expect(await faces().json()).toEqual({ players: [], coaches: [], referees: [], backdrops: ["match-backdrop-grass-a"], penaltyBackdrops: [], facilities: [], news: [], visual: true });
    process.env.ART_FACES = "1";
    expect(await faces().json()).toEqual({ players: ["p1", "p2"], coaches: [], referees: [], backdrops: ["match-backdrop-grass-a"], penaltyBackdrops: [], facilities: [], news: [], visual: true });
  });

  test("the painted backdrops are announced unless ART_VISUAL=0 (no image rights involved)", async () => {
    setArtDirForTests(dir);
    process.env.ART_VISUAL = "0";
    expect((await faces().json()).backdrops).toEqual([]);
  });
});
