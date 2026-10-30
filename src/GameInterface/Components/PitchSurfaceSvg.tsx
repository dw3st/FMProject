import { useId, useMemo, useState } from "react";
import { pitchSurface, type SurfaceShape } from "@/GraficsEngine/pitchSurface";
import { PAINTED_TURF, paintedOverlay, paintedTurfId } from "@/GraficsEngine/paintedTurf";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { gameArtUrl, newVisualOn, paintedBackdrop } from "@/Domain/art/paintedFaces";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Plain grass texture (FLUX-refined, club_art.py) for an unmown pitch, which has no painted match backdrop. */
export const PLAIN_GRASS = "club/grass-plain.webp";

export interface PitchSurfaceProps {
  condition: number; turf: TurfType; mowing: MowingPattern; seed: string;
  /** Home ground (club id): the same ground keeps the same painted grass tone as the match. */
  ground?: string;
  className?: string;
}

/**
 * The image the preview paints under its lines with the new visual: the match's painted backdrop (cropped to the
 * pitch) or, for an unmown pitch, the plain grass texture. Null without the new visual (the drawn surface).
 */
export function paintedSurfaceOf(p: Omit<PitchSurfaceProps, "className">): { kind: "backdrop" | "plain"; url: string } | null {
  if (!newVisualOn()) return null;
  const id = paintedTurfId(p);
  const url = id ? paintedBackdrop(id) : null;
  if (url) return { kind: "backdrop", url };
  if (p.mowing === "none" && p.turf !== "synthetic") return { kind: "plain", url: gameArtUrl(PLAIN_GRASS) };
  return null;
}

/** Image box (in % of the pitch) that puts the backdrop's painted pitch rectangle on the preview's pitch. */
const P = PAINTED_TURF.PITCH;
const I = PAINTED_TURF.IMAGE;
const BACKDROP_STYLE = {
  width: `${(I.w / P.w) * 100}%`,
  height: `${(I.h / P.h) * 100}%`,
  left: `${(-P.x / P.w) * 100}%`,
  top: `${(-P.y / P.h) * 100}%`,
} as const;

function Shapes({ shapes }: { shapes: SurfaceShape[] }) {
  return (
    <>
      {shapes.map((sh, i) => sh.kind === "rect"
        ? <rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} fill={hex(sh.color)} fillOpacity={sh.alpha} />
        : sh.kind === "poly"
          ? <polygon key={i} points={sh.points.join(" ")} fill={hex(sh.color)} fillOpacity={sh.alpha} />
          : <circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill="none" stroke={hex(sh.color)} strokeOpacity={sh.alpha} strokeWidth={sh.width} />)}
    </>
  );
}

function Lines({ alpha, dashed }: { alpha: number; dashed: boolean }) {
  const L = PITCH_LENGTH, W = PITCH_WIDTH;
  const line = { fill: "none", stroke: "#ffffff", strokeOpacity: alpha, strokeWidth: 0.6, ...(dashed ? { strokeDasharray: "4 1.5" } : {}) };
  return (
    <>
      <rect x={0.5} y={0.5} width={L - 1} height={W - 1} {...line} />
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} {...line} />
      <circle cx={L / 2} cy={W / 2} r={10} {...line} />
      <rect x={0.5} y={W / 2 - 22} width={18} height={44} {...line} />
      <rect x={L - 18.5} y={W / 2 - 22} width={18} height={44} {...line} />
    </>
  );
}

/**
 * Small drawing of a pitch surface: match preview and Club screen. With the new visual, the same painted grass as the
 * match (backdrop by turf and mowing, plain texture when unmown) with the game's wash, wear and lines on top; without
 * it, the drawn surface (same shapes as the live pitch).
 */
export function PitchSurfaceSvg({ condition, turf, mowing, seed, ground, className }: PitchSurfaceProps) {
  const clip = useId();
  const input = { condition, turf, mowing, seed, ...(ground ? { ground } : {}) };
  const s = useMemo(() => pitchSurface({ condition, turf, mowing, seed }), [condition, turf, mowing, seed]);
  const painted = paintedSurfaceOf(input);
  const [failed, setFailed] = useState<string | null>(null);
  const L = PITCH_LENGTH, W = PITCH_WIDTH;

  if (painted && failed !== painted.url) {
    const over = paintedOverlay(input);
    return (
      <div className={`relative overflow-hidden aspect-[115/74] ${className ?? ""}`} aria-hidden="true">
        {painted.kind === "backdrop"
          ? <img src={painted.url} alt="" draggable={false} onError={() => setFailed(painted.url)}
              className="absolute max-w-none select-none" style={BACKDROP_STYLE} />
          : <img src={painted.url} alt="" draggable={false} onError={() => setFailed(painted.url)}
              className="absolute inset-0 w-full h-full object-cover select-none" />}
        <svg viewBox={`0 0 ${L} ${W}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs><clipPath id={clip}><rect width={L} height={W} /></clipPath></defs>
          {over.washAlpha > 0 && <rect width={L} height={W} fill={hex(over.washColor)} fillOpacity={over.washAlpha} />}
          <g clipPath={`url(#${clip})`}><Shapes shapes={over.shapes} /></g>
          <Lines alpha={over.lineAlpha} dashed={over.dashedLines} />
        </svg>
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${L} ${W}`} className={className} aria-hidden="true">
      <defs><clipPath id={clip}><rect width={L} height={W} /></clipPath></defs>
      <rect width={L} height={W} fill={hex(s.base)} />
      <g clipPath={`url(#${clip})`}><Shapes shapes={s.shapes} /></g>
      <Lines alpha={s.lineAlpha} dashed={s.dashedLines} />
    </svg>
  );
}
