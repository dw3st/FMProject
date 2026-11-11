import type { ReactNode } from "react";
import { DECOR_ITEMS, type DecorItemId } from "@/Domain/achievements/decorShop";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { decorFill, decorRects, hexNumber } from "@/GraficsEngine/stadiumDecor";
import { standSideRects } from "@/GraficsEngine/crowd";
import { prefersReducedMotion } from "@/GraficsEngine/motionPrefs";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import type { BannerPattern, MosaicPattern, StadiumDecor } from "@/types/achievementTypes";

/**
 * Shop preview of a stadium decoration (9.4.1, tester report): the stadium seen from above as in the match, the
 * mosaic held up by the home fans in their end, the banner along the pitch, and each effect animated.
 */
const W = 160;
const H = 96;
const SHOWCASE = ["#1f4fa8", "#ffc93c"] as const;
const COLORS: [number, number] = [hexNumber(SHOWCASE[0]), hexNumber(SHOWCASE[1])];
const STAND: StandGeometry = {
  outer: { x: 0, y: 0, w: W, h: H },
  inner: { x: 34, y: 12, w: W - 68, h: H - 24 },
  thickness: { top: 12, bottom: 12, left: 34, right: 34 },
};
const BANNER_OF: Partial<Record<DecorItemId, BannerPattern>> = { bannerCheck: "check", bannerPinstripe: "pinstripe", bannerChevron: "chevron" };
const NEUTRAL = ["#7d8597", "#5b6476", "#9a9486", "#454d5e", "#8a4444"];
const SPARKS = ["#ffc93c", "#ff5a5f", "#5ad1ff", "#ffffff", "#7dff8a"];
const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** The decoration of each item, on the showcase palette. */
function decorFor(id: DecorItemId): StadiumDecor {
  const item = DECOR_ITEMS[id];
  if (item.kind === "mosaic") return { banner: false, flag: false, mosaic: true, pattern: id as MosaicPattern, titleStars: 3 };
  if (item.kind === "banner") return { banner: true, flag: false, mosaic: false, bannerPattern: BANNER_OF[id] ?? "plain" };
  const withMosaic = id === "doubleEnd" || id === "goalFlash";
  return { banner: false, flag: false, mosaic: withMosaic, pattern: "star", owned: [id] };
}

/** Fans in every stand: pixel heads, the home colours in the home end and the side stands next to it. */
function Crowd() {
  const rng = mulberry32(seedFrom("decor-preview-crowd"));
  const out: ReactNode[] = [];
  const step = 3;
  for (const r of standSideRects(STAND)) {
    for (let y = r.y + 1; y < r.y + r.h - 1; y += step) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x += step) {
        if (rng() > 0.86) continue;
        const home = x < W * 0.45;
        const fill = home && rng() < 0.7 ? SHOWCASE[rng() < 0.6 ? 0 : 1] : NEUTRAL[Math.floor(rng() * NEUTRAL.length)]!;
        out.push(<rect key={`${x}-${y}`} x={x} y={y} width={2.1} height={2.1} fill={fill} />);
      }
    }
  }
  return <g opacity={0.8}>{out}</g>;
}

function Pitch() {
  const { x, y, w, h } = STAND.inner;
  const px = x + 3, py = y + 3, pw = w - 6, ph = h - 6;
  const cy = py + ph / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#2f6d3a" />
      {[0, 2, 4, 6].map((k) => <rect key={k} x={px + (k * pw) / 8} y={py} width={pw / 8} height={ph} fill="#357a41" />)}
      <g fill="none" stroke="#e8f0e0" strokeOpacity={0.75} strokeWidth={0.6}>
        <rect x={px} y={py} width={pw} height={ph} />
        <line x1={px + pw / 2} y1={py} x2={px + pw / 2} y2={py + ph} />
        <circle cx={px + pw / 2} cy={cy} r={7} />
        <rect x={px} y={cy - 13} width={12} height={26} />
        <rect x={px + pw - 12} y={cy - 13} width={12} height={26} />
      </g>
      <rect x={px - 2} y={cy - 4} width={2} height={8} fill="#f4f4f4" opacity={0.85} />
      <rect x={px + pw} y={cy - 4} width={2} height={8} fill="#f4f4f4" opacity={0.85} />
    </g>
  );
}

/** The decoration rectangles; the fans' heads over the mosaic so it reads as cards held up. */
function Decor({ decor, skip }: { decor: StadiumDecor; skip?: (r: { x: number }) => boolean }) {
  const rects = decorRects(STAND, "left", decor);
  return (
    <g shapeRendering="crispEdges">
      {rects.filter((r) => !skip?.(r)).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w + 0.25} height={r.h + 0.25} fill={toHex(decorFill(r, COLORS))} opacity={Math.min(1, r.alpha + 0.1)} />
      ))}
    </g>
  );
}

function MosaicHeads({ both }: { both: boolean }) {
  const sides = standSideRects(STAND).filter((s) => s.side === "left" || (both && s.side === "right"));
  const out: ReactNode[] = [];
  for (const r of sides) {
    for (let y = r.y + 1; y < r.y + r.h; y += 3) for (let x = r.x + 1; x < r.x + r.w; x += 3) {
      out.push(<circle key={`${r.side}${x}-${y}`} cx={x} cy={y} r={0.55} fill="#000" opacity={0.28} />);
    }
  }
  return <g>{out}</g>;
}

/** Flags on the side stands, waving on their poles. */
function Flags({ calm }: { calm: boolean }) {
  const flags: ReactNode[] = [];
  for (const [k, top] of [[0, true], [1, true], [0, false], [1, false]] as const) {
    const x = 40 + k * 13;
    const y = top ? 1.5 : H - 10.5;
    flags.push(
      <g key={`${k}${top}`} transform={`translate(${x} ${y})`}>
        <rect x={-0.4} y={-0.5} width={0.8} height={10} fill="#d8d8d8" />
        <g>
          {!calm && <animateTransform attributeName="transform" type="skewY" values="0;9;0;-9;0" dur={`${1.1 + k * 0.25}s`} repeatCount="indefinite" />}
          <rect x={0.4} y={0} width={10} height={9} fill={SHOWCASE[0]} />
          <rect x={3.7} y={0} width={3.4} height={9} fill={SHOWCASE[1]} />
        </g>
      </g>,
    );
  }
  return <g>{flags}</g>;
}

/** Flares in the home end with smoke drifting over the pitch. */
function Flares({ calm }: { calm: boolean }) {
  const spots = [[10, 22], [22, 34], [8, 50], [24, 62], [14, 76]] as const;
  return (
    <g>
      {spots.map(([x, y], i) => (
        <g key={i}>
          {[0, 1, 2].map((s) => (
            <circle key={s} cx={x} cy={y} r={3} fill="#9aa0aa" opacity={calm ? 0.25 : 0}>
              {!calm && <>
                <animate attributeName="cx" values={`${x};${x + 34}`} dur="3s" begin={`${i * 0.4 + s}s`} repeatCount="indefinite" />
                <animate attributeName="cy" values={`${y};${y - 8}`} dur="3s" begin={`${i * 0.4 + s}s`} repeatCount="indefinite" />
                <animate attributeName="r" values="2.5;10" dur="3s" begin={`${i * 0.4 + s}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.55;0" dur="3s" begin={`${i * 0.4 + s}s`} repeatCount="indefinite" />
              </>}
            </circle>
          ))}
          <circle cx={x} cy={y} r={4.5} fill="#ff7a1f" opacity={0.35}>
            {!calm && <animate attributeName="r" values="3.5;5.5;3.5" dur="0.5s" begin={`${i * 0.13}s`} repeatCount="indefinite" />}
          </circle>
          <circle cx={x} cy={y} r={1.6} fill="#fff1c2">
            {!calm && <animate attributeName="opacity" values="1;0.5;1" dur="0.35s" begin={`${i * 0.09}s`} repeatCount="indefinite" />}
          </circle>
        </g>
      ))}
    </g>
  );
}

/** Firework shells bursting over the stadium. */
function Fireworks({ calm }: { calm: boolean }) {
  const shells = [[62, 30, 0], [102, 22, 0.7], [84, 58, 1.4], [124, 46, 2.1]] as const;
  const n = 14;
  return (
    <g>
      {shells.map(([cx, cy, begin], s) => (
        <g key={s}>
          {Array.from({ length: n }, (_, i) => {
            const a = (i / n) * Math.PI * 2;
            const r = 13;
            const color = SPARKS[(s + i) % SPARKS.length]!;
            return (
              <rect key={i} x={cx + (calm ? Math.cos(a) * r * 0.7 : 0)} y={cy + (calm ? Math.sin(a) * r * 0.7 : 0)} width={1.8} height={1.8} fill={color} opacity={calm ? 0.9 : 0}>
                {!calm && <>
                  <animate attributeName="x" values={`${cx};${cx + Math.cos(a) * r};${cx + Math.cos(a) * r}`} keyTimes="0;0.55;1" dur="2.8s" begin={`${begin}s`} repeatCount="indefinite" />
                  <animate attributeName="y" values={`${cy};${cy + Math.sin(a) * r};${cy + Math.sin(a) * r + 4}`} keyTimes="0;0.55;1" dur="2.8s" begin={`${begin}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0;1;0.8;0;0" keyTimes="0;0.05;0.5;0.75;1" dur="2.8s" begin={`${begin}s`} repeatCount="indefinite" />
                </>}
              </rect>
            );
          })}
          {!calm && (
            <circle cx={cx} cy={cy} r={3} fill="#fff6d0" opacity={0}>
              <animate attributeName="opacity" values="0;0.9;0;0" keyTimes="0;0.04;0.15;1" dur="2.8s" begin={`${begin}s`} repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}
    </g>
  );
}

/** A goal in the home end lights the mosaic up. */
function GoalFlash({ calm }: { calm: boolean }) {
  const left = standSideRects(STAND).find((s) => s.side === "left")!;
  const goalX = STAND.inner.x + 2;
  return (
    <g>
      <circle cx={goalX} cy={H / 2} r={1.6} fill="#ffffff">
        {!calm && <animate attributeName="cx" values={`${W / 2};${goalX};${goalX};${W / 2}`} keyTimes="0;0.35;0.99;1" dur="2.6s" repeatCount="indefinite" />}
      </circle>
      <rect x={left.x} y={left.y} width={left.w} height={left.h} fill="#fff7c8" opacity={calm ? 0.35 : 0} style={{ mixBlendMode: "screen" }}>
        {!calm && <animate attributeName="opacity" values="0;0;0.7;0.1;0.6;0;0" keyTimes="0;0.35;0.42;0.5;0.58;0.7;1" dur="2.6s" repeatCount="indefinite" />}
      </rect>
    </g>
  );
}

export function DecorPreview({ id }: { id: DecorItemId }) {
  const calm = prefersReducedMotion();
  const decor = decorFor(id);
  const flags = id === "sideFlags";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full aspect-[5/3] rounded border border-border" role="img" aria-hidden="true">
      <rect x={0} y={0} width={W} height={H} fill="#262c38" />
      <Crowd />
      <Pitch />
      <Decor decor={flags ? { ...decor, owned: [] } : decor} />
      {decor.mosaic && <MosaicHeads both={id === "doubleEnd"} />}
      {flags && <Flags calm={calm} />}
      {id === "flares" && <Flares calm={calm} />}
      {id === "fireworks" && <Fireworks calm={calm} />}
      {id === "goalFlash" && <GoalFlash calm={calm} />}
    </svg>
  );
}
