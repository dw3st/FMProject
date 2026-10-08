/**
 * Pitch geometry in canvas pixels (pure). With `stadium`, the pitch is drawn PITCH_SHRINK smaller and
 * a stand band fills the canvas around it (spec 2026-10-08-match-visual-design.md §1).
 */
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

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

/** Stand band: `outer` = the canvas, `inner` = pitch + run-off; the stand is `outer − inner`. */
export interface StandGeometry {
  outer: PxRect;
  inner: PxRect;
  thickness: { top: number; bottom: number; left: number; right: number };
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

export function buildMetrics(canvasW: number, canvasH: number, opts: { stadium: boolean }): PitchMetrics {
  const totalLengthYds = PITCH_SPEC.lengthYds + 2 * GOAL_NET_DEPTH_YDS;
  const fullScale = Math.min(canvasW / totalLengthYds, canvasH / PITCH_SPEC.widthYds);
  const scale = fullScale * (opts.stadium ? STADIUM.PITCH_SHRINK : 1);

  const netDepth = Math.round(GOAL_NET_DEPTH_YDS * scale);
  const pitchW   = Math.round(PITCH_SPEC.lengthYds * scale);
  const pitchH   = Math.round(PITCH_SPEC.widthYds  * scale);

  const totalW      = pitchW + 2 * netDepth;
  const outerMargin = Math.round((canvasW - totalW) / 2);
  const marginX = outerMargin + netDepth;
  const marginY = Math.round((canvasH - pitchH) / 2);

  let stand: StandGeometry | null = null;
  if (opts.stadium) {
    const side = Math.round(STADIUM.RUNOFF_YDS * scale);
    const end  = netDepth + Math.round(STADIUM.END_RUNOFF_YDS * scale);
    const x = Math.max(0, marginX - end);
    const y = Math.max(0, marginY - side);
    const right = Math.min(canvasW, marginX + pitchW + end);
    const bottom = Math.min(canvasH, marginY + pitchH + side);
    const inner = { x, y, w: right - x, h: bottom - y };
    stand = {
      outer: { x: 0, y: 0, w: canvasW, h: canvasH },
      inner,
      thickness: { top: y, bottom: canvasH - bottom, left: x, right: canvasW - right },
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
