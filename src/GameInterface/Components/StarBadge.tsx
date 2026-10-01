import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import type { StarKind } from "@/Domain/world/stars";

const COLOR: Record<StarKind, string> = {
  gold: "text-amber-400",
  blue: "text-sky-400",
  green: "text-emerald-400",
};

/** Small star next to a player's name: gold = world top 25, blue = great form, green = prodigy. */
export function StarBadge({ kind = "gold", className = "" }: { kind?: StarKind; className?: string }) {
  const { t } = useTranslation();
  const label = t(`players.star.${kind}`);
  return (
    <span title={label} aria-label={label} className={`inline-flex shrink-0 ${className}`}>
      <Icon name="star-filled" size={12} className={COLOR[kind]} />
    </span>
  );
}
