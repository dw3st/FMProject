import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { artAssetRoutes, setArtDirForTests } from "@/backend/artAssets";

let dir = "";
const route = artAssetRoutes["/assets/art/v8/*"] as (req: Request) => Response | Promise<Response>;
const faces = artAssetRoutes["/api/art/faces"] as () => Response;
const get = (path: string) => route(new Request(`http://x/assets/art/v8/${path}`));

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
    expect(await faces().json()).toEqual({ players: [], coaches: [], referees: [], backdrops: [], penaltyBackdrops: [], facilities: [], news: [], surround: [], pixelSprite: null, visual: true });
  });

  test("the face list only with ART_FACES=1, and only ids on the client's path convention", async () => {
    setArtDirForTests(dir);
    expect(await faces().json()).toEqual({ players: [], coaches: [], referees: [], backdrops: ["match-backdrop-grass-a"], penaltyBackdrops: [], facilities: [], news: [], surround: [], pixelSprite: null, visual: true });
    process.env.ART_FACES = "1";
    expect(await faces().json()).toEqual({ players: ["p1", "p2"], coaches: [], referees: [], backdrops: ["match-backdrop-grass-a"], penaltyBackdrops: [], facilities: [], news: [], surround: [], pixelSprite: null, visual: true });
  });

  test("the painted backdrops are announced unless ART_VISUAL=0 (no image rights involved)", async () => {
    setArtDirForTests(dir);
    process.env.ART_VISUAL = "0";
    expect((await faces().json()).backdrops).toEqual([]);
  });

  test("pixel-art players: a valid atlas is announced and its two files served; a bad one is nothing", async () => {
    const pixelDir = mkdtempSync(join(tmpdir(), "art-pixel-"));
    const at = (name: string) => join(pixelDir, "sprites", name);
    mkdirSync(join(pixelDir, "sprites"), { recursive: true });
    writeFileSync(at("sheet-1.png"), "PNG");
    writeFileSync(at("other.png"), "PNG");
    const one = { frames: [0], dur: 0.2 };
    const atlas = {
      image: "sprites/sheet-1.png", body: 14, height: 30, layers: ["skin", "socks", "shorts", "shirt"],
      rects: [[0, 0, 8, 8]], frames: [[0, 0, -4, -8]],
      clips: { idle: { ...one, loop: true }, walk: one, run: one, kick: one },
    };
    writeFileSync(at("sheet-1.json"), JSON.stringify(atlas));
    writeFileSync(at("pixel-players.json"), JSON.stringify({ data: "sprites/sheet-1.json" }));
    setArtDirForTests(pixelDir);
    const { utimesSync } = await import("node:fs");
    let tick = 0;
    const rewrite = (name: string, content: unknown) => {
      writeFileSync(at(name), JSON.stringify(content));
      // A later modification time, so the cached answer is read again.
      const later = new Date(Date.now() + 5000 * ++tick);
      utimesSync(at(name), later, later);
    };
    try {
      // No index.json on this volume: the atlas stands on its own.
      expect((await faces().json()).pixelSprite).toEqual({ data: "sprites/sheet-1.json", image: "sprites/sheet-1.png" });
      const res = await get("sprites/sheet-1.png");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const data = await get("sprites/sheet-1.json");
      expect(data.status).toBe(200);
      expect(data.headers.get("content-type")).toContain("application/json");
      expect((await get("sprites/other.png")).status).toBe(404);
      expect((await get("sprites/pixel-players.json")).status).toBe(404);
      process.env.ART_VISUAL = "0";
      expect((await faces().json()).pixelSprite).toBeNull();
      delete process.env.ART_VISUAL;
      // A description that does not validate: no option, no files.
      rewrite("sheet-1.json", { ...atlas, image: "../index.json" });
      expect((await faces().json()).pixelSprite).toBeNull();
      expect((await get("sprites/sheet-1.png")).status).toBe(404);
      expect((await get("sprites/sheet-1.json")).status).toBe(404);
      // A valid description whose image is missing: nothing either.
      rewrite("sheet-1.json", { ...atlas, image: "sprites/missing.png" });
      expect((await faces().json()).pixelSprite).toBeNull();
      // A pointer outside sprites/, or to itself: nothing.
      rewrite("sheet-1.json", atlas);
      expect((await faces().json()).pixelSprite).not.toBeNull();
      rewrite("pixel-players.json", { data: "../index.json" });
      expect((await faces().json()).pixelSprite).toBeNull();
      rewrite("pixel-players.json", { data: "sprites/pixel-players.json" });
      expect((await faces().json()).pixelSprite).toBeNull();
    } finally {
      rmSync(pixelDir, { recursive: true, force: true });
    }
  });
});
