import { useTranslation } from "react-i18next";
import { Icon, iconOf } from "@/GameInterface/Icons";

const Minus = iconOf("minus");
const TrendingDown = iconOf("trend-down");
const TrendingUp = iconOf("trend-up");

export type TrendDirection = "up" | "stable" | "down";

interface RecentTrendProps {
  trend: readonly TrendDirection[];
}

const directionConfig = {
  up:     { icon: TrendingUp,   color: "text-chart-2" },
  stable: { icon: Minus,        color: "text-muted-foreground" },
  down:   { icon: TrendingDown, color: "text-destructive" },
};

export function RecentTrend({ trend }: RecentTrendProps) {
  const { t } = useTranslation();
  const upCount = trend.filter((t) => t === "up").length;
  const downCount = trend.filter((t) => t === "down").length;

  let overall: TrendDirection = "stable";
  if (upCount > downCount + 1) overall = "up";
  else if (downCount > upCount + 1) overall = "down";

  const overallCfg = directionConfig[overall];
  const OverallIcon = overallCfg.icon;

  return (
    <div className="card-arcade rounded-md p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon name="activity" className="w-5 h-5 text-primary" />
        <h3 className="font-display font-black uppercase text-xl leading-none m-0">
          {t("development.recentFormTitle")}
        </h3>
      </div>

      <div className="flex items-center justify-center gap-2 mb-4">
        {trend.map((dir, idx) => {
          const cfg = directionConfig[dir];
          const Icon = cfg.icon;
          return (
            <div
              key={idx}
              className="w-10 h-10 rounded-lg border border-border/40 bg-muted/20 flex items-center justify-center transition-transform"
            >
              <Icon className={`w-5 h-5 ${cfg.color}`} />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border/30 bg-background/50">
        <OverallIcon className={`w-5 h-5 ${overallCfg.color}`} />
        <span className={`font-semibold ${overallCfg.color}`}>
          {overall === "up" && t("development.trendingUpward")}
          {overall === "stable" && t("development.holdingSteady")}
          {overall === "down" && t("development.trendingDownward")}
        </span>
      </div>
    </div>
  );
}
