import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";

/** Small gold star shown next to the name of a world top-50 (by overall AVG) player. */
export function StarBadge({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const label = t("players.star");
  return (
    <span title={label} aria-label={label} className={`inline-flex shrink-0 ${className}`}>
      <Icon name="star-filled" size={12} className="text-amber-400" />
    </span>
  );
}
