import { useTranslation } from "react-i18next";
import type { PlayerSeasonLog } from "@/types/playerTypes";

/** Youth-competition games of the season (`seasonLog.youthCup`): games, goals, assists, average rating. */
export function YouthSeasonLine({ log }: { log: PlayerSeasonLog | undefined }) {
  const { t } = useTranslation();
  const yc = log?.youthCup;
  if (!yc || yc.appearances === 0) return null;
  const items: [string, string][] = [
    [t("youthComps.player.apps"), String(yc.appearances)],
    [t("youthComps.player.goals"), String(yc.goals)],
    [t("youthComps.player.assists"), String(yc.assists)],
    [t("youthComps.player.rating"), (yc.ratingSum / yc.appearances).toFixed(2)],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border px-4 py-3">
      <span className="font-display font-bold uppercase tracking-[0.08em] text-[13px] text-muted-foreground">
        {t("youthComps.player.title")}
      </span>
      {items.map(([label, value]) => (
        <span key={label} className="inline-flex items-baseline gap-1.5 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-display font-bold tabular-nums text-foreground">{value}</span>
        </span>
      ))}
    </div>
  );
}
