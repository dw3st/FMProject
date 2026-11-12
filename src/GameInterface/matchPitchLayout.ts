/**
 * Where the live match draws its canvas. The team list and the summary float over the pitch area as rails (10.9), so
 * the area is the whole row between the top bar and the footer. The canvas keeps its own ratio and the whole stadium in
 * view, centred in that row: nothing is cropped or stretched (10.9.1: a first version cropped the long stands and
 * widened the canvas, which left two huge end stands).
 */
export interface MatchPitchLayout {
  /** The visible area (the row between the top bar and the footer). */
  viewW: number; viewH: number;
  /** The Pixi canvas. */
  canvasW: number; canvasH: number;
  /** Top-left of the canvas inside the view. */
  x: number; y: number;
}

export const MATCH_PITCH_LAYOUT = {
  /** 124 × 80 yards: the ratio of the match canvas. */
  ASPECT: 124 / 80,
  MIN_W: 320,
} as const;

/** Gap between a rail and the stadium's edge, and the room a rail needs beside the stadium to sit outside it (px). */
export const RAIL_GAP = 8;
export const RAIL_ROOM = 112;

/**
 * Where a side rail sits (10.9.2, user request: the rails at the stadium's edge, not at the screen's). `stadiumEdge`
 * is the distance from the rail's side of the pitch area to the canvas. With room there the rail stands beside the
 * stadium: the result is the distance from that side to the rail's inner edge. Without room (a narrow screen, the
 * stadium takes the whole row) it is null and the rail stays by the screen edge, over the stand.
 */
export function railOffset(stadiumEdge: number | null): number | null {
  return stadiumEdge !== null && stadiumEdge >= RAIL_ROOM ? Math.round(stadiumEdge) - RAIL_GAP : null;
}

export function matchPitchLayout(viewW: number, viewH: number): MatchPitchLayout | null {
  if (viewW <= 0 || viewH <= 0) return null;
  const W = Math.floor(viewW), H = Math.floor(viewH);
  const L = MATCH_PITCH_LAYOUT;
  const fromH = H * L.ASPECT;
  const w = Math.max(L.MIN_W, Math.floor(fromH <= W ? fromH : W));
  const h = Math.max(Math.round(L.MIN_W / L.ASPECT), Math.floor(fromH <= W ? H : W / L.ASPECT));
  return { viewW: W, viewH: H, canvasW: w, canvasH: h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) };
}
