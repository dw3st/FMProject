/** Ball seam spin (drawing only): the seams roll with the distance the drawn ball covers on the ground. */
export interface PxPos { x: number; y: number }

/**
 * New seam angle (radians). Adds distance / radius, signed by the direction of travel (left-to-right
 * rolls clockwise). No spin while paused or on a jump (teleport) of more than `teleportPx`. At most
 * `maxStep` radians per frame: faster spin reads as random flicker (wagon-wheel effect) at 2×/4×.
 */
export function nextSpinAngle(
  angle: number,
  prev: PxPos | null,
  cur: PxPos,
  radiusPx: number,
  paused: boolean,
  teleportPx: number,
  maxStep = Infinity,
): number {
  if (paused || !prev || radiusPx <= 0) return angle;
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist > teleportPx) return angle;
  const dir = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : Math.sign(dy);
  return angle + dir * Math.min(maxStep, dist / radiusPx);
}

/** Goal sprites of the art pack (`goal/goal.json`): 192×64, net up, goal line at y 54, posts at x 16 and 176. */
export const GOAL_SPRITE = { W: 192, H: 64, POSTS: [16, 176], GOAL_LINE_Y: 54 } as const;

/** Ball sprite of the art pack: 8 frames cover 72° of roll toward −y, so the loop is seamless. */
export const BALL_SPRITE = { FRAMES: 8, LOOP_RAD: (72 * Math.PI) / 180, SIZE: 32, SNOW_TINT: 0xff7a1a } as const;

/** Roll distance (radians) and heading of the sprite after a frame (none while paused or on a jump). */
export function nextBallRoll(
  state: { roll: number; heading: number },
  prev: PxPos | null,
  cur: PxPos,
  radiusPx: number,
  paused: boolean,
  teleportPx: number,
  maxStep = Infinity,
): { roll: number; heading: number } {
  if (paused || !prev || radiusPx <= 0) return state;
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist > teleportPx) return state;
  // The sprite rolls toward −y: turn it so −y points where the ball goes.
  return { roll: state.roll + Math.min(maxStep, dist / radiusPx), heading: Math.atan2(dy, dx) + Math.PI / 2 };
}

/** The atlas frame (0..7) for a roll distance. */
export function ballSpriteFrame(roll: number): number {
  const L = BALL_SPRITE.LOOP_RAD;
  const t = ((roll % L) + L) % L;
  return Math.min(BALL_SPRITE.FRAMES - 1, Math.floor((t / L) * BALL_SPRITE.FRAMES));
}
