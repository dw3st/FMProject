import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";

/**
 * Drawing-only mirror of the pitch (#98): when the user's side (always engine team A) plays away,
 * the live match draws the pitch flipped on the x axis so the home side attacks the way it is
 * listed (home on the left, like a TV broadcast). The game state is never touched — only the
 * yards → pixels conversion and its inverse (clicks) go through here. Its own inverse.
 */
export function mirrorX(x: number, mirror: boolean): number {
  return mirror ? PITCH_LENGTH - x : x;
}
