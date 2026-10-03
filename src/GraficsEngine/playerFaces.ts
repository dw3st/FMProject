/**
 * Player faces on the Pixi pitch (#61). The generated face SVG (`GET /api/faces/:id.svg`, see
 * `src/Domain/faces/faceUrl.ts`) is decoded once and rasterised into a small square canvas,
 * already clipped to a circle — so each marker is a plain sprite, with no per-frame stencil mask.
 *
 * The rasterised canvases are cached for the whole page by `url@size`: `PixiPitch` remounts on
 * every resize and a substitute reuses a face that is already loaded, so each face is fetched and
 * decoded once per match. Pixi textures are per application and are owned by the caller.
 */

/**
 * Player marker radius in px. Was a flat 14; now follows the pitch scale (~2.3 yds) so the face
 * inside stays legible (#61), clamped to 16..20 px: a small pitch still gets a bigger dot than
 * before, and a very large one doesn't crowd the players together.
 */
export function playerMarkerRadius(scale: number): number {
  return Math.max(16, Math.min(20, Math.round(scale * 2.3)));
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
