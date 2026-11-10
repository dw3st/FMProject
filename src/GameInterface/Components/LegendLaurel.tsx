import { useTranslation } from "react-i18next";
import { GAME_ART_VERSION } from "@/Domain/art/paintedFaces";

/** Published path of the painted wreath (`GAME_ART_FILES`). */
export const LEGEND_LAUREL_FILE = "medals/legend-laurel.png";

/** Colour of the name of a player who came back from retirement as a reborn legend. */
export const LEGEND_NAME_CLASS = "text-star-gold";

/** The wreath next to the name of a reborn legend. */
export function LegendLaurel({ size = 24, className = "" }: { size?: number; className?: string }) {
  const { t } = useTranslation();
  const label = t("players.rebornLegend");
  return (
    <img
      src={`/assets/game/${GAME_ART_VERSION}/${LEGEND_LAUREL_FILE}`}
      alt={label}
      title={label}
      width={size}
      height={size}
      className={`inline-block shrink-0 align-middle ${className}`}
    />
  );
}
