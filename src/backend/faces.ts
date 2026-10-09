/**
 * `GET /api/faces/:playerId.svg?v=&nat=&colors=` — a player's generated face (and, since Etapa 31b,
 * `/api/faces/person/:id.svg` for staff and managers and `/api/faces/manager/avatar.svg` for the human
 * manager's avatar), rendered with
 * facesjs on the server so it never weighs on a page bundle (the client is just an `<img>`, see
 * `PlayerFace`). Public: the SVG is a pure function of the query, no save data is read.
 *
 * Deterministic → cached in memory (bounded) and sent as `immutable` for a year; the URL carries
 * `FACE_VERSION`, so a face change is a new URL.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { croppedPlayerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import { croppedPersonFaceSvg } from "@/Domain/faces/personFaceSvg";
import { managerFaceQuery, parseManagerFaceQuery, type ManagerFace } from "@/Domain/faces/managerFace";
import type { FaceTraits } from "@/Domain/faces/faceTraits";
import { faceRegionOf } from "@/Domain/faces/faceProfile";
import {
  FACE_COLOR_RE,
  FACE_ID_RE,
  MAX_FACE_COLORS,
  MAX_FACE_AGE,
  MAX_FACE_NATIONALITY,
  MIN_FACE_AGE,
} from "@/Domain/faces/faceUrl";

const MAX_CACHE = 2000;

/**
 * Real players' face traits (pilot, `scripts/extractFaceTraits.ts`): world data, read once from
 * `src/Data/faceTraits.json`. Missing file = no traits (every face is the seeded draw).
 */
const TRAITS_FILE = fileURLToPath(new URL("../Data/faceTraits.json", import.meta.url));
let traitsMap: Record<string, FaceTraits> | null = null;
function faceTraitsOf(playerId: string): FaceTraits | undefined {
  if (!traitsMap) {
    try {
      traitsMap = JSON.parse(readFileSync(TRAITS_FILE, "utf8")) as Record<string, FaceTraits>;
    } catch {
      traitsMap = {};
    }
  }
  return Object.hasOwn(traitsMap, playerId) ? traitsMap[playerId] : undefined;
}
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
  const nationality = parseNationality(search);
  const colors = parseColors(search);
  return { playerId, nationality, colors };
}

/** Bounded LRU over every face kind (keys are prefixed by kind). */
function cached(key: string, render: () => string): string {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Refresh recency (Map keeps insertion order → oldest first).
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const svg = render();
  cache.set(key, svg);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  return svg;
}

const colorsKey = (colors: (string | undefined)[]) => colors.map((c) => c ?? "").join(",");

function renderFace(req: FaceRequest): string {
  // The face depends on the nationality only through its region, so key on the region: arbitrary
  // `nat` strings can't each take a cache slot for the same SVG.
  const key = `player|${req.playerId}|${faceRegionOf(req.nationality)}|${colorsKey(req.colors)}`;
  return cached(key, () => croppedPlayerFaceSvg(req.playerId, req.nationality, req.colors, faceTraitsOf(req.playerId)));
}

function parseColors(search: URLSearchParams): (string | undefined)[] {
  return (search.get("colors") ?? "")
    .split(",")
    .filter((c) => c.length > 0)
    .slice(0, MAX_FACE_COLORS)
    .map((c) => (FACE_COLOR_RE.test(c) ? `#${c.replace(/^#/, "")}` : undefined));
}

function parseNationality(search: URLSearchParams): string | null {
  const nat = search.get("nat")?.trim();
  return nat ? nat.slice(0, MAX_FACE_NATIONALITY) : null;
}

export interface PersonFaceRequest {
  personId: string;
  nationality: string | null;
  colors: (string | undefined)[];
  age: number | null;
  /** `g=f`: a woman's face (referees). */
  female?: boolean;
}

/**
 * `GET /api/faces/person/:id.svg?v=&nat=&colors=&age=&g=` (staff member / manager). `"notFound"` for a
 * bad file name, `"badRequest"` for an invalid age.
 */
export function parsePersonFaceRequest(file: string, search: URLSearchParams): PersonFaceRequest | "notFound" | "badRequest" {
  if (!file.endsWith(".svg")) return "notFound";
  const personId = file.slice(0, -4);
  if (!FACE_ID_RE.test(personId)) return "notFound";
  let age: number | null = null;
  const ageRaw = search.get("age");
  if (ageRaw !== null) {
    if (!/^\d{1,3}$/.test(ageRaw)) return "badRequest";
    age = Number(ageRaw);
    if (age < MIN_FACE_AGE || age > MAX_FACE_AGE) return "badRequest";
  }
  const g = search.get("g");
  if (g !== null && g !== "f") return "badRequest";
  return { personId, nationality: parseNationality(search), colors: parseColors(search), age, ...(g === "f" ? { female: true } : {}) };
}

function renderPersonFace(req: PersonFaceRequest): string {
  const key = `person|${req.personId}|${faceRegionOf(req.nationality)}|${colorsKey(req.colors)}|${req.age ?? ""}|${req.female ? "f" : ""}`;
  return cached(key, () => croppedPersonFaceSvg(req.personId, req.nationality, req.colors, { age: req.age, ...(req.female ? { female: true } : {}) }));
}

export interface ManagerAvatarRequest {
  face: ManagerFace;
  nationality: string | null;
  colors: (string | undefined)[];
}

/** `GET /api/faces/manager/avatar.svg?seed=&skin=&hc=&hl=&beard=&glasses=&nat=&colors=`; `null` = 400. */
export function parseManagerAvatarRequest(search: URLSearchParams): ManagerAvatarRequest | null {
  const face = parseManagerFaceQuery(search);
  if (!face) return null;
  return { face, nationality: parseNationality(search), colors: parseColors(search) };
}

function renderManagerAvatar(req: ManagerAvatarRequest): string {
  const key = `manager|${managerFaceQuery(req.face).toString()}|${faceRegionOf(req.nationality)}|${colorsKey(req.colors)}`;
  return cached(key, () => croppedPersonFaceSvg("avatar", req.nationality, req.colors, { custom: req.face }));
}

const SVG_HEADERS = {
  "content-type": "image/svg+xml",
  "cache-control": "public, max-age=31536000, immutable",
  "x-content-type-options": "nosniff",
  // Opened directly, the SVG must not run scripts or load anything; facesjs uses inline styles.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
};

export const faceRoutes = {
  "/api/faces/:file": (req: Request & { params: { file: string } }) => {
    // Bun already percent-decodes route params; decoding again would turn `%25zz` into a URIError.
    const parsed = parseFaceRequest(req.params.file, new URL(req.url).searchParams);
    if (!parsed) return new Response("Not found", { status: 404 });
    return new Response(renderFace(parsed), { headers: SVG_HEADERS });
  },
  /** Coaching staff and AI managers (Etapa 31b): pure function of the query, like the players. */
  "/api/faces/person/:file": (req: Request & { params: { file: string } }) => {
    const parsed = parsePersonFaceRequest(req.params.file, new URL(req.url).searchParams);
    if (parsed === "notFound") return new Response("Not found", { status: 404 });
    if (parsed === "badRequest") return new Response("Bad request", { status: 400 });
    return new Response(renderPersonFace(parsed), { headers: SVG_HEADERS });
  },
  /** The human manager's avatar from its saved parameters (new-game editor preview and in game). */
  "/api/faces/manager/:file": (req: Request & { params: { file: string } }) => {
    if (req.params.file !== "avatar.svg") return new Response("Not found", { status: 404 });
    const parsed = parseManagerAvatarRequest(new URL(req.url).searchParams);
    if (!parsed) return new Response("Bad request", { status: 400 });
    return new Response(renderManagerAvatar(parsed), { headers: SVG_HEADERS });
  },
};
