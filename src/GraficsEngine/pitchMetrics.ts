/**
 * Pitch geometry in canvas pixels (pure). With `stadium`, the pitch is drawn PITCH_SHRINK smaller and
 * a stand band fills the canvas around it (spec 2026-10-08-match-visual-design.md §1).
 */
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { STADIUM } from "@/GraficsEngine/pitchStyle";
import type { StadiumShape } from "@/Domain/matchday/stadiumShape";

export const PITCH_SPEC = {
  lengthYds: PITCH_LENGTH,
  widthYds: PITCH_WIDTH,
  centreCircleRadiusYds: 10,
  goalAreaDepthYds: 6,
  goalAreaWidthYds: 18,
  penaltyAreaDepthYds: 18,
  penaltyAreaWidthYds: 44,
  penaltySpotDistanceYds: 12,
  cornerArcRadiusYds: 1,
} as const;

export interface PxRect { x: number; y: number; w: number; h: number }

/**
 * Stand band: `outer` = the canvas (inset by the surroundings when `shape` is set), `inner` = pitch + run-off; the stand
 * is `outer − inner`, its corners cut by the shape (`standCorners`).
 */
export interface StandGeometry {
  outer: PxRect;
  inner: PxRect;
  thickness: { top: number; bottom: number; left: number; right: number };
  /** The stadium seen from above; absent = the old full-canvas band with rounded corners. */
  shape?: StadiumShape;
}

export interface PitchMetrics {
  scale: number;
  width: number; height: number;
  marginX: number; marginY: number;
  centreCircleRadius: number;
  goalAreaDepth: number; goalAreaWidth: number;
  penaltyAreaDepth: number; penaltyAreaWidth: number;
  penaltySpotDistance: number;
  cornerArcRadius: number;
  goalNetDepth: number;
  stand: StandGeometry | null;
}

export const GOAL_NET_DEPTH_YDS = 2;

export function buildMetrics(canvasW: number, canvasH: number, opts: { stadium: boolean; shape?: StadiumShape }): PitchMetrics {
  const totalLengthYds = PITCH_SPEC.lengthYds + 2 * GOAL_NET_DEPTH_YDS;
  const fullScale = Math.min(canvasW / totalLengthYds, canvasH / PITCH_SPEC.widthYds);
  // With the stadium the pitch is sized like the art preview (4.41.15): the aprons and at least MIN_STAND_YDS of stand
  // on every side fit in the canvas.
  const S = STADIUM;
  // With a stadium shape the surroundings take SURROUND_YDS on every side.
  const around = opts.stadium && opts.shape ? S.SURROUND_YDS : 0;
  const scale = opts.stadium
    ? Math.min(
        canvasW / (totalLengthYds + 2 * (S.END_RUNOFF_YDS + S.MIN_STAND_YDS + around)),
        canvasH / (PITCH_SPEC.widthYds + S.RUNOFF_YDS + S.BENCH_RUNOFF_YDS + 2 * (S.MIN_STAND_YDS + around)),
      )
    : fullScale;

  const netDepth = Math.round(GOAL_NET_DEPTH_YDS * scale);
  const pitchW   = Math.round(PITCH_SPEC.lengthYds * scale);
  const pitchH   = Math.round(PITCH_SPEC.widthYds  * scale);

  const totalW      = pitchW + 2 * netDepth;
  const outerMargin = Math.round((canvasW - totalW) / 2);
  const marginX = outerMargin + netDepth;
  // With the stadium the bottom run-off is deeper (the benches below the assistant's lane): the pitch moves up.
  const extraBottom = opts.stadium ? Math.round((STADIUM.BENCH_RUNOFF_YDS - STADIUM.RUNOFF_YDS) * scale) : 0;
  const marginY = Math.round((canvasH - pitchH - extraBottom) / 2);

  let stand: StandGeometry | null = null;
  if (opts.stadium) {
    const side = Math.round(STADIUM.RUNOFF_YDS * scale);
    const end  = netDepth + Math.round(STADIUM.END_RUNOFF_YDS * scale);
    const inset = Math.round(around * scale);
    const outer = { x: inset, y: inset, w: canvasW - 2 * inset, h: canvasH - 2 * inset };
    const oR = outer.x + outer.w, oB = outer.y + outer.h;
    const x = Math.max(outer.x, marginX - end);
    const y = Math.max(outer.y, marginY - side);
    const right = Math.min(oR, marginX + pitchW + end);
    const bottom = Math.min(oB, marginY + pitchH + side + extraBottom);
    const inner = { x, y, w: right - x, h: bottom - y };
    stand = {
      outer,
      inner,
      thickness: { top: y - outer.y, bottom: oB - bottom, left: x - outer.x, right: oR - right },
      ...(opts.shape ? { shape: opts.shape } : {}),
    };
  }

  return {
    scale,
    width:  pitchW,
    height: pitchH,
    marginX,
    marginY,
    centreCircleRadius:  Math.round(PITCH_SPEC.centreCircleRadiusYds  * scale),
    goalAreaDepth:       Math.round(PITCH_SPEC.goalAreaDepthYds        * scale),
    goalAreaWidth:       Math.round(PITCH_SPEC.goalAreaWidthYds        * scale),
    penaltyAreaDepth:    Math.round(PITCH_SPEC.penaltyAreaDepthYds     * scale),
    penaltyAreaWidth:    Math.round(PITCH_SPEC.penaltyAreaWidthYds     * scale),
    penaltySpotDistance: Math.round(PITCH_SPEC.penaltySpotDistanceYds  * scale),
    cornerArcRadius:     Math.round(PITCH_SPEC.cornerArcRadiusYds      * scale),
    goalNetDepth: netDepth,
    stand,
  };
}
