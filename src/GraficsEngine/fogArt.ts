/**
 * The art pack's fog texture (`backdrops/match/fog.webp`, art phase 9): grey levels = thickness. Turned into a pale
 * blue-grey whose alpha is the grey level, as in the art preview, and drawn in two drifting layers.
 */
import { Texture } from "pixi.js";
import { loadImage } from "@/GraficsEngine/playerFaces";

export const FOG = {
  /** Fog colour (the preview's 214, 222, 235). */
  RGB: [214, 222, 235] as const,
  /** Two layers: tile scale, drift (px per second of the effects clock), alpha. */
  LAYERS: [{ scale: 2.6, drift: 7, alpha: 0.42 }, { scale: 1.7, drift: -11, alpha: 0.3 }] as const,
} as const;

/** The coloured fog texture, or null when the image does not load. */
export async function fogTexture(url: string): Promise<Texture | null> {
  const img = await loadImage(url);
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = d.data[i]!;
    d.data[i] = FOG.RGB[0]; d.data[i + 1] = FOG.RGB[1]; d.data[i + 2] = FOG.RGB[2]; d.data[i + 3] = v;
  }
  g.putImageData(d, 0, 0);
  return Texture.from(c);
}
