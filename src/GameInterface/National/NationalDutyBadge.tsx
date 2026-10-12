import { useTranslation } from "react-i18next";
import { formatDay } from "@/GameInterface/Dashboard/HomeCards";

/** "National team" pill for a player on duty with his national team (`.claude/rules/game/national-teams.md`). */
export function NationalDutyBadge({ until, className = "" }: { until: string; className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <span
      title={t("national.onDuty", { date: formatDay(until, i18n.language) })}
      className={`inline-flex shrink-0 items-center rounded bg-chart-5/20 px-2 py-0.5 text-sm font-semibold text-chart-5 ${className}`}
    >
      {t("national.onDutyShort")}
    </span>
  );
}
