import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** Own star for a reborn legend (academy player reborn from a retired world-class star). */
export function RebornBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const label = t("players.reborn");
  return (
    <span title={label} aria-label={label} className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      <Icon name="star-filled" size={12} className="text-chart-5" />
      <span className="text-sm font-semibold text-chart-5">{label}</span>
    </span>
  );
}
