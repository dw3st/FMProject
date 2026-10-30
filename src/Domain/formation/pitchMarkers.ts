/**
 * Pitch markers (face + role tag + name + fitness) are big next to the pitch, so two slots a few yards apart were drawn
 * on top of each other (tester reports: the 4-3-1-2 CAM over the middle CM on the Formation screen; Pedri under Yamal
 * on the live substitution panel). These helpers push such pairs apart along one axis of the pitch, symmetrically,
 * keyed on their distance across the other axis. Display only (percent of the pitch).
 */

/** Two markers closer than `cross` across the spread axis must be `gap` apart along it (first matching lane wins). */
export interface SpreadLane { cross: number; gap: number }

export interface SpreadSpec {
  /** Axis the markers move along ("y": vertical pitch, Formation screen; "x": horizontal pitch, substitution panel). */
  axis: "x" | "y";
  /** Lanes by increasing `cross`. */
  lanes: readonly SpreadLane[];
  /** Bounds of the moved coordinate (percent). */
  min: number;
  max: number;
  passes: number;
}

/** Gap needed along the spread axis for two markers `dCross` apart across it. */
export function laneGap(lanes: readonly SpreadLane[], dCross: number): number {
  const a = Math.abs(dCross);
  for (const lane of lanes) if (a < lane.cross) return lane.gap;
  return 0;
}

export function spreadAlongAxis<T extends { x: number; y: number }>(slots: readonly T[], spec: SpreadSpec): T[] {
  const along = spec.axis;
  const cross = along === "x" ? "y" : "x";
  const out = slots.map((s) => ({ ...s }));
  for (let pass = 0; pass < spec.passes; pass++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!, b = out[j]!;
        const need = laneGap(spec.lanes, a[cross] - b[cross]);
        const d = b[along] - a[along];
        if (Math.abs(d) >= need - 0.01) continue;
        const push = (need - Math.abs(d)) / 2;
        // Same spot: the one listed later goes forward (stable, never a 0 direction).
        const dir = d >= 0 ? 1 : -1;
        a[along] = Math.max(spec.min, Math.min(spec.max, a[along] - dir * push));
        b[along] = Math.max(spec.min, Math.min(spec.max, b[along] + dir * push));
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** Formation screen (vertical pitch, x across, y down): same lane (|dx| < SAME_DX) MIN_DY apart, a neighbour lane SIDE_DY. */
export const MARKER_SPREAD = { SAME_DX: 8, MIN_DY: 18, LANE_DX: 17, SIDE_DY: 17, MIN_Y: 7, MAX_Y: 93, PASSES: 12 } as const;

const FORMATION_SPEC: SpreadSpec = {
  axis: "y",
  lanes: [
    { cross: MARKER_SPREAD.SAME_DX, gap: MARKER_SPREAD.MIN_DY },
    { cross: MARKER_SPREAD.LANE_DX, gap: MARKER_SPREAD.SIDE_DY },
  ],
  min: MARKER_SPREAD.MIN_Y,
  max: MARKER_SPREAD.MAX_Y,
  passes: MARKER_SPREAD.PASSES,
};

/** Vertical gap two Formation-screen markers need, by their horizontal distance (percent of the pitch). */
export function neededGap(dx: number): number {
  return laneGap(FORMATION_SPEC.lanes, dx);
}

export function spreadMarkers<T extends { x: number; y: number }>(slots: readonly T[]): T[] {
  return spreadAlongAxis(slots, FORMATION_SPEC);
}

/**
 * Horizontal pitch (attack to the right) with cards `cardW` × `cardH` percent of the pitch (margin included): two cards
 * overlapping across the pitch are pushed apart along its length until they no longer touch, inside the pitch.
 */
export function wideCardSpec(cardW: number, cardH: number): SpreadSpec {
  return { axis: "x", lanes: [{ cross: cardH, gap: cardW }], min: cardW / 2, max: 100 - cardW / 2, passes: 60 };
}

/** True when two cards (centres in percent, size `cardW` × `cardH` percent) overlap. */
export function cardsOverlap(points: readonly { x: number; y: number }[], cardW: number, cardH: number): boolean {
  return points.some((a, i) =>
    points.some((b, j) => j > i && Math.abs(a.x - b.x) < cardW - 0.05 && Math.abs(a.y - b.y) < cardH - 0.05));
}

/**
 * Live substitution panel (upright pitch, 3:4): a card is SUBS_CARD.W percent of the pitch wide (the name pill,
 * `19cqw`) and SUBS_CARD.H percent tall (role tag, face, pill). Cards closer than W across are pushed H apart along
 * the pitch (tester report: the CAM's tag under the striker's pill). Checked for every formation in the tests.
 */
export const SUBS_CARD = { W: 19, H: 20, MIN_Y: 7, MAX_Y: 93 } as const;

export function spreadSubsMarkers<T extends { x: number; y: number }>(slots: readonly T[]): T[] {
  return spreadAlongAxis(slots, { axis: "y", lanes: [{ cross: SUBS_CARD.W, gap: SUBS_CARD.H }], min: SUBS_CARD.MIN_Y, max: SUBS_CARD.MAX_Y, passes: 120 });
}
