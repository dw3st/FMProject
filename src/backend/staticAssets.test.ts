import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { staticAssetRoutes } from "@/backend/staticAssets";
import { FONT_FACES, fontFacesCss, fontUrl } from "@/fontFaces";
import { flagUrl, squareFlagUrl } from "@/Domain/world/flags";

type Handler = (req: Request & { params: { file: string } }) => Response;

function get(path: string): Response {
  // The longest matching route wins (the square flags live under the flags' own prefix).
  const [prefix, handler] = Object.entries(staticAssetRoutes)
    .filter(([route]) => path.startsWith(route.replace(":file", "")))
    .sort((a, b) => b[0].length - a[0].length)[0]!;
  const file = path.slice(prefix.replace(":file", "").length);
  const req = Object.assign(new Request(`http://localhost${path}`), { params: { file } });
  return (handler as Handler)(req);
}

describe("static assets (fonts and flags served as files)", () => {
  test("every font the pages reference is served as woff2, cached forever", async () => {
    expect(FONT_FACES.length).toBe(12); // Barlow 4 weights + Condensed 2 weights, latin + latin-ext
    for (const f of FONT_FACES) {
      const res = get(fontUrl(f.file));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("font/woff2");
      expect(res.headers.get("Cache-Control")).toContain("immutable");
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("wOF2");
    }
  });

  test("fonts outside the whitelist are 404", () => {
    expect(get("/assets/fonts/v1/barlow-vietnamese-400-normal.woff2").status).toBe(404);
    expect(get("/assets/fonts/v1/..%2F..%2Fpackage.json").status).toBe(404);
  });

  test("flags are served as SVG; unknown files are 404", async () => {
    for (const code of ["br", "gb-eng", "us"]) {
      const res = get(flagUrl(code)!);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(await res.text()).toContain("<svg");
    }
    expect(get("/assets/flags/v1/zz.svg").status).toBe(404);
    expect(get("/assets/flags/v1/..%2Fbr.svg").status).toBe(404);
  });

  test("square flags (a national team's crest) are served as SVG; unknown files are 404", async () => {
    for (const code of ["pl", "ro", "gb-eng"]) {
      const res = get(squareFlagUrl(code)!);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
      expect(await res.text()).toContain("<svg");
    }
    expect(get("/assets/flags/v1/1x1/zz.svg").status).toBe(404);
    expect(get("/assets/flags/v1/1x1/..%2Fpl.svg").status).toBe(404);
  });

  test("flagUrl only builds URLs for flag-shaped codes", () => {
    expect(flagUrl("BR")).toBe("/assets/flags/v1/br.svg");
    expect(flagUrl("../x")).toBeUndefined();
  });

  test("@font-face rules point at the served files, latin + latin-ext only", () => {
    const css = fontFacesCss();
    expect(css).not.toContain("data:");
    expect(css).not.toContain("vietnamese");
    expect(css.match(/@font-face/g)?.length).toBe(FONT_FACES.length);
  });

  test("no stylesheet that inlines fonts or flags is imported into the page bundles", async () => {
    const offenders: string[] = [];
    // Walk the source folders only: src/Data holds the runtime world and the saves (tens of thousands of files),
    // and walking it pushed this test past its timeout on a busy machine.
    const entries = readdirSync("src", { withFileTypes: true })
      .filter((e) => e.name !== "Data" && e.name !== "example_data");
    for (const entry of entries) {
      const path = `src/${entry.name}`;
      const files = entry.isDirectory()
        ? [...new Glob("**/*.{ts,tsx,css}").scanSync(path)].map((f) => `${path}/${f}`)
        : /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
      for (const file of files) {
        const text = await Bun.file(file).text();
        if (/@import\s+["']@fontsource|import\s+["']@fontsource|flag-icons\/css/.test(text) && !file.endsWith("staticAssets.ts")) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  }, 30_000);
});

describe("game art", () => {
  test("only the whitelisted atlases are served", async () => {
    const route = staticAssetRoutes["/assets/game/v1/:dir/:file"] as (req: Request & { params: { dir: string; file: string } }) => Response;
    const get = (dir: string, file: string) => route(Object.assign(new Request(`http://x/assets/game/v1/${dir}/${file}`), { params: { dir, file } }));
    expect(get("player", "player-idle-shirt.png").status).toBe(404);
    expect(get("..", "package.json").status).toBe(404);
    const ok = get("player", "player-atlas.json");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/json");
  });
});

describe("sponsor plates", () => {
  const route = staticAssetRoutes["/assets/game/v1/:dir/:file"] as (req: Request & { params: { dir: string; file: string } }) => Response;
  const get = (file: string) => route(Object.assign(new Request("http://x/assets/game/v1/sponsors/x"), { params: { dir: "sponsors", file } }));

  test("a painted plate is served as webp, cached forever; one not painted yet is 404", async () => {
    const dir = join("src", "Data", "assets", "sponsors");
    const file = join(dir, "sp_test_plate_zz9.webp");
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, "RIFFxxxxWEBP");
    try {
      const ok = get("sp_test_plate_zz9.webp");
      expect(ok.status).toBe(200);
      expect(ok.headers.get("content-type")).toBe("image/webp");
      expect(ok.headers.get("cache-control")).toContain("immutable");
      expect(await ok.text()).toBe("RIFFxxxxWEBP");
    } finally {
      rmSync(file, { force: true });
    }
    expect(get("sp_test_plate_zz9.webp").status).toBe(404);
  });

  test("only catalog-shaped ids: no traversal, no other file type", () => {
    for (const file of ["..%2F..%2Fpackage.json", "../player/player-atlas.png", "sp_../x.webp", "sp_a/b.webp", "sp_Upper.webp", "norvane.webp", "sp_x.png", "sp_x.webp.json", `sp_${"a".repeat(81)}.webp`, "sp_.webp"]) {
      expect(get(file).status).toBe(404);
    }
  });
});

describe("web manifest", () => {
  test("served as a manifest, with icons the game art route really serves", async () => {
    const res = (staticAssetRoutes["/manifest.webmanifest"] as () => Response)();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/manifest+json");
    const m = (await res.json()) as { display: string; icons: { src: string }[] };
    expect(m.display).toBe("fullscreen");
    const art = staticAssetRoutes["/assets/game/v1/:dir/:file"] as (req: Request & { params: { dir: string; file: string } }) => Response;
    for (const icon of m.icons) {
      const [dir, file] = icon.src.replace("/assets/game/v1/", "").split("/");
      expect(art(Object.assign(new Request(`http://x${icon.src}`), { params: { dir: dir!, file: file! } })).status).toBe(200);
    }
  });
});
