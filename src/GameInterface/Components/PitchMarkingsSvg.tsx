import { PITCH_COLOR } from "@/GraficsEngine/playerFaces";
import { PITCH_STRIPES } from "@/GraficsEngine/pitchStyle";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * Striped grass with the pitch markings, drawn in pitch yards (115 × 74), filling its positioned
 * parent. Shared by the squad depth view and the live substitution pitch.
 */
export function PitchMarkingsSvg() {
  const band = 115 / PITCH_STRIPES.COUNT;
  return (
    <svg viewBox="0 0 115 74" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
      <rect x={0} y={0} width={115} height={74} fill={hex(PITCH_COLOR)} />
      {Array.from({ length: PITCH_STRIPES.COUNT }, (_, i) =>
        i % 2 === 1 ? <rect key={i} x={i * band} y={0} width={band} height={74} fill={hex(PITCH_STRIPES.LIGHT)} /> : null,
      )}
      <g fill="none" stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.35} vectorEffect="non-scaling-stroke">
        <rect x={0.5} y={0.5} width={114} height={73} />
        <line x1={57.5} y1={0.5} x2={57.5} y2={73.5} />
        <circle cx={57.5} cy={37} r={10} />
        <rect x={0.5} y={15} width={18} height={44} />
        <rect x={96.5} y={15} width={18} height={44} />
        <rect x={0.5} y={28} width={6} height={18} />
        <rect x={108.5} y={28} width={6} height={18} />
      </g>
    </svg>
  );
}
