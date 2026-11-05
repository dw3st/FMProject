/**
 * The painted surroundings of a real stadium (art, `backdrops/surround/<stadium id>.webp`): its real neighbourhood from
 * OpenStreetMap (car parks, roads, buildings, rails, trees) squeezed around the stadium the game draws and painted by
 * FLUX. The image is in yards: PPY pixels per yard, its centre on the pitch centre, +x along the pitch. The footprint it
 * was painted around is the game's own on REF_CANVAS (the live match's canvas); on another canvas the stadium, drawn on
 * top, covers a little more or less of the concourse.
 */
export const SURROUND_ART = {
  PPY: 6,
  /** Image size (px): ±109 × ±72 yards around the pitch centre. */
  SIZE: [1312, 864] as [number, number],
  REF_CANVAS: [1056, 682] as [number, number],
} as const;
