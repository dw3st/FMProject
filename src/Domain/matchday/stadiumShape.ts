/**
 * The shape of a stadium seen from above (stadium mock of 2026-11-05): an oval bowl, a box with rounded corners, a
 * square box, or four separate stands with open corners (small grounds). Real stadiums take it from their outline on
 * OpenStreetMap (`RealStadium.shape`, how much of its minimum-area rectangle the outline fills); a small ground is
 * always blocks; the rest is drawn from the stadium id.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export type StadiumShape = "oval" | "rounded" | "square" | "blocks";

export const STADIUM_SHAPE = {
  /** Outline / minimum-area rectangle: below OVAL_FILL an oval, below SQUARE_FILL rounded corners, else square. */
  OVAL_FILL: 0.86,
  SQUARE_FILL: 0.93,
  /** Below this capacity a ground is four separate stands. */
  BLOCKS_MAX_CAPACITY: 15000,
  /** Shapes of the stadiums without an outline (real share among the 185 outlines: 84 / 74 / 27). */
  DRAWN: [["oval", 0.45], ["rounded", 0.4], ["square", 0.15]] as [Exclude<StadiumShape, "blocks">, number][],
} as const;

/** The shape of an outline that fills `fill` of its minimum-area rectangle. */
export function shapeFromFill(fill: number): Exclude<StadiumShape, "blocks"> {
  if (fill < STADIUM_SHAPE.OVAL_FILL) return "oval";
  if (fill < STADIUM_SHAPE.SQUARE_FILL) return "rounded";
  return "square";
}

/** The stadium's shape: blocks under the capacity line, else the real one, else drawn from the id. */
export function stadiumShapeOf(input: { id: string; capacity: number; real?: Exclude<StadiumShape, "blocks"> }): StadiumShape {
  if (input.capacity > 0 && input.capacity < STADIUM_SHAPE.BLOCKS_MAX_CAPACITY) return "blocks";
  if (input.real) return input.real;
  let r = mulberry32(seedFrom(`shape:${input.id}`))();
  for (const [shape, share] of STADIUM_SHAPE.DRAWN) {
    if (r < share) return shape;
    r -= share;
  }
  return "rounded";
}
