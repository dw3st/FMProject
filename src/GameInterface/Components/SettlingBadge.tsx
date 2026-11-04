import { useTranslation } from "react-i18next";

/** "Settling in" pill of a new signing (`.claude/rules/game/settling.md`). */
export function SettlingBadge({ games, need, className = "" }: { games: number; need: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      title={t("settling.title", { need })}
      className={`inline-flex shrink-0 items-center rounded bg-chart-4/20 px-2 py-0.5 text-sm font-semibold tabular-nums text-chart-4 ${className}`}
    >
      {t("settling.badge", { games, need })}
    </span>
  );
}
