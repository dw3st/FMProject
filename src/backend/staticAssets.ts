/**
 * Static assets served as separate, long-cached files instead of being inlined in the page CSS
 * bundle (Bun's CSS bundler turns small `url()` files into base64 data URIs, which made the game
 * CSS ~5.3 MB):
 *
 * - `GET /assets/fonts/v1/:file` — the game's woff2 fonts (`src/fontFaces.ts`), from `@fontsource`.
 * - `GET /assets/flags/v1/:file` — country flags (`flagUrl`, `src/Domain/world/flags.ts`), from
 *   `flag-icons`.
 *
 * - `GET /assets/game/v1/:dir/:file` — the in-repo game art (sprite atlases of `src/example_data/assets`, copied to
 *   `src/Data/assets`), only the files in `GAME_ART_FILES`.
 *
 * Only whitelisted files are served (the font list below, the flag directory listing); the URL
 * carries a version segment, so the responses are `immutable`.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { FLAG_ASSET_VERSION } from "@/Domain/world/flags";
import { FONT_ASSET_VERSION, FONT_FACES } from "@/fontFaces";
import { GAME_ART_VERSION } from "@/Domain/art/paintedFaces";

const CACHE_FOREVER = "public, max-age=31536000, immutable";

/** Every font file the pages reference (`FONT_FACES`, `src/fontFaces.ts`) → its @fontsource package. */
const FONT_PACKAGE = new Map(FONT_FACES.map((f) => [f.file, f.pkg]));

function fontPath(file: string, pkg: string): string {
  return join(dirname(Bun.resolveSync(`@fontsource/${pkg}/400.css`, import.meta.dir)), "files", file);
}

let flagFiles: Set<string> | null = null;
let flagDir: string | null = null;

function flags(): { dir: string; files: Set<string> } {
  if (flagFiles === null || flagDir === null) {
    const css = Bun.resolveSync("flag-icons/css/flag-icons.min.css", import.meta.dir);
    flagDir = join(dirname(css), "..", "flags", "4x3");
    flagFiles = new Set(readdirSync(flagDir).filter((f) => f.endsWith(".svg")));
  }
  return { dir: flagDir, files: flagFiles };
}

/** The game art the pages load (art plan phase 2: the players' and keepers' sprite atlases). */
export const GAME_ART_FILES: Record<string, string> = {
  "player/player-atlas.json": "application/json",
  "player/player-atlas.png": "image/png",
  "keeper/keeper-atlas.json": "application/json",
  "keeper/keeper-atlas.png": "image/png",
};
const GAME_ART_DIR = join(import.meta.dir, "..", "Data", "assets");

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

function serveFile(path: string, contentType: string, extra: Record<string, string> = {}): Response {
  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_FOREVER,
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

export const staticAssetRoutes = {
  [`/assets/game/${GAME_ART_VERSION}/:dir/:file`]: (req: Request & { params: { dir: string; file: string } }) => {
    const path = `${req.params.dir}/${req.params.file}`;
    const type = GAME_ART_FILES[path];
    if (!type) return notFound();
    return serveFile(join(GAME_ART_DIR, path), type);
  },
  [`/assets/fonts/${FONT_ASSET_VERSION}/:file`]: (req: Request & { params: { file: string } }) => {
    const { file } = req.params;
    const pkg = FONT_PACKAGE.get(file);
    if (pkg === undefined) return notFound();
    return serveFile(fontPath(file, pkg), "font/woff2");
  },
  [`/assets/flags/${FLAG_ASSET_VERSION}/:file`]: (req: Request & { params: { file: string } }) => {
    const { file } = req.params;
    const { dir, files } = flags();
    if (!files.has(file)) return notFound();
    return serveFile(join(dir, file), "image/svg+xml", {
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    });
  },
};
