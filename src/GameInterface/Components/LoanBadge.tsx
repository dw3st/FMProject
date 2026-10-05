import { useTranslation } from "react-i18next";

/** "On loan" pill for a player borrowed from another club (`.claude/rules/game/negotiation.md`). */
export function LoanBadge({ from, until, className = "" }: { from?: string; until?: string; className?: string }) {
  const { t } = useTranslation();
  const title = from ? t("negotiation.loanBadgeTitle", { club: from, date: until ?? "" }) : undefined;
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded bg-chart-3/20 px-2 py-0.5 text-sm font-semibold text-chart-3 ${className}`}
    >
      {t("negotiation.onLoan")}
    </span>
  );
}
