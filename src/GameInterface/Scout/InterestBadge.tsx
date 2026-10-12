import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";
import type { ScoutInterest } from "@/Domain/scout/scoutInterest";

const STYLE: Record<ScoutInterest, { icon: IconName; cls: string }> = {
  interested: { icon: "check-circle", cls: "text-primary" },
  hesitant: { icon: "clock", cls: "text-chart-4" },
  not_coming: { icon: "xcircle", cls: "text-destructive" },
};

/** How keen the player looks on joining the user's club, as the scout reads it (#123). */
export function InterestBadge({ interest }: { interest: ScoutInterest }) {
  const { t } = useTranslation();
  const s = STYLE[interest];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap ${s.cls}`}
      title={t(`scout.interest.${interest}Hint`)}
    >
      <Icon name={s.icon} size={16} aria-hidden />
      {t(`scout.interest.${interest}`)}
    </span>
  );
}
