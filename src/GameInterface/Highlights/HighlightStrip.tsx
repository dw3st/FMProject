import { useTranslation } from "react-i18next";
import type { PlaybackView } from "@/GameEngine/Support/HighlightPlayback";
import { getHighlightLiveSeconds } from "@/GameEngine/Domain/HighlightTracker";

/** Live seconds of a match without extra time (two halves of 45' and a little stoppage). */
const MATCH_LIVE_S = 2 * 2700 + 240;

/**
 * Timeline of mode B (stage 19, `live-modes.md`): the lances of the level shown (the forecast's final windows), the
 * stretch already forecast, and where the match is now. Drawing only; re-rendered with the match screen's state.
 */
export function HighlightStrip({ view }: { view: PlaybackView }) {
  const { t } = useTranslation();
  const now = getHighlightLiveSeconds();
  const last = view.windows.at(-1)?.end ?? 0;
  const total = Math.max(MATCH_LIVE_S, view.forecastClock, last, now);
  const pct = (s: number) => `${Math.max(0, Math.min(100, (s / total) * 100))}%`;
  return (
    <div className="flex items-center gap-3 w-full" aria-label={t("match.highlights.timeline")}>
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground whitespace-nowrap tabular-nums">
        {t("match.highlights.count", { count: view.windows.length })}
      </span>
      <div className="relative flex-1 h-2.5 rounded bg-border overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-secondary" style={{ width: pct(view.forecastClock) }} />
        {view.windows.map((w) => (
          <div
            key={w.id}
            className={`absolute inset-y-0 ${w.level === "main" ? "bg-primary" : w.level === "extended" ? "bg-chart-4" : "bg-muted-foreground"}`}
            style={{ left: pct(w.start), width: `max(2px, ${pct(w.end - w.start)})` }}
            title={`${w.minute + 1}'`}
          />
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pct(now) }} />
      </div>
    </div>
  );
}
