/**
 * Player faces on the Pixi pitch (#61). The generated face SVG (`GET /api/faces/:id.svg`, see
 * `src/Domain/faces/faceUrl.ts`) is decoded once and rasterised into a small square canvas,
 * already clipped to a circle — so each marker is a plain sprite, with no per-frame stencil mask.
 *
 * The rasterised canvases are cached for the whole page by `url@size`: `PixiPitch` remounts on
 * every resize and a substitute reuses a face that is already loaded, so each face is fetched and
 * decoded once per match. Pixi textures are per application and are owned by the caller.
 */

const MARKER_RADIUS_MIN = 16;
const MARKER_RADIUS_MAX = 30;

/**
 * Player marker radius in px. Was a flat 14; follows the pitch scale (~2.3 yds) so the face
 * inside stays legible (#61). Clamped to 16..30 px: a small pitch still gets a readable dot, and
 * a very large pitch gets proportionally bigger dots instead of stopping at 20 px.
 */
export function playerMarkerRadius(scale: number): number {
  return Math.max(MARKER_RADIUS_MIN, Math.min(MARKER_RADIUS_MAX, Math.round(scale * 2.3)));
}

/** Name label font size for a marker radius: 11 px on the smallest dots, growing slowly with them. */
export function markerLabelFontSize(radius: number): number {
  return Math.round(11 + Math.max(0, radius - MARKER_RADIUS_MIN) * 0.25);
}

/** Pitch background colour (`PixiPitch` → `app.init({ background })`). */
export const PITCH_COLOR = 0x0b6b2f;

function channels(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** WCAG relative luminance of a 0xRRGGBB colour. */
function relativeLuminance(hex: number): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1 = identical, 21 = black on white). */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Perceptual-ish RGB distance ("redmean"), 0..~765. */
export function colorDistance(a: number, b: number): number {
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/**
 * True when a team colour would blend into the pitch (e.g. a dark green kit): close in both
 * brightness and hue. Such a team's markers get a thin light outline so they stay visible. A red
 * or blue kit is as dark as the grass but clearly a different colour, so it needs nothing.
 */
export function needsLightOutline(teamColor: number, pitchColor: number = PITCH_COLOR): boolean {
  return contrastRatio(teamColor, pitchColor) < 1.6 && colorDistance(teamColor, pitchColor) < 160;
}

const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

/** Pixel size of the rasterised face for a marker of `radius` logical px at `resolution`. */
export function faceRasterSize(radius: number, resolution: number): number {
  return Math.max(16, Math.round(radius * 2 * Math.max(1, resolution)));
}

async function rasterise(url: string, size: number): Promise<HTMLCanvasElement | null> {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
    return canvas;
  } catch {
    // Network error, 4xx or an undecodable image: the marker keeps its plain circle.
    return null;
  }
}

/** Circular face canvas for `url`, or null when it can't be loaded. Cached by `url@size`. */
export function loadFaceCanvas(url: string, size: number): Promise<HTMLCanvasElement | null> {
  const key = `${url}@${size}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = rasterise(url, size);
    cache.set(key, pending);
    // A failed load is not cached forever: the next match (or remount) may try again.
    pending.then((c) => { if (!c) cache.delete(key); });
  }
  return pending;
}
