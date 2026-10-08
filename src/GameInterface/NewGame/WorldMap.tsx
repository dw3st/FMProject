import { useMemo } from "react";
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
  /** Click on a playable country. Absent: a read-only map (no hand cursor, no click, nothing dimmed). */
  onSelect?: (c: CountryEntry) => void;
  /** Country highlighted right now, shared with the country list (hover or keyboard focus there). */
  hoveredSlug: string | null;
  /** The pointer entered a country on the map (`null` when it leaves the map). */
  onHover: (c: CountryEntry | null) => void;
  /** Fill class of each country (the scout's knowledge map); absent: the new-game colours. */
  fillClassFor?: (c: CountryEntry) => string;
  /** Caption of the highlighted country (default: its name). */
  captionFor?: (c: CountryEntry) => string;
  /** Caption with nothing highlighted (default: the new-game hint). */
  hint?: string;
  /** Country always outlined (the scout's nationality). */
  outlinedSlug?: string | null;
}

/**
 * Clickable world map for the new-game country step. Complementary to the country list (which
 * covers keyboard and screen-reader use), so the drawing itself is `aria-hidden`. The highlighted
 * country is shared with the list: hovering or focusing a row lights the country here, and
 * hovering a country here lights its row.
 */
export function WorldMap({
  countries, selectedSlug, displayName, onSelect, hoveredSlug, onHover, fillClassFor, captionFor, hint, outlinedSlug,
}: WorldMapProps) {
  const { t } = useTranslation();
  const byIso = useMemo(() => [...mappableCountries(countries).entries()], [countries]);
  const selected = countries.find((c) => c.slug === selectedSlug) ?? null;
  const hovered = countries.find((c) => c.slug === hoveredSlug) ?? null;
  const caption = hovered ?? selected;
  const hoveredIsos = byIso.filter(([, c]) => c.slug === hoveredSlug).map(([iso]) => iso);
  const outlinedIsos = outlinedSlug ? byIso.filter(([, c]) => c.slug === outlinedSlug).map(([iso]) => iso) : [];
  const interactive = !!onSelect;

  const fillFor = (country: CountryEntry) =>
    fillClassFor
      ? fillClassFor(country)
      : country.slug === selectedSlug
        ? "fill-primary"
        : country.slug === hoveredSlug
          ? "fill-primary/70"
          : "fill-primary/35";
  const handlersFor = (country: CountryEntry) =>
    !interactive
      ? { onMouseEnter: () => onHover(country) }
      : country.playable
        ? { onMouseEnter: () => onHover(country), onClick: () => onSelect(country) }
        : {};
  const cursorFor = (country: CountryEntry) => (!interactive ? "" : country.playable ? "cursor-pointer" : "opacity-40");

  return (
    <div className="relative w-full">
      <p className="text-sm text-muted-foreground m-0 mb-2 h-5 truncate">
        {caption ? (
          <span className="text-foreground">{captionFor ? captionFor(caption) : displayName(caption)}</span>
        ) : (
          hint ?? t("newGame.mapHint")
        )}
      </p>
      <svg
        viewBox={VIEWBOX}
        className="w-full h-auto block"
        aria-hidden="true"
        onMouseLeave={() => onHover(null)}
      >
        <path d={WORLD_BACKGROUND_PATH} className="fill-border" />
        {byIso.map(([iso, country]) => (
          <g
            key={iso}
            {...handlersFor(country)}
            className={`${fillFor(country)} ${cursorFor(country)} transition-colors motion-reduce:transition-none`}
          >
            <path d={COUNTRY_PATHS[iso]} />
          </g>
        ))}
        {outlinedIsos.map((iso) => (
          <path
            key={`o-${iso}`}
            d={COUNTRY_PATHS[iso]}
            className="fill-none stroke-foreground pointer-events-none"
            strokeWidth={0.8}
            strokeLinejoin="round"
          />
        ))}
        {/* Outline of the highlighted country, drawn over its neighbours (borders are shared). */}
        {hoveredIsos.map((iso) => (
          <path
            key={`h-${iso}`}
            d={COUNTRY_PATHS[iso]}
            className="fill-none stroke-foreground pointer-events-none"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        ))}
        {/* Markers last, so a neighbour's shape (Malta next to Sicily) never covers them. */}
        {byIso.map(([iso, country]) => {
          const marker = COUNTRY_MARKERS[iso];
          if (!marker) return null;
          const lit = country.slug === hoveredSlug;
          return (
            <circle
              key={`m-${iso}`}
              cx={marker[0]}
              cy={marker[1]}
              r={lit ? MARKER_RADIUS * 1.4 : MARKER_RADIUS}
              {...handlersFor(country)}
              className={`${fillFor(country)} ${lit ? "stroke-foreground" : "stroke-background"} ${cursorFor(country)} transition-colors motion-reduce:transition-none`}
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
    </div>
  );
}
