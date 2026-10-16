import { useId, useMemo } from "react";
import { pitchSurface } from "@/GraficsEngine/pitchSurface";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** Small drawing of a pitch surface (same shapes as the live pitch): match preview and Club screen. */
export function PitchSurfaceSvg({ condition, turf, mowing, seed, className }: {
  condition: number; turf: TurfType; mowing: MowingPattern; seed: string; className?: string;
}) {
  const clip = useId();
  const s = useMemo(() => pitchSurface({ condition, turf, mowing, seed }), [condition, turf, mowing, seed]);
  const L = PITCH_LENGTH, W = PITCH_WIDTH;
  const line = { fill: "none", stroke: "#ffffff", strokeOpacity: s.lineAlpha, strokeWidth: 0.6, ...(s.dashedLines ? { strokeDasharray: "4 1.5" } : {}) };
  return (
    <svg viewBox={`0 0 ${L} ${W}`} className={className} aria-hidden="true">
      <defs><clipPath id={clip}><rect width={L} height={W} /></clipPath></defs>
      <rect width={L} height={W} fill={hex(s.base)} />
      <g clipPath={`url(#${clip})`}>
        {s.shapes.map((sh, i) => sh.kind === "rect"
          ? <rect key={i} x={sh.x} y={sh.y} width={sh.w} height={sh.h} fill={hex(sh.color)} fillOpacity={sh.alpha} />
          : sh.kind === "poly"
            ? <polygon key={i} points={sh.points.join(" ")} fill={hex(sh.color)} fillOpacity={sh.alpha} />
            : <circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} fill="none" stroke={hex(sh.color)} strokeOpacity={sh.alpha} strokeWidth={sh.width} />)}
      </g>
      <rect x={0.5} y={0.5} width={L - 1} height={W - 1} {...line} />
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} {...line} />
      <circle cx={L / 2} cy={W / 2} r={10} {...line} />
      <rect x={0.5} y={W / 2 - 22} width={18} height={44} {...line} />
      <rect x={L - 18.5} y={W / 2 - 22} width={18} height={44} {...line} />
    </svg>
  );
}
