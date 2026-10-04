import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { staticAssetRoutes } from "@/backend/staticAssets";
import { FONT_FACES, fontFacesCss, fontUrl } from "@/fontFaces";
import { flagUrl } from "@/Domain/world/flags";

type Handler = (req: Request & { params: { file: string } }) => Response;

function get(path: string): Response {
  const [prefix, handler] = Object.entries(staticAssetRoutes).find(([route]) =>
    path.startsWith(route.replace(":file", "")),
  )!;
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
    for await (const file of new Glob("src/**/*.{ts,tsx,css}").scan(".")) {
      if (file.includes("/Data/") || file.includes("\\Data\\")) continue;
      const text = await Bun.file(file).text();
      if (/@import\s+["']@fontsource|import\s+["']@fontsource|flag-icons\/css/.test(text) && !file.endsWith("staticAssets.ts")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
