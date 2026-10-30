/**
 * Painted turf (art handoff, phase 1): which painted backdrop the match uses and what the game still draws over it.
 * Pure. Only the night backdrops are used (the day ones carry a fixed stand shadow; the game's own light and real
 * stadium shadow do day and night). The painted stands around the grass are never shown: only the grass is cropped.
 * Worn and muddy natural / hybrid pitches use the painted worn / muddy grounds (4.41.19, as in the art preview), with
 * only a light wash on top; a hybrid pitch is the even "grass-c" tone, a natural one the classic or dense tone.
 */
import { pitchSurface, pitchVisualBand, type PitchSurfaceInput, type SurfaceShape } from "@/GraficsEngine/pitchSurface";
import { seedFrom } from "@/Domain/rng";

export const PAINTED_TURF = {
  /** Size of a backdrop image (px). */
  IMAGE: { w: 1300, h: 965 },
  /** The grass (pitch + run-off) inside the image: the painted stands are outside it. */
  FRAME: { x: 52, y: 54, w: 1196, h: 846 },
  /** The pitch inside the image (the lighter mowed rectangle), mapped onto the game's pitch. */
  PITCH: { x: 125, y: 125, w: 1050, h: 680 },
  /** Grass tones of a natural pitch's stripes, picked per ground (classic, dense). */
  TONES: ["grass-a", "grass-b"] as const,
  /** Tone of a hybrid pitch (the even one). */
  HYBRID: "grass-c",
  /** Wash of the band's base colour over the painted grass (the drawn turf fades its stripes the same way). */
  WASH: { FADED_MIN: 0.15, FADED_SPAN: 0.4, WORN: 0.6, ROTTEN: 0.75, SYNTH: 0.8, PAINTED_WEAR: 0.12 },
} as const;

export interface PaintedTurfInput extends PitchSurfaceInput {
  /** The home ground (club id): the same ground keeps the same grass tone. Absent: the seed. */
  ground?: string;
}

/**
 * The backdrop id for the match (`match-backdrop-…`). A plain (unmown) natural pitch has no painted backdrop (every
 * painted grass is mown): null, the game draws its own grass.
 */
export function paintedTurfId(p: PaintedTurfInput): string | null {
  if (p.turf === "synthetic") return "match-backdrop-synthetic";
  const band = pitchVisualBand(p.condition);
  if (band === "rotten") return "match-backdrop-grass-muddy";
  if (band === "worn") return "match-backdrop-grass-worn";
  if (p.mowing === "none") return null;
  if (p.mowing === "checker") return "match-backdrop-mow-check";
  if (p.mowing === "diagonal") return "match-backdrop-mow-diag";
  if (p.mowing === "circles") return "match-backdrop-mow-rings";
  if (p.turf === "hybrid") return `match-backdrop-${PAINTED_TURF.HYBRID}`;
  const tones = PAINTED_TURF.TONES;
  return `match-backdrop-${tones[seedFrom(`turf:${p.ground ?? p.seed}`) % tones.length]}`;
}

/** Alpha of the band's base colour washed over the painted grass (0 on a pristine pitch). */
export function paintedWash(p: PitchSurfaceInput): number {
  const W = PAINTED_TURF.WASH;
  const band = pitchVisualBand(p.condition);
  if (p.turf === "synthetic") return band === "pristine" ? 0 : (1 - Math.max(0.35, p.condition / 70)) * W.SYNTH;
  if (band === "pristine") return 0;
  if (band === "faded") return W.FADED_MIN + W.FADED_SPAN * (1 - (p.condition - 40) / 30);
  return W.PAINTED_WEAR;
}

/** What the game draws over the painted grass: the wash colour and alpha, then its own patches (never the mowing). */
export function paintedOverlay(p: PitchSurfaceInput): { washColor: number; washAlpha: number; shapes: SurfaceShape[]; lineAlpha: number; dashedLines: boolean } {
  const s = pitchSurface(p);
  return {
    washColor: s.base,
    washAlpha: paintedWash(p),
    // The painted worn / muddy grounds carry their own wear; synthetic and faded turf get the game's patches.
    shapes: p.turf !== "synthetic" && (pitchVisualBand(p.condition) === "worn" || pitchVisualBand(p.condition) === "rotten") ? [] : s.shapes.filter((sh) => sh.layer === "wear"),
    lineAlpha: s.lineAlpha,
    dashedLines: s.dashedLines,
  };
}

/**
 * Where the cropped grass sits on the canvas: the painted pitch rectangle lands on the game's pitch (`pitchX/Y/W/H`,
 * px), the rest of the crop around it (run-off). Turned 180° about the pitch centre when the pitch is mirrored.
 */
export function paintedPlacement(pitch: { x: number; y: number; w: number; h: number }, mirror: boolean) {
  const F = PAINTED_TURF.FRAME;
  const P = PAINTED_TURF.PITCH;
  const sx = pitch.w / P.w;
  const sy = pitch.h / P.h;
  return {
    /** Pivot: the painted pitch centre in crop coordinates. */
    pivotX: P.x - F.x + P.w / 2,
    pivotY: P.y - F.y + P.h / 2,
    x: pitch.x + pitch.w / 2,
    y: pitch.y + pitch.h / 2,
    scaleX: sx,
    scaleY: sy,
    rotation: mirror ? Math.PI : 0,
  };
}
