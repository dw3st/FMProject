/**
 * Photo grass textures of the art pack (`assets/pitch/*.png`, 4.41.17, tester request): tiled under the drawn turf
 * when the painted pitch is not used (plain mowing, no art volume, new visual off). Pure: which texture and how
 * strong, by the grass type and the condition band.
 */
import type { PitchSurfaceInput } from "@/GraficsEngine/pitchSurface";

export const GRASS_PHOTO = {
  /** Texture tile in pitch yards (512 px). */
  TILE_YDS: 12,
  ALPHA: 0.5,
  /** Synthetic turf: the even texture, a bright green tint. */
  SYNTHETIC_TINT: 0x7fd99a,
} as const;

export type GrassPhotoId = "grass-a" | "grass-b" | "grass-c" | "grass-worn" | "grass-muddy";

export function grassPhoto(input: Pick<PitchSurfaceInput, "condition" | "turf">): { id: GrassPhotoId; tint: number } {
  if (input.turf !== "synthetic") {
    if (input.condition < 15) return { id: "grass-muddy", tint: 0xffffff };
    if (input.condition < 40) return { id: "grass-worn", tint: 0xffffff };
  }
  if (input.turf === "synthetic") return { id: "grass-c", tint: GRASS_PHOTO.SYNTHETIC_TINT };
  if (input.turf === "hybrid") return { id: "grass-b", tint: 0xffffff };
  return { id: "grass-a", tint: 0xffffff };
}
