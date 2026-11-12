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

export function matchPitchLayout(viewW: number, viewH: number): MatchPitchLayout | null {
  if (viewW <= 0 || viewH <= 0) return null;
  const W = Math.floor(viewW), H = Math.floor(viewH);
  const L = MATCH_PITCH_LAYOUT;
  const fromH = H * L.ASPECT;
  const w = Math.max(L.MIN_W, Math.floor(fromH <= W ? fromH : W));
  const h = Math.max(Math.round(L.MIN_W / L.ASPECT), Math.floor(fromH <= W ? H : W / L.ASPECT));
  return { viewW: W, viewH: H, canvasW: w, canvasH: h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) };
}
