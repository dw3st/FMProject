/**
 * `GET /api/faces/:playerId.svg?v=&nat=&colors=` — a player's generated face, rendered with
 * facesjs on the server so it never weighs on a page bundle (the client is just an `<img>`, see
 * `PlayerFace`). Public: the SVG is a pure function of the query, no save data is read.
 *
 * Deterministic → cached in memory (bounded) and sent as `immutable` for a year; the URL carries
 * `FACE_VERSION`, so a face change is a new URL.
 */
import { croppedPlayerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import { faceRegionOf } from "@/Domain/faces/faceProfile";
import {
  FACE_COLOR_RE,
  FACE_ID_RE,
  MAX_FACE_COLORS,
  MAX_FACE_NATIONALITY,
} from "@/Domain/faces/faceUrl";

const MAX_CACHE = 2000;
const cache = new Map<string, string>();

export interface FaceRequest {
  playerId: string;
  nationality: string | null;
  colors: (string | undefined)[];
}

/** Parses `:file` + query; `null` when the id is not a valid `<id>.svg`. Bad colours fall back. */
export function parseFaceRequest(file: string, search: URLSearchParams): FaceRequest | null {
  if (!file.endsWith(".svg")) return null;
  const playerId = file.slice(0, -4);
  if (!FACE_ID_RE.test(playerId)) return null;
  const nat = search.get("nat")?.trim();
  const nationality = nat ? nat.slice(0, MAX_FACE_NATIONALITY) : null;
  const colors = (search.get("colors") ?? "")
    .split(",")
    .filter((c) => c.length > 0)
    .slice(0, MAX_FACE_COLORS)
    .map((c) => (FACE_COLOR_RE.test(c) ? `#${c.replace(/^#/, "")}` : undefined));
  return { playerId, nationality, colors };
}

export function renderFace(req: FaceRequest): string {
  // The face depends on the nationality only through its region, so key on the region: arbitrary
  // `nat` strings can't each take a cache slot for the same SVG.
  const key = `${req.playerId}|${faceRegionOf(req.nationality)}|${req.colors.map((c) => c ?? "").join(",")}`;
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Refresh recency (Map keeps insertion order → oldest first).
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const svg = croppedPlayerFaceSvg(req.playerId, req.nationality, req.colors);
  cache.set(key, svg);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return svg;
}

export const faceRoutes = {
  "/api/faces/:file": (req: Request & { params: { file: string } }) => {
    // Bun already percent-decodes route params; decoding again would turn `%25zz` into a URIError.
    const parsed = parseFaceRequest(req.params.file, new URL(req.url).searchParams);
    if (!parsed) return new Response("Not found", { status: 404 });
    return new Response(renderFace(parsed), {
      headers: {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        // Opened directly, the SVG must not run scripts or load anything; facesjs uses inline styles.
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  },
};
