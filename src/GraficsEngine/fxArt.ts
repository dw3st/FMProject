/**
 * The art pack's effect atlases (art phase 9, `src/example_data/assets/effects`): firework bursts (4 styles × 12 white
 * frames, tinted per shell, additive), flare smoke (4 grey puffs, tinted) and the flare's burning tip, and the camera
 * flash (4 frames). Drawing only; without them the drawn effects stay.
 */
import { Assets, type Spritesheet, type Texture } from "pixi.js";
import { gameArtUrl } from "@/Domain/art/paintedFaces";

export const FX_ART = {
  FIRE_FRAMES: 12,
  FIRE_STYLES: ["peony", "ring", "willow", "crackle"] as const,
  /** Firework sprite side, in burst radii. */
  FIRE_SIZE: 2.2,
  /** Smoke sprite side, in puff radii, and the alpha boost (the sprite's edges are soft). */
  PUFF_SIZE: 2.6,
  PUFF_ALPHA: 1.6,
  /** Flare tip sprite side, in glow radii (the glow is 32 px in a 128 px frame). */
  SPARK_SIZE: 9,
  /** Flash sprite side, in photographer units. */
  FLASH_SIZE: 6,
} as const;

export interface FxArt { fire: Texture[][]; smoke: Texture[]; spark: Texture; flash: Texture[] }

const pad = (n: number) => String(n).padStart(2, "0");

/** Every atlas, or null when one fails to load. */
export async function loadFxArt(): Promise<FxArt | null> {
  try {
    const [fw, sm, fl] = await Promise.all([
      Assets.load<Spritesheet>(gameArtUrl("effects/firework-atlas.json")),
      Assets.load<Spritesheet>(gameArtUrl("effects/smoke-atlas.json")),
      Assets.load<Spritesheet>(gameArtUrl("effects/flash-atlas.json")),
    ]);
    if (!fw || !sm || !fl) return null;
    const fire = FX_ART.FIRE_STYLES.map((st) => Array.from({ length: FX_ART.FIRE_FRAMES }, (_, i) => fw.textures[`firework-${st}-${pad(i + 1)}.png`]!));
    const smoke = [1, 2, 3, 4].map((i) => sm.textures[`smoke-0${i}.png`]!);
    const spark = sm.textures["flare-spark.png"];
    const flash = [1, 2, 3, 4].map((i) => fl.textures[`flash-0${i}.png`]!);
    if (!spark || fire.flat().some((t) => !t) || smoke.some((t) => !t) || flash.some((t) => !t)) return null;
    return { fire, smoke, spark, flash };
  } catch {
    return null;
  }
}
