import { useTranslation } from "react-i18next";
import { kitDotStyle } from "@/GameInterface/matchTeamColors";

/**
 * Stage 17 (`player-scores.md` → "Momentum"): FM's momentum bar. `bar` −1..+1 with + = the left side on top (the caller
 * flips the engine's A/B for the display); `timeline` the bar at each minute, drawn as a small strip of columns.
 * Dumb: props in (`useMomentum` feeds it on the match screens).
 */
export function MomentumBar({ bar, colorLeft, colorRight, nameLeft, nameRight, timeline }: {
  bar: number;
  colorLeft: string;
  colorRight: string;
  nameLeft?: string;
  nameRight?: string;
  timeline?: number[];
}) {
  const { t } = useTranslation();
  const v = Math.max(-1, Math.min(1, bar));
  const pct = Math.round(Math.abs(v) * 50);
  const leftOn = v >= 0;
  const label = t("match.momentum.title");
  const lean = Math.abs(v) < 0.08
    ? t("match.momentum.even")
    : t("match.momentum.onTop", { team: (leftOn ? nameLeft : nameRight) ?? t(leftOn ? "match.momentum.left" : "match.momentum.right") });
  return (
    <div className="py-1.5" title={`${label}: ${lean}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{lean}</span>
      </div>
      <div className="mt-1 relative h-2 rounded bg-border overflow-hidden" role="meter" aria-label={label} aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
        <div className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/60" />
        <div
          className="absolute inset-y-0 transition-[width] duration-500"
          style={{ ...kitDotStyle(leftOn ? colorLeft : colorRight), width: `${pct}%`, ...(leftOn ? { right: "50%" } : { left: "50%" }) }}
        />
      </div>
      {timeline && timeline.length > 1 && (
        <svg className="mt-1 w-full h-6 block" viewBox={`0 0 ${timeline.length} 2`} preserveAspectRatio="none" aria-hidden="true">
          {timeline.map((b, i) => {
            const h = Math.min(1, Math.abs(b));
            return <rect key={i} x={i + 0.1} width={0.8} y={b >= 0 ? 1 - h : 1} height={h} fill={b >= 0 ? colorLeft : colorRight} opacity={0.8} />;
          })}
        </svg>
      )}
    </div>
  );
}
