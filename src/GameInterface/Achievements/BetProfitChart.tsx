import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatFee } from "@/Domain/money";

const H = 220;
const PAD = { left: 72, right: 16, top: 14, bottom: 28 };

const signed = (v: number) => (v > 0 ? `+${formatFee(v)}` : v === 0 ? "€0" : formatFee(v));
const tone = (v: number) => (v > 0 ? "text-star-green" : v < 0 ? "text-destructive" : "text-muted-foreground");

/** Three round steps covering [lo, hi] (the y axis, zero always inside). */
function ticks(lo: number, hi: number): number[] {
  const span = Math.max(1, hi - lo);
  const raw = span / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) out.push(Math.round(v));
  return out;
}

/** Cumulative betting profit by game date: one line, the zero line, a crosshair with the day under the pointer. */
export function BetProfitChart({ series }: { series: { date: string; profit: number }[] }) {
  const { t, i18n } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const day = (d: string) => new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const geo = useMemo(() => {
    const values = series.map((p) => p.profit);
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    const pad = (hi - lo) * 0.08 || 1000;
    const yLo = lo - (lo < 0 ? pad : 0);
    const yHi = hi + (hi > 0 ? pad : 0) || 1000;
    const plotW = width - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
    const y = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * plotH;
    return { x, y, yTicks: ticks(yLo, yHi), plotW };
  }, [series, width]);

  const path = series.map((p, i) => `${i === 0 ? "M" : "L"}${geo.x(i).toFixed(1)},${geo.y(p.profit).toFixed(1)}`).join("");
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(2, Math.floor(geo.plotW / 80))));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = 0;
    series.forEach((_, i) => { if (Math.abs(geo.x(i) - px) < Math.abs(geo.x(best) - px)) best = i; });
    setHover(best);
  }

  const h = hover !== null ? series[hover] : null;
  const dayNet = h && hover !== null ? h.profit - (hover > 0 ? series[hover - 1]!.profit : 0) : 0;

  return (
    <div ref={box} className="relative w-full">
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={t("bets.stats.chartLabel", { value: signed(series.at(-1)?.profit ?? 0) })}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block touch-none"
      >
        {geo.yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={geo.y(v)} y2={geo.y(v)} className={v === 0 ? "stroke-muted-foreground/60" : "stroke-border"} strokeDasharray={v === 0 ? "4 4" : undefined} strokeWidth={1} />
            <text x={PAD.left - 8} y={geo.y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-sm tabular-nums">{v === 0 ? "€0" : formatFee(v)}</text>
          </g>
        ))}
        {series.map((p, i) => (i % labelEvery === 0 || (i === series.length - 1 && i % labelEvery >= labelEvery * 0.6)) && (
          <text key={p.date} x={geo.x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-sm tabular-nums">{day(p.date)}</text>
        ))}
        {h && hover !== null && <line x1={geo.x(hover)} x2={geo.x(hover)} y1={PAD.top} y2={H - PAD.bottom} className="stroke-muted-foreground/50" strokeWidth={1} />}
        <path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {(series.length === 1 || (h && hover !== null)) && (
          <circle cx={geo.x(hover ?? 0)} cy={geo.y((h ?? series[0]!).profit)} r={4.5} className="fill-primary stroke-card" strokeWidth={2} />
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm whitespace-nowrap"
          style={{ left: Math.min(width - 190, Math.max(0, geo.x(hover) + 12)) }}
        >
          <p className="m-0 font-semibold">{day(h.date)}</p>
          <p className="m-0 text-muted-foreground">{t("bets.stats.dayNet")} <span className={`tabular-nums font-semibold ${tone(dayNet)}`}>{signed(dayNet)}</span></p>
          <p className="m-0 text-muted-foreground">{t("bets.stats.total")} <span className={`tabular-nums font-semibold ${tone(h.profit)}`}>{signed(h.profit)}</span></p>
        </div>
      )}
    </div>
  );
}
