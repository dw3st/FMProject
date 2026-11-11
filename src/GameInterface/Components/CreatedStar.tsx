import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** A player made in the achievements shop (`createdPlayer`, id `created_…`). */
export function isCreatedPlayer(id: string): boolean {
  return id.startsWith("created_");
}

/** The cyan star before a created player's name (tester report, option B, star only). */
export function CreatedStar({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const label = t("achievements.shop.createdMark");
  return (
    <span className={`inline-flex shrink-0 text-chart-2 ${className}`} title={label} aria-label={label} role="img">
      <Icon name="star-filled" size={16} />
    </span>
  );
}
