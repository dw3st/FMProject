/**
 * The art pack's stadium pieces (art phase 9, `src/example_data/assets/stadium`): the stand textures (empty under the
 * animated fans, construction on a stand under works), the tunnel canopy, the floodlight tower, the dugout and its roof,
 * and the LED board frame. Drawing only. Without them the drawn stadium stays.
 */
import { Assets, type Texture } from "pixi.js";
import { gameArtUrl } from "@/Domain/art/paintedFaces";

export const STADIUM_ART = {
  /** One seat row of the stand tile, px (256 px tile, 8 rows). */
  SEAT_PX: 32,
  /** Darkening of the empty stand texture under the animated fans (as in the art preview). */
  SHADE: 0.38,
  /** Tower sprite side, in tower size units (`TowerSpot.size`). */
  TOWER_SIZE: 1.5,
  TOWER_OFF_TINT: 0xb4bac2,
  /** `stadium.json` → led-board-frame: 512×48, the screen rectangle inside it. */
  LED: { W: 512, H: 48, SCREEN: { x: 6, y: 6, w: 500, h: 32 } },
} as const;

export interface StadiumArt {
  standEmpty: Texture; standWorks: Texture; tunnel: Texture; tower: Texture; bench: Texture; benchRoof: Texture; ledFrame: Texture;
}

const FILES = {
  standEmpty: "stadium/stand-block-empty.png",
  standWorks: "stadium/stand-block-construction.png",
  tunnel: "stadium/tunnel.png",
  tower: "stadium/floodlight-tower.png",
  bench: "stadium/bench.png",
  benchRoof: "stadium/bench-roof.png",
  ledFrame: "stadium/led-board-frame.png",
} as const;

/** Every piece, or null when one fails to load. */
export async function loadStadiumArt(): Promise<StadiumArt | null> {
  try {
    const keys = Object.keys(FILES) as (keyof typeof FILES)[];
    const textures = await Promise.all(keys.map((k) => Assets.load<Texture>(gameArtUrl(FILES[k]))));
    if (textures.some((t) => !t)) return null;
    return Object.fromEntries(keys.map((k, i) => [k, textures[i]])) as unknown as StadiumArt;
  } catch {
    return null;
  }
}
