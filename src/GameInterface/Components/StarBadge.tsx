import { useTranslation } from "react-i18next";
import { Icon } from "@/GameInterface/Icons";
import type { StarKind } from "@/Domain/world/stars";
import { CreatedStar } from "@/GameInterface/Components/CreatedStar";

/** Fixed colours, the same as the badge on the pitch (`starBadge.ts`): never the club hue. */
const COLOR: Record<StarKind, string> = {
  gold: "text-star-gold",
  blue: "text-star-blue",
  green: "text-star-green",
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

/** What each star means, under the squad table (tester report, 8.9.33). */
export function StarLegend() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {(["gold", "blue", "green"] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1"><StarBadge kind={k} />{t(`players.star.${k}`)}</span>
      ))}
      <span className="inline-flex items-center gap-1"><CreatedStar />{t("achievements.shop.createdMark")}</span>
    </span>
  );
}
