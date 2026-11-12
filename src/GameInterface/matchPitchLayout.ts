import { PITCH_SPEC, GOAL_NET_DEPTH_YDS } from "@/GraficsEngine/pitchMetrics";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

/**
 * Where the live match draws its canvas (10.9, tester report: a bigger pitch). The team list and the summary float over
 * the pitch as rails, so the pitch area is the whole row. With a stadium the canvas is taller than that area and the area
 * crops it evenly at the top and at the bottom: the pitch, the LED boards and the benches stay, most of the two long
 * stands go, and the pitch is drawn bigger. Without a stadium the canvas keeps the pitch's own ratio, centred.
 */
export interface MatchPitchLayout {
  /** The visible area (the row between the top bar and the footer). */
  viewW: number; viewH: number;
  /** The Pixi canvas. */
  canvasW: number; canvasH: number;
  /** Top-left of the canvas inside the view (negative y = cropped). */
  x: number; y: number;
}

export const MATCH_PITCH_LAYOUT = {
  /** Stand left in view above the top apron and below the benches, in yards. */
  VIEW_MARGIN_YDS: 1.5,
  /** The canvas never grows wider than this many yards of end stand past each goal net (ultra-wide screens). */
  MAX_END_YDS: 75,
  MIN_W: 320,
} as const;

/** 124 × 80 yards: the ratio of the canvas when no stadium is drawn. */
const PLAIN_ASPECT = 124 / 80;

export function matchPitchLayout(
  viewW: number, viewH: number, opts: { stadium: boolean; shape?: boolean },
): MatchPitchLayout | null {
  if (viewW <= 0 || viewH <= 0) return null;
  const W = Math.floor(viewW), H = Math.floor(viewH);
  const L = MATCH_PITCH_LAYOUT;
  if (!opts.stadium) {
    const fromH = H * PLAIN_ASPECT;
    const w = Math.max(L.MIN_W, Math.floor(fromH <= W ? fromH : W));
    const h = Math.max(Math.round(L.MIN_W / PLAIN_ASPECT), Math.floor(fromH <= W ? H : W / PLAIN_ASPECT));
    return { viewW: W, viewH: H, canvasW: w, canvasH: h, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) };
  }
  const S = STADIUM;
  const around = opts.shape ? S.SURROUND_YDS : 0;
  const lengthYds = PITCH_SPEC.lengthYds + 2 * GOAL_NET_DEPTH_YDS;
  const playYds = PITCH_SPEC.widthYds + S.RUNOFF_YDS + S.BENCH_RUNOFF_YDS;
  // The same two bounds as `buildMetrics`, but the height bound is the cropped view, not the whole stadium.
  const fullH = playYds + 2 * (S.MIN_STAND_YDS + around);
  const fullW = lengthYds + 2 * (S.END_RUNOFF_YDS + S.MIN_STAND_YDS + around);
  const scale = Math.min(H / (playYds + 2 * L.VIEW_MARGIN_YDS), W / fullW);
  const canvasH = Math.max(H, Math.round(scale * fullH));
  const canvasW = Math.max(L.MIN_W, Math.min(W, Math.round(scale * (lengthYds + 2 * L.MAX_END_YDS))));
  return { viewW: W, viewH: H, canvasW, canvasH, x: Math.round((W - canvasW) / 2), y: Math.round((H - canvasH) / 2) };
}
