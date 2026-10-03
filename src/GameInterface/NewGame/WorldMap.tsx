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

/**
 * Dot radius for the countries too small to click, in viewBox units (1000 wide). The map is only
 * shown from `xl`, where it renders ~700–1060 px wide (1600 px frame − both side columns), so
 * r = 5 is a ~7–11 px dot on screen.
 */
const MARKER_RADIUS = 5;

/**
 * The drawing is cropped to the populated latitudes: the generated map spans 84°N to 57°S
 * (`WORLD_MAP_VIEWBOX`); the top 33 units (84°N to ~72°N: the Arctic islands and northern
 * Greenland, no league there) are cut so the countries render larger in the same width.
 */
const CROP_TOP = 33;
const [, , VIEW_W, VIEW_H] = WORLD_MAP_VIEWBOX.split(" ").map(Number) as [number, number, number, number];
const VIEWBOX = `0 ${CROP_TOP} ${VIEW_W} ${VIEW_H - CROP_TOP}`;

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

  const fillFor = (country: CountryEntry) =>
    country.slug === selectedSlug
      ? "fill-primary"
      : hovered?.slug === country.slug
        ? "fill-primary/70"
        : "fill-primary/35";
  const handlersFor = (country: CountryEntry) =>
    country.playable
      ? { onMouseEnter: () => setHovered(country), onClick: () => onSelect(country) }
      : {};

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
        viewBox={VIEWBOX}
        className="w-full h-auto block"
        aria-hidden="true"
        onMouseLeave={() => setHovered(null)}
      >
        <path d={WORLD_BACKGROUND_PATH} className="fill-border" />
        {byIso.map(([iso, country]) => (
          <g
            key={iso}
            {...handlersFor(country)}
            className={`${fillFor(country)} ${country.playable ? "cursor-pointer" : "opacity-40"} transition-colors`}
          >
            <path d={COUNTRY_PATHS[iso]} />
          </g>
        ))}
        {/* Markers last, so a neighbour's shape (Malta next to Sicily) never covers them. */}
        {byIso.map(([iso, country]) => {
          const marker = COUNTRY_MARKERS[iso];
          if (!marker) return null;
          return (
            <circle
              key={`m-${iso}`}
              cx={marker[0]}
              cy={marker[1]}
              r={MARKER_RADIUS}
              {...handlersFor(country)}
              className={`${fillFor(country)} stroke-background ${country.playable ? "cursor-pointer" : "opacity-40"} transition-colors`}
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
    </div>
  );
}
