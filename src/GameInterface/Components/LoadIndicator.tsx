import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import { isHighLoad } from "@/GameInterface/playerHelpers";

/**
 * High-load warning icon — shown only when `load ≥ 70%` of `FITNESS.LOAD_HIGH`
 * (`src/Domain/fitness/fitnessConfig.ts`). Native `title` tooltip, same pattern as
 * `Dashboard/SquadTable.tsx`'s `FitStatusIcon`. Renders nothing below the threshold.
 */
export function LoadIndicator({
  load,
  size = 14,
  className = "text-orange-400",
}: {
  load: number;
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!isHighLoad(load)) return null;
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      title={t("fitness.highLoadTooltip")}
      aria-label={t("fitness.highLoadTooltip")}
    >
      <Icon name="load" size={size} />
    </span>
  );
}
