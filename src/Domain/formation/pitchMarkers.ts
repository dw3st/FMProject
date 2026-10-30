/**
 * Formation screen: markers (face + role tag + name + fitness) are ~14% of the pitch tall, so two slots of the same
 * lane a few yards apart (4-3-1-2: the CAM 6 yd ahead of the middle CM) were drawn on top of each other (tester
 * report). Pushes such pairs apart vertically, symmetrically, inside the pitch. Display only (percent of the pitch,
 * x across, y down, as `getFormationSlots`).
 */
/** Same lane (|dx| < SAME_DX): MIN_DY apart; a neighbour lane (|dx| < LANE_DX): SIDE_DY apart. */
export const MARKER_SPREAD = { SAME_DX: 8, MIN_DY: 18, LANE_DX: 17, SIDE_DY: 17, MIN_Y: 7, MAX_Y: 93, PASSES: 12 } as const;

/** Vertical gap two markers need, by their horizontal distance (percent of the pitch). */
export function neededGap(dx: number): number {
  const S = MARKER_SPREAD;
  const a = Math.abs(dx);
  return a < S.SAME_DX ? S.MIN_DY : a < S.LANE_DX ? S.SIDE_DY : 0;
}

export function spreadMarkers<T extends { x: number; y: number }>(slots: readonly T[]): T[] {
  const S = MARKER_SPREAD;
  const out = slots.map((s) => ({ ...s }));
  for (let pass = 0; pass < S.PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!, b = out[j]!;
        const need = neededGap(a.x - b.x);
        const dy = b.y - a.y;
        if (Math.abs(dy) >= need - 0.01) continue;
        const push = (need - Math.abs(dy)) / 2;
        const dir = dy >= 0 ? 1 : -1;
        a.y = Math.max(S.MIN_Y, Math.min(S.MAX_Y, a.y - dir * push));
        b.y = Math.max(S.MIN_Y, Math.min(S.MAX_Y, b.y + dir * push));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}
