import { useTranslation } from "react-i18next";

/** "Suspended" pill for a player serving a match ban (`.claude/rules/game/discipline.md`). */
export function SuspendedBadge({ matches, className = "" }: { matches?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      title={t("players.suspendedMatches", { count: matches ?? 1 })}
      className={`inline-flex shrink-0 items-center rounded bg-chart-4/20 px-2 py-0.5 text-sm font-semibold text-chart-4 ${className}`}
    >
      {t("players.suspended")}
    </span>
  );
}
