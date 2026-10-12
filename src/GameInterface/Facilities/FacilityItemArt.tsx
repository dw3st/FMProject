import type { ReactNode } from "react";
import type { FacilityItemId } from "@/types/facilityTypes";

/** Colour of the art from the item's condition (`conditionTone`): fine, worn (below 40%), bad/closed. */
export type ArtTone = "ok" | "warn" | "bad";

const ACCENT: Record<ArtTone, { fill: string; stroke: string; solid: string }> = {
  ok: { fill: "fill-primary/20", stroke: "stroke-primary", solid: "fill-primary" },
  warn: { fill: "fill-chart-4/20", stroke: "stroke-chart-4", solid: "fill-chart-4" },
  bad: { fill: "fill-destructive/15", stroke: "stroke-destructive", solid: "fill-destructive" },
};

/** Neutral line work of every drawing. */
const LINE = "fill-none stroke-foreground/45";

/**
 * Minimal line drawing of one facility item (#132): a 160×100 SVG in the theme colours, the accent
 * following the condition, hatched when the item is closed. Decorative (`aria-hidden`): the card
 * next to it names the item.
 */
export function FacilityItemArt({
  id, tone, closed = false, works = false, className = "",
}: {
  id: FacilityItemId;
  tone: ArtTone;
  closed?: boolean;
  /** Works under way on the item: a small crane in the corner. */
  works?: boolean;
  className?: string;
}) {
  const a = ACCENT[tone];
  const hatch = `fac-hatch-${id}`;
  return (
    <svg viewBox="0 0 160 100" className={`block w-full h-auto ${className}`} aria-hidden>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="stroke-destructive/60" strokeWidth="3" />
        </pattern>
      </defs>
      <rect x="2" y="2" width="156" height="96" rx="10" className="fill-secondary/30" />
      <g strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{DRAWINGS[id](a)}</g>
      {works && <Crane />}
      {closed && <rect x="2" y="2" width="156" height="96" rx="10" fill={`url(#${hatch})`} />}
    </svg>
  );
}

type Accent = (typeof ACCENT)[ArtTone];

/** Pitch outline with halfway line, centre circle and boxes, inside `x,y,w,h`. */
function Pitch({ x, y, w, h, a, stripes = 0 }: { x: number; y: number; w: number; h: number; a: Accent; stripes?: number }) {
  const box = Math.min(18, w / 5);
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="3" className={`${a.fill} ${a.stroke}`} />
      {Array.from({ length: stripes }, (_, i) => (i % 2 === 0 ? null : (
        <rect key={i} x={x + (w / stripes) * i} y={y} width={w / stripes} height={h} className={a.fill} />
      )))}
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} className={LINE} />
      <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(10, h / 5)} className={LINE} />
      <rect x={x} y={y + h / 2 - h / 4} width={box} height={h / 2} className={LINE} />
      <rect x={x + w - box} y={y + h / 2 - h / 4} width={box} height={h / 2} className={LINE} />
    </>
  );
}

function Crane() {
  return (
    <g strokeWidth="2" strokeLinecap="round" className="fill-none stroke-chart-4">
      <line x1="142" y1="88" x2="142" y2="14" />
      <line x1="120" y1="18" x2="150" y2="18" />
      <line x1="142" y1="26" x2="128" y2="18" />
      <line x1="124" y1="18" x2="124" y2="34" />
      <rect x="120" y="34" width="8" height="6" className="fill-chart-4/30" />
    </g>
  );
}

const DRAWINGS: Record<FacilityItemId, (a: Accent) => ReactNode> = {
  stadiumPitch: (a) => <Pitch x={18} y={14} w={124} h={72} a={a} stripes={8} />,

  seats: (a) => (
    <>
      {[{ y: 64, x: 16, w: 128 }, { y: 44, x: 26, w: 108 }, { y: 24, x: 36, w: 88 }].map((r) => (
        <g key={r.y}>
          <rect x={r.x} y={r.y} width={r.w} height="16" rx="2" className={`${a.fill} ${a.stroke}`} />
          {Array.from({ length: Math.floor(r.w / 12) - 1 }, (_, i) => (
            <line key={i} x1={r.x + 12 * (i + 1)} y1={r.y + 4} x2={r.x + 12 * (i + 1)} y2={r.y + 12} className={LINE} />
          ))}
        </g>
      ))}
      <line x1="10" y1="86" x2="150" y2="86" className={LINE} />
    </>
  ),

  stadiumStructure: (a) => (
    <>
      <polyline points="14,40 34,22 54,40 74,22 94,40 114,22 134,40" className={LINE} />
      <line x1="14" y1="22" x2="134" y2="22" className={LINE} />
      <line x1="14" y1="40" x2="134" y2="40" className={`fill-none ${a.stroke}`} />
      {[30, 130].map((x) => (
        <g key={x}>
          <line x1={x} y1="86" x2={x} y2="52" className={LINE} />
          <rect x={x - 10} y="44" width="20" height="10" rx="2" className={`${a.fill} ${a.stroke}`} />
          {[-5, 0, 5].map((d) => <circle key={d} cx={x + d} cy="49" r="1.6" className={a.solid} />)}
        </g>
      ))}
      <line x1="10" y1="86" x2="150" y2="86" className={LINE} />
    </>
  ),

  trainingPitches: (a) => (
    <>
      <Pitch x={12} y={18} w={64} h={64} a={a} />
      <Pitch x={84} y={18} w={64} h={64} a={a} />
      {[[30, 90], [110, 90]].map(([x, y]) => (
        <polygon key={x} points={`${x},${y! - 6} ${x! - 4},${y} ${x! + 4},${y}`} className={`${a.solid} stroke-none`} />
      ))}
    </>
  ),

  gym: (a) => (
    <>
      <line x1="34" y1="34" x2="126" y2="34" className={LINE} />
      {[30, 40, 120, 130].map((x, i) => (
        <rect key={x} x={x - 4} y={i % 3 === 0 ? 20 : 24} width="8" height={i % 3 === 0 ? 28 : 20} rx="2" className={`${a.fill} ${a.stroke}`} />
      ))}
      <rect x="40" y="62" width="80" height="8" rx="3" className={`${a.fill} ${a.stroke}`} />
      <line x1="50" y1="70" x2="50" y2="86" className={LINE} />
      <line x1="110" y1="70" x2="110" y2="86" className={LINE} />
      <line x1="10" y1="86" x2="150" y2="86" className={LINE} />
    </>
  ),

  pool: (a) => (
    <>
      <rect x="16" y="16" width="128" height="68" rx="6" className={`${a.fill} ${a.stroke}`} />
      {[33, 50, 67].map((y) => <line key={y} x1="24" y1={y} x2="136" y2={y} className={LINE} strokeDasharray="4 5" />)}
      <path d="M30 26 q6 -4 12 0 t12 0" className={`fill-none ${a.stroke}`} />
      <path d="M100 76 q6 -4 12 0 t12 0" className={`fill-none ${a.stroke}`} />
    </>
  ),

  physio: (a) => (
    <>
      <rect x="24" y="52" width="88" height="10" rx="3" className={`${a.fill} ${a.stroke}`} />
      <rect x="24" y="44" width="22" height="8" rx="3" className={LINE} />
      <line x1="32" y1="62" x2="32" y2="86" className={LINE} />
      <line x1="104" y1="62" x2="104" y2="86" className={LINE} />
      <circle cx="128" cy="32" r="16" className={`${a.fill} ${a.stroke}`} />
      <line x1="128" y1="23" x2="128" y2="41" className={`fill-none ${a.stroke}`} strokeWidth="4" />
      <line x1="119" y1="32" x2="137" y2="32" className={`fill-none ${a.stroke}`} strokeWidth="4" />
      <line x1="10" y1="86" x2="150" y2="86" className={LINE} />
    </>
  ),

  canteen: (a) => (
    <>
      <rect x="20" y="22" width="120" height="58" rx="6" className={LINE} />
      <circle cx="64" cy="51" r="20" className={`${a.fill} ${a.stroke}`} />
      <circle cx="64" cy="51" r="11" className={LINE} />
      <line x1="100" y1="34" x2="100" y2="68" className={LINE} />
      {[96, 100, 104].map((x) => <line key={x} x1={x} y1="34" x2={x} y2="42" className={LINE} />)}
      <path d="M116 34 v34 M116 34 q6 6 0 16" className={`fill-none ${a.stroke}`} />
      <rect x="30" y="30" width="12" height="12" rx="2" className={`${a.fill} ${a.stroke}`} />
    </>
  ),

  academyPitches: (a) => (
    <>
      <Pitch x={22} y={18} w={116} h={64} a={a} stripes={6} />
      <rect x="14" y="42" width="8" height="16" className={LINE} />
      <rect x="138" y="42" width="8" height="16" className={LINE} />
      <circle cx="98" cy="62" r="4" className="fill-foreground/70 stroke-none" />
    </>
  ),

  academyLodging: (a) => (
    <>
      <polygon points="30,40 80,14 130,40" className={`${a.fill} ${a.stroke}`} />
      <rect x="36" y="40" width="88" height="46" className={LINE} />
      {[44, 58, 92, 106].map((x) => [48, 64].map((y) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="10" height="9" rx="1" className={`${a.fill} ${a.stroke}`} />
      )))}
      <rect x="74" y="66" width="12" height="20" rx="1" className={LINE} />
      <line x1="10" y1="86" x2="150" y2="86" className={LINE} />
    </>
  ),
};
