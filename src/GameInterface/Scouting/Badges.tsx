import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import type { ScoutGrade } from "@/types/scoutingTypes";

const GRADE_CLASS: Record<ScoutGrade, string> = {
  A: "bg-primary/20 text-primary border-primary/40",
  B: "bg-chart-3/20 text-chart-3 border-chart-3/40",
  C: "bg-chart-4/20 text-chart-4 border-chart-4/40",
  D: "bg-muted/30 text-muted-foreground border-border",
  E: "bg-destructive/15 text-destructive border-destructive/40",
};

export function GradeBadge({ grade }: { grade: ScoutGrade }) {
  return (
    <span className={`inline-flex items-center justify-center w-8 px-2 py-0.5 rounded border text-sm font-display font-bold ${GRADE_CLASS[grade]}`}>
      {grade}
    </span>
  );
}

export function GemBadge() {
  const { t } = useTranslation();
  return (
    <span title={t("scouting.gem")} className="inline-flex items-center gap-1 text-sm font-semibold text-chart-5">
      <Icon name="gem" size={16} />
      {t("scouting.gem")}
    </span>
  );
}

