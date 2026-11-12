/**
 * Pixel-art player figures of the live match (10.7): side-view figures standing on the game's top-down pitch, built
 * from a bought pack (`data_process/assets/pixel_players/build_pixel_players.py`). The atlas and its description live
 * on the art volume (`art/sprites/`), never in the repository: the pack may not be redistributed.
 *
 * - `art/sprites/pixel-players.json` (fixed name) points to the description: `{ "data": "sprites/<name>.json" }`;
 * - the description (`PixelAtlas`) names its image and lists layers, pieces, frames and clips.
 *
 * The server validates both with the parsers here and announces `{ data, image }` in the art manifest; without a
 * valid atlas the option does not exist. A changed atlas gets a new name (the art URLs are cached forever).
 */

/** One animation: frame indexes, seconds per frame, and whether it loops. */
export interface PixelClip {
  frames: number[];
  dur: number;
  loop?: boolean;
}

/** One piece of a frame: a layer's trimmed image and where it sits relative to the feet (px, y up is negative). */
export interface PixelPart {
  layer: number;
  rect: number;
  x: number;
  y: number;
}

export interface PixelAtlas {
  /** Image path inside `art/` (`sprites/<name>.png`). */
  image: string;
  /** Width and height of a standing figure (px): the zoom and what sits over the head follow them. */
  body: number;
  height: number;
  /** Tint layers, in drawing order (`skin`, `socks`, `boots`, `shorts`, `shirt`, `gloves`, `hair0`…, `vfx`). */
  layers: string[];
  /** The pieces in the image: x, y, width, height. */
  rects: (readonly [number, number, number, number])[];
  frames: PixelPart[][];
  clips: Record<string, PixelClip>;
}

/** What the art manifest announces: the paths of the description and of its image. */
export interface PixelSpritePointer {
  data: string;
  image: string;
}

/** Clips every atlas must have; the others fall back to these. */
export const PIXEL_REQUIRED_CLIPS = ["idle", "walk", "run", "kick"] as const;
/** Layers every atlas must have. */
export const PIXEL_REQUIRED_LAYERS = ["skin", "socks", "shorts", "shirt"] as const;

export const PIXEL_LIMITS = { LAYERS: 24, RECTS: 8192, FRAMES: 1024, PARTS: 24, CLIPS: 64, CLIP_FRAMES: 32, IMAGE_PX: 4096, OFFSET: 256 } as const;

const IMAGE_RE = /^sprites\/[A-Za-z0-9_-]{1,64}\.png$/;
const DATA_RE = /^sprites\/[A-Za-z0-9_-]{1,64}\.json$/;
const NAME_RE = /^[A-Za-z][A-Za-z0-9]{0,31}$/;

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** `sprites/<name>.json` of a pointer file (`{ data }`), or null. The fixed-name pointer itself is never a target. */
export function parsePixelDataPath(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const data = (raw as Record<string, unknown>).data;
  return typeof data === "string" && DATA_RE.test(data) && data !== "sprites/pixel-players.json" ? data : null;
}

/** The manifest's pointer, or null. */
export function parsePixelPointer(raw: unknown): PixelSpritePointer | null {
  const data = parsePixelDataPath(raw);
  const image = raw && typeof raw === "object" ? (raw as Record<string, unknown>).image : null;
  return data && typeof image === "string" && IMAGE_RE.test(image) ? { data, image } : null;
}

/** The description of an atlas, or null when anything in it is off (the option then does not exist). */
export function parsePixelAtlas(raw: unknown): PixelAtlas | null {
  const L = PIXEL_LIMITS;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.image !== "string" || !IMAGE_RE.test(r.image)) return null;
  const body = int(r.body, 4, 128), height = int(r.height, 4, 128);
  if (body === null || height === null) return null;

  if (!Array.isArray(r.layers) || r.layers.length === 0 || r.layers.length > L.LAYERS) return null;
  if (!r.layers.every((n) => typeof n === "string" && NAME_RE.test(n)) || new Set(r.layers).size !== r.layers.length) return null;
  const layers = r.layers as string[];
  for (const need of PIXEL_REQUIRED_LAYERS) if (!layers.includes(need)) return null;

  if (!Array.isArray(r.rects) || r.rects.length === 0 || r.rects.length > L.RECTS) return null;
  const rects: [number, number, number, number][] = [];
  for (const q of r.rects) {
    if (!Array.isArray(q) || q.length !== 4) return null;
    const x = int(q[0], 0, L.IMAGE_PX), y = int(q[1], 0, L.IMAGE_PX), w = int(q[2], 1, L.IMAGE_PX), h = int(q[3], 1, L.IMAGE_PX);
    if (x === null || y === null || w === null || h === null || x + w > L.IMAGE_PX || y + h > L.IMAGE_PX) return null;
    rects.push([x, y, w, h]);
  }

  if (!Array.isArray(r.frames) || r.frames.length === 0 || r.frames.length > L.FRAMES) return null;
  const frames: PixelPart[][] = [];
  for (const f of r.frames) {
    if (!Array.isArray(f) || f.length % 4 !== 0 || f.length > L.PARTS * 4) return null;
    const parts: PixelPart[] = [];
    for (let i = 0; i < f.length; i += 4) {
      const layer = int(f[i], 0, layers.length - 1), rect = int(f[i + 1], 0, rects.length - 1);
      const x = int(f[i + 2], -L.OFFSET, L.OFFSET), y = int(f[i + 3], -L.OFFSET, L.OFFSET);
      if (layer === null || rect === null || x === null || y === null) return null;
      parts.push({ layer, rect, x, y });
    }
    frames.push(parts);
  }

  if (!r.clips || typeof r.clips !== "object") return null;
  const entries = Object.entries(r.clips as Record<string, unknown>);
  if (entries.length > L.CLIPS) return null;
  const clips: Record<string, PixelClip> = {};
  for (const [name, c] of entries) {
    if (!NAME_RE.test(name) || !c || typeof c !== "object") return null;
    const cl = c as Record<string, unknown>;
    if (!Array.isArray(cl.frames) || cl.frames.length === 0 || cl.frames.length > L.CLIP_FRAMES) return null;
    if (!cl.frames.every((f) => int(f, 0, frames.length - 1) !== null)) return null;
    if (typeof cl.dur !== "number" || !(cl.dur >= 0.02 && cl.dur <= 5)) return null;
    clips[name] = { frames: cl.frames as number[], dur: cl.dur, ...(cl.loop === true ? { loop: true } : {}) };
  }
  for (const need of PIXEL_REQUIRED_CLIPS) if (!clips[need]) return null;
  return { image: r.image, body, height, layers, rects, frames, clips };
}

let current: PixelSpritePointer | null = null;

/** The atlas the server announced for this page (null = no pixel figures). */
export function pixelSprite(): PixelSpritePointer | null {
  return current;
}

export function setPixelSprite(raw: unknown): void {
  current = parsePixelPointer(raw);
}
