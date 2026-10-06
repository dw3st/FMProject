/** Ball seam spin (drawing only): the seams roll with the distance the drawn ball covers on the ground. */
export interface PxPos { x: number; y: number }

/**
 * New seam angle (radians). Adds distance / radius, signed by the direction of travel (left-to-right
 * rolls clockwise). No spin while paused or on a jump (teleport) of more than `teleportPx`.
 */
export function nextSpinAngle(
  angle: number,
  prev: PxPos | null,
  cur: PxPos,
  radiusPx: number,
  paused: boolean,
  teleportPx: number,
): number {
  if (paused || !prev || radiusPx <= 0) return angle;
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist > teleportPx) return angle;
  const dir = Math.abs(dx) >= Math.abs(dy) ? Math.sign(dx) : Math.sign(dy);
  return angle + (dir * dist) / radiusPx;
}
