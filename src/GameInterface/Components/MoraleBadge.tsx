import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { moraleBand } from "@/Domain/morale/morale";
import type { MoraleBand } from "@/types/moraleTypes";

const BAND_ICON: Record<MoraleBand, IconName> = {
  very_happy: "face-very-happy",
  content: "face-content",
  neutral: "face-neutral",
  unhappy: "face-unhappy",
  furious: "face-furious",
};

/** Text colour of each band (theme tokens only). */
const BAND_TONE: Record<MoraleBand, string> = {
  very_happy: "text-chart-2",
  content: "text-primary",
  neutral: "text-muted-foreground",
  unhappy: "text-chart-4",
  furious: "text-destructive",
};

/**
 * Morale of a human-club player (`.claude/rules/game/morale.md`): face icon + band text.
 * `showValue` adds the number (player screen).
 */
export function MoraleBadge({ morale, showValue = false, className = "" }: { morale: number; showValue?: boolean; className?: string }) {
  const { t } = useTranslation();
  const band = moraleBand(morale);
  return (
    <span
      title={t("morale.title", { value: Math.round(morale) })}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap ${BAND_TONE[band]} ${className}`}
    >
      <Icon name={BAND_ICON[band]} size={16} className="shrink-0" />
      {t(`morale.band.${band}`)}
      {showValue && <span className="tabular-nums text-muted-foreground font-medium">{Math.round(morale)}</span>}
    </span>
  );
}
