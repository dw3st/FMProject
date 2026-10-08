/**
 * The human manager's avatar (Etapa 31b): a seed for the facesjs draw plus the traits the player
 * picked in the new-game editor. Saved in `SaveMeta.manager.face` as parameters only, never the SVG;
 * the SVG is rendered on the server (`GET /api/faces/manager/avatar.svg`).
 *
 * Pure and tiny (no facesjs import): the client builds the URL from it.
 */
import {
  HAIR_COLORS,
  HAIR_IDS,
  FACIAL_HAIR_IDS,
  type BeardKind,
  type HairColor,
  type HairLength,
  type SkinTone,
} from "@/Domain/faces/faceTraits";

export interface ManagerFace {
  /** facesjs draw (everything not picked below). */
  seed: number;
  skin?: SkinTone;
  hairColor?: HairColor;
  hairLength?: HairLength;
  beard?: BeardKind;
  glasses?: boolean;
}

export const MAX_FACE_SEED = 2_147_483_647;

export const SKIN_TONES: readonly SkinTone[] = [1, 2, 3, 4, 5, 6, 7];
export const HAIR_COLOR_KEYS = Object.keys(HAIR_COLORS) as HairColor[];
export const HAIR_LENGTH_KEYS = Object.keys(HAIR_IDS) as HairLength[];
export const BEARD_KEYS = Object.keys(FACIAL_HAIR_IDS) as BeardKind[];

/** A fresh seed for "Sortear" (client side; any integer in range is valid). */
export function randomFaceSeed(random: () => number = Math.random): number {
  return Math.floor(random() * MAX_FACE_SEED);
}

function isSeed(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_FACE_SEED;
}

/**
 * Validates a face from a request body (new game). `undefined` = no face given (allowed); `null` =
 * invalid (400).
 */
export function parseManagerFace(raw: unknown): ManagerFace | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const known = new Set(["seed", "skin", "hairColor", "hairLength", "beard", "glasses"]);
  if (Object.keys(r).some((k) => !known.has(k))) return null;
  if (!isSeed(r.seed)) return null;
  const face: ManagerFace = { seed: r.seed };
  if (r.skin !== undefined) {
    if (!SKIN_TONES.includes(r.skin as SkinTone)) return null;
    face.skin = r.skin as SkinTone;
  }
  if (r.hairColor !== undefined) {
    if (!HAIR_COLOR_KEYS.includes(r.hairColor as HairColor)) return null;
    face.hairColor = r.hairColor as HairColor;
  }
  if (r.hairLength !== undefined) {
    if (!HAIR_LENGTH_KEYS.includes(r.hairLength as HairLength)) return null;
    face.hairLength = r.hairLength as HairLength;
  }
  if (r.beard !== undefined) {
    if (!BEARD_KEYS.includes(r.beard as BeardKind)) return null;
    face.beard = r.beard as BeardKind;
  }
  if (r.glasses !== undefined) {
    if (typeof r.glasses !== "boolean") return null;
    face.glasses = r.glasses;
  }
  return face;
}

/** Query string of a manager face (the avatar route). Absent traits are left out. */
export function managerFaceQuery(face: ManagerFace): URLSearchParams {
  const p = new URLSearchParams();
  p.set("seed", String(face.seed));
  if (face.skin) p.set("skin", String(face.skin));
  if (face.hairColor) p.set("hc", face.hairColor);
  if (face.hairLength) p.set("hl", face.hairLength);
  if (face.beard) p.set("beard", face.beard);
  if (face.glasses !== undefined) p.set("glasses", face.glasses ? "1" : "0");
  return p;
}

/** Reads the face back from the avatar route's query; `null` when any value is invalid. */
export function parseManagerFaceQuery(search: URLSearchParams): ManagerFace | null {
  const seedRaw = search.get("seed");
  if (seedRaw === null || !/^\d{1,10}$/.test(seedRaw)) return null;
  const raw: Record<string, unknown> = { seed: Number(seedRaw) };
  const skin = search.get("skin");
  if (skin !== null) {
    if (!/^\d$/.test(skin)) return null;
    raw.skin = Number(skin);
  }
  const hc = search.get("hc");
  if (hc !== null) raw.hairColor = hc;
  const hl = search.get("hl");
  if (hl !== null) raw.hairLength = hl;
  const beard = search.get("beard");
  if (beard !== null) raw.beard = beard;
  const glasses = search.get("glasses");
  if (glasses !== null) {
    if (glasses !== "0" && glasses !== "1") return null;
    raw.glasses = glasses === "1";
  }
  return parseManagerFace(raw) ?? null;
}

/** New-game nationality (ISO code) → the country name the face regions use (`faceProfile.ts`). */
const COUNTRY_OF_ISO: Record<string, string> = {
  br: "Brazil", pt: "Portugal", es: "Spain", it: "Italy", de: "Germany", fr: "France",
  gb: "England", ar: "Argentina", nl: "Netherlands", us: "USA",
};

export function managerFaceCountry(nationalityIso: string | null | undefined): string | null {
  return (nationalityIso && COUNTRY_OF_ISO[nationalityIso.toLowerCase()]) || null;
}
