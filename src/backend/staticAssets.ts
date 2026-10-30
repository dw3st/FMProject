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
import enLocale from "@/i18n/locales/en.json";
import ptLocale from "@/i18n/locales/pt-BR.json";
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

/** The pack's tab and inbox icons (art phase 9): `icons/tab-*.svg`, `icons/inbox-*.svg`. */
function iconFiles(): string[] {
  try {
    return readdirSync(join(import.meta.dir, "..", "example_data", "assets", "icons"));
  } catch {
    return [];
  }
}
const ICON_FILES: Record<string, string> = Object.fromEntries(
  iconFiles()
    .filter((f) => /^(tab|inbox)-[a-z0-9-]+\.svg$/.test(f))
    .map((f) => [`icons/${f}`, "image/svg+xml"]),
);

/** The game art the pages load (art plan phase 2: the players' and keepers' sprite atlases). */
export const GAME_ART_FILES: Record<string, string> = {
  "player/player-atlas.json": "application/json",
  "player/player-atlas.png": "image/png",
  "player/disc-rim.png": "image/png",
  "flag/corner-cloth.png": "image/png",
  "flag/corner-pole.png": "image/png",
  "keeper/keeper-atlas.json": "application/json",
  "keeper/keeper-atlas.png": "image/png",
  "officials/officials-atlas.json": "application/json",
  "officials/officials-atlas.png": "image/png",
  "crowd/crowd-atlas.json": "application/json",
  "crowd/crowd-atlas.png": "image/png",
  "backgrounds/bg-landing.webp": "image/webp",
  "backgrounds/bg-new-game.webp": "image/webp",
  "medals/medal-bronze.svg": "image/svg+xml",
  "medals/medal-silver.svg": "image/svg+xml",
  "medals/medal-gold.svg": "image/svg+xml",
  "medals/medal-secret.svg": "image/svg+xml",
  "frames/frame-bronze.svg": "image/svg+xml",
  "frames/frame-silver.svg": "image/svg+xml",
  "frames/frame-gold.svg": "image/svg+xml",
  "frames/frame-legend.svg": "image/svg+xml",
  // Facility items under works (4.41.20): painted construction overlays.
  "facilities-works/works-outdoor.webp": "image/webp",
  "facilities-works/works-indoor.webp": "image/webp",
  // Club screen (4.41.21): the painted stadium behind the stand map, plain grass for an unmown turf preview.
  "club/stadium-top.webp": "image/webp",
  "club/grass-plain.webp": "image/webp",
  "formation/pitch-board.webp": "image/webp",
  // Live substitution panel: the same painted board, landscape (attack to the right).
  "formation/pitch-board-wide.webp": "image/webp",
  // Art phase 9: the rest of the pack.
  "ball/ball-atlas.json": "application/json",
  "ball/ball-atlas.png": "image/png",
  "goal/goal-frame.png": "image/png",
  "goal/goal-net.png": "image/png",
  "effects/firework-atlas.json": "application/json",
  "effects/firework-atlas.png": "image/png",
  "effects/flash-atlas.json": "application/json",
  "effects/flash-atlas.png": "image/png",
  "effects/smoke-atlas.json": "application/json",
  "effects/smoke-atlas.png": "image/png",
  "stadium/floodlight-tower.png": "image/png",
  "stadium/led-board-frame.png": "image/png",
  "led/led-frame.png": "image/png",
  "stadium/tunnel.png": "image/png",
  "stadium/bench.png": "image/png",
  "stadium/bench-roof.png": "image/png",
  "stadium/stand-block.png": "image/png",
  "stadium/stand-block-empty.png": "image/png",
  "stadium/stand-block-construction.png": "image/png",
  "player/player-real-atlas.json": "application/json",
  "player/player-real-atlas.png": "image/png",
  "pitch/grass-a.png": "image/png",
  "pitch/grass-b.png": "image/png",
  "pitch/grass-c.png": "image/png",
  "pitch/grass-worn.png": "image/png",
  "pitch/grass-muddy.png": "image/png",
  "brand/wordmark.svg": "image/svg+xml",
  "brand/icon.svg": "image/svg+xml",
  "brand/favicon-32.png": "image/png",
  "brand/favicon-512.png": "image/png",
  "brand/og-image.png": "image/png",
  ...ICON_FILES,
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

/** Locale texts, fetched by the page for the active language only (perf audit 4.41.29: both were in every bundle). */
const LOCALES: Record<string, unknown> = { "en.json": enLocale, "pt-BR.json": ptLocale };
const localeBodies = new Map<string, string>();

export const staticAssetRoutes = {
  // The game version is in the path (`/assets/i18n/<version>/<lang>.json`), so the answer never changes for a URL.
  "/assets/i18n/:ver/:file": (req: Request & { params: { ver: string; file: string } }) => {
    const data = LOCALES[req.params.file];
    if (!data) return notFound();
    let body = localeBodies.get(req.params.file);
    if (!body) { body = JSON.stringify(data); localeBodies.set(req.params.file, body); }
    return new Response(body, {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": CACHE_FOREVER, "X-Content-Type-Options": "nosniff" },
    });
  },
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
