import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CountryEntry } from "@/types/worldTypes";
import {
  COUNTRY_MARKERS,
  COUNTRY_PATHS,
  WORLD_BACKGROUND_PATH,
  WORLD_MAP_VIEWBOX,
} from "@/GameInterface/NewGame/worldMapPaths";
import { mappableCountries } from "@/GameInterface/NewGame/worldMapCountries";

interface WorldMapProps {
  countries: CountryEntry[];
  selectedSlug: string | null;
  displayName: (c: CountryEntry) => string;
  onSelect: (c: CountryEntry) => void;
}

/**
 * Clickable world map for the new-game country step. Complementary to the country list (which
 * covers keyboard and screen-reader use), so the drawing itself is `aria-hidden`.
 */
export function WorldMap({ countries, selectedSlug, displayName, onSelect }: WorldMapProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<CountryEntry | null>(null);
  const byIso = useMemo(() => [...mappableCountries(countries).entries()], [countries]);
  const selected = countries.find((c) => c.slug === selectedSlug) ?? null;
  const caption = hovered ?? selected;

  return (
    <div className="relative w-full">
      <p className="text-sm text-muted-foreground m-0 mb-2 h-5 truncate">
        {caption ? (
          <span className="text-foreground">{displayName(caption)}</span>
        ) : (
          t("newGame.mapHint")
        )}
      </p>
      <svg
        viewBox={WORLD_MAP_VIEWBOX}
        className="w-full h-auto block"
        aria-hidden="true"
        onMouseLeave={() => setHovered(null)}
      >
        <path d={WORLD_BACKGROUND_PATH} className="fill-border" />
        {byIso.map(([iso, country]) => {
          const isSelected = country.slug === selectedSlug;
          const isHovered = hovered?.slug === country.slug;
          const fill = isSelected
            ? "fill-primary"
            : isHovered
              ? "fill-primary/70"
              : "fill-primary/35";
          const marker = COUNTRY_MARKERS[iso];
          const handlers = country.playable
            ? {
                onMouseEnter: () => setHovered(country),
                onClick: () => onSelect(country),
              }
            : {};
          return (
            <g
              key={iso}
              {...handlers}
              className={`${fill} ${country.playable ? "cursor-pointer" : "opacity-40"} transition-colors`}
            >
              <path d={COUNTRY_PATHS[iso]} />
              {marker && <circle cx={marker[0]} cy={marker[1]} r={4} />}
            </g>
          );
        })}
      </svg>
      <p className="text-[13px] text-muted-foreground m-0 mt-2">{t("newGame.mapAttribution")}</p>
    </div>
  );
}
