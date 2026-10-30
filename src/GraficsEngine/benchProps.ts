/**
 * Drinks by the benches (tester report, mock option B): a painted cooler box beside each bench, on the tunnel side, and
 * a few water bottles lying on the grass next to it. Pure: pixel positions from the drawn bench box; drawing only.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export const BENCH_PROPS = {
  /** Cooler width in player-marker radii (the painted box is 192 × 129). */
  COOLER_W: 1.25,
  COOLER_ASPECT: 129 / 192,
  /** Gap between the bench and the cooler, in marker radii. */
  GAP: 0.35,
  /** Bottle length in marker radii (the painted bottle is 40 × 92), and how many lie by each cooler. */
  BOTTLE_LEN: 0.85,
  BOTTLE_ASPECT: 40 / 92,
  BOTTLES: 3,
} as const;

export interface PropSpot { x: number; y: number; w: number; h: number; rotation: number }

/**
 * Cooler and bottles for one bench. `box` is the drawn bench (`benchLayout`), `side` which end of the pitch it serves
 * (the tunnel is toward the middle, so the cooler goes on the bench's inner end), `markerR` the player marker radius.
 */
export function benchPropSpots(
  box: { x: number; y: number; w: number; h: number }, side: "left" | "right", markerR: number, seed: string,
): { cooler: PropSpot; bottles: PropSpot[] } {
  const P = BENCH_PROPS;
  const dir = side === "left" ? 1 : -1;
  const w = P.COOLER_W * markerR, h = w * P.COOLER_ASPECT;
  const edge = side === "left" ? box.x + box.w : box.x;
  const cx = edge + dir * (P.GAP * markerR + w / 2);
  const cy = box.y + Math.min(box.h * 0.35, Math.max(h / 2, box.h - h / 2));
  const cooler = { x: cx, y: cy, w, h, rotation: 0 };
  const r = mulberry32(seedFrom(`bench-props:${seed}:${side}`));
  const len = P.BOTTLE_LEN * markerR, bw = len * P.BOTTLE_ASPECT;
  const bottles: PropSpot[] = [];
  for (let i = 0; i < P.BOTTLES; i++) {
    bottles.push({
      x: cx + dir * (-w * 0.05 + i * w * 0.4 + (r() - 0.5) * w * 0.1),
      y: Math.min(box.y + box.h - bw, cy + h * 0.5 + len * 0.35 + (r() - 0.5) * len * 0.3),
      w: bw, h: len,
      rotation: (r() * 2 - 1) * Math.PI * 0.5 + Math.PI / 2,
    });
  }
  return { cooler, bottles };
}
