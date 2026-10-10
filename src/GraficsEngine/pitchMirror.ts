import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

/**
 * Drawing-only mirror of the pitch (#98): when the user's side (always engine team A) plays away,
 * the live match draws the pitch turned 180° (x and y flipped) so the home side attacks the way it
 * is listed (home on the left, like a TV broadcast). A turn, not a reflection: a reflection on x
 * alone would draw every left winger on his team's right (#142). The game state is never touched —
 * only the yards → pixels conversion and its inverse (clicks) go through here. Each is its own
 * inverse.
 */
export function mirrorX(x: number, mirror: boolean): number {
  return mirror ? PITCH_LENGTH - x : x;
}

/** The y half of the turn: the drawn pitch is flipped on y too when mirrored (#142). */
export function mirrorY(y: number, mirror: boolean): number {
  return mirror ? PITCH_WIDTH - y : y;
}
