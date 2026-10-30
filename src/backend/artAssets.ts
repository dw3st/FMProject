/**
 * The new art (`C:\projects\fmproject-art-handoff`, decisions 1–4): files on the persistent volume, in
 * `${RUNTIME_DATA_DIR}/art/`, never in the image nor the page bundle.
 *
 * - `GET /assets/art/v3/<path>`: only a path listed in `art/index.json` (a whitelist, never a free path), cached
 *   forever (the version in the URL changes with the art).
 * - `GET /api/art/faces`: the ids that have a painted face (players, the human manager's combinations, referees),
 *   only when the painted faces are switched on (`ART_FACES=1`): they come from real players' features, so the owner
 *   decides before they go public. Off = empty lists, and every face stays the SVG one. Also the painted match
 *   backdrops (`backdrops`), unless the new visual is switched off (`ART_VISUAL=0`).
 *
 * The index is re-read when the file's modification time changes (a new art sync needs no restart).
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";
import { ART_ASSET_VERSION, type ArtManifest, type PaintedFaceIds } from "@/Domain/art/paintedFaces";

const CACHE_FOREVER = "public, max-age=31536000, immutable";
const CONTENT_TYPE: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" };

interface ArtIndex {
  paths: Set<string>;
  faces: PaintedFaceIds;
  /** Painted match backdrops (`backdrops/match/<id>.webp`). */
  backdrops: string[];
  /** Painted penalty backdrops (`backdrops/penalty/<id>.webp`, art phase 6). */
  penalty: string[];
  /** Painted facilities (`facilities/<id>.webp`) and inbox illustrations (`news/<id>.webp`, art phase 7). */
  facilities: string[];
  news: string[];
}

let cache: { mtimeMs: number; dir: string; index: ArtIndex } | null = null;

/** Tests only: another art folder (null = the runtime one). */
let dirOverride: string | null = null;
export function setArtDirForTests(dir: string | null): void {
  dirOverride = dir;
  cache = null;
}

function artDir(): string {
  return dirOverride ?? join(RUNTIME_DATA_DIR, "art");
}

/** Every string value of the index (nested maps), each one a file path relative to `art/`. */
function collectPaths(node: unknown, out: Set<string>): void {
  if (typeof node === "string") out.add(node);
  else if (node && typeof node === "object") for (const v of Object.values(node)) collectPaths(v, out);
}

/** A file name the URL can carry: no `..`, no backslash, no leading slash. */
const SAFE_PATH = /^(?!.*\.\.)[A-Za-z0-9_\-./]+$/;

/** The ids of a face map whose path follows the convention the client builds (`faces/<kind>/<id>.webp`). */
function idsAt(map: unknown, folder: string): string[] {
  if (!map || typeof map !== "object") return [];
  return Object.entries(map as Record<string, unknown>)
    .filter(([id, path]) => path === `${folder}/${id}.webp`)
    .map(([id]) => id);
}

function loadIndex(): ArtIndex | null {
  const dir = artDir();
  const file = join(dir, "index.json");
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = null;
    return null;
  }
  if (cache && cache.dir === dir && cache.mtimeMs === mtimeMs) return cache.index;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const paths = new Set<string>();
    collectPaths({ ...raw, version: undefined }, paths);
    for (const p of [...paths]) if (!SAFE_PATH.test(p) || p.startsWith("/")) paths.delete(p);
    const faces = (raw.faces ?? {}) as Record<string, unknown>;
    const backdrops = (raw.backdrops ?? {}) as Record<string, unknown>;
    const index: ArtIndex = {
      paths,
      faces: {
        players: idsAt(faces.players, "faces/players"),
        coaches: idsAt(faces.coaches, "faces/coaches"),
        referees: idsAt(faces.referees, "faces/referees"),
      },
      backdrops: idsAt(backdrops.match, "backdrops/match"),
      penalty: idsAt(backdrops.penalty, "backdrops/penalty"),
      facilities: idsAt(raw.facilities, "facilities"),
      news: idsAt(raw.news, "news"),
    };
    cache = { mtimeMs, dir, index };
    return index;
  } catch {
    return cache?.index ?? null;
  }
}

/** The painted faces are on (`ART_FACES=1`, decision 4). */
export function paintedFacesEnabled(): boolean {
  return process.env.ART_FACES === "1";
}

/** The new pitch art (painted turf, phase 1) is on unless `ART_VISUAL=0`: the switch to go back without a rebuild. */
export function newVisualEnabled(): boolean {
  return process.env.ART_VISUAL !== "0";
}

const notFound = () => new Response("Not found", { status: 404 });

const PREFIX = `/assets/art/${ART_ASSET_VERSION}/`;

export const artAssetRoutes = {
  [`${PREFIX}*`]: (req: Request) => {
    const path = decodeURIComponent(new URL(req.url).pathname.slice(PREFIX.length));
    const index = loadIndex();
    if (!index || !index.paths.has(path)) return notFound();
    const type = CONTENT_TYPE[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
    if (!type) return notFound();
    const file = Bun.file(join(artDir(), path));
    return file.exists().then((ok) => ok
      ? new Response(file, {
        headers: { "Content-Type": type, "Cache-Control": CACHE_FOREVER, "X-Content-Type-Options": "nosniff" },
      })
      : notFound());
  },
  "/api/art/faces": () => {
    const index = loadIndex();
    const faces: PaintedFaceIds = index && paintedFacesEnabled() ? index.faces : { players: [], coaches: [], referees: [] };
    const visual = newVisualEnabled();
    const body: ArtManifest = {
      ...faces,
      backdrops: index && visual ? index.backdrops : [],
      penaltyBackdrops: index && visual ? index.penalty : [],
      facilities: index && visual ? index.facilities : [],
      news: index && visual ? index.news : [],
      visual,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-cache" } });
  },
};
