import { useTranslation } from "react-i18next";
import { Icon, type IconName } from "@/GameInterface/Icons";
import { moraleBand } from "@/Domain/morale/morale";
import type { MoraleBand } from "@/types/moraleTypes";
import { MORALE_TONE } from "@/GameInterface/statusColors";

const BAND_ICON: Record<MoraleBand, IconName> = {
  very_happy: "face-very-happy",
  content: "face-content",
  neutral: "face-neutral",
  unhappy: "face-unhappy",
  furious: "face-furious",
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
      className={`inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap ${MORALE_TONE[band]} ${className}`}
    >
      <Icon name={BAND_ICON[band]} size={16} className="shrink-0" />
      {t(`morale.band.${band}`)}
      {showValue && <span className="tabular-nums text-muted-foreground font-medium">{Math.round(morale)}</span>}
    </span>
  );
}
