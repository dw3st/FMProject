#!/usr/bin/env bun
/**
 * Generates `src/GameInterface/NewGame/worldMapPaths.ts` — the embedded world map used by the
 * new-game country step.
 *
 * Geometry: Natural Earth 1:50m admin-0 countries (public domain), via the `world-atlas`
 * TopoJSON package. Simplified with `topojson-simplify`, projected equirectangular, rounded to
 * 0.1 px on a 1000-wide canvas. Only the countries with a league in the game get their own path
 * (keyed by the game's ISO2 — "GB" is England, drawn with the United Kingdom shape); every other
 * country is merged into one background path.
 *
 * Run: bun scripts/generate-world-map.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import { presimplify, simplify, quantile } from "topojson-simplify";
import world from "world-atlas/countries-50m.json";

/** Natural Earth numeric ISO 3166 id → the game's ISO2 (only the countries that have a league). */
const NUMERIC_TO_GAME_ISO2: Record<string, string> = {
  "826": "GB", "250": "FR", "276": "DE", "380": "IT", "724": "ES", "076": "BR", "784": "AE",
  "008": "AL", "051": "AM", "032": "AR", "040": "AT", "036": "AU", "056": "BE", "100": "BG",
  "112": "BY", "756": "CH", "152": "CL", "120": "CM", "170": "CO", "196": "CY", "203": "CZ",
  "208": "DK", "012": "DZ", "818": "EG", "246": "FI", "242": "FJ", "268": "GE", "288": "GH",
  "300": "GR", "191": "HR", "348": "HU", "360": "ID", "376": "IL", "364": "IR", "352": "IS",
  "392": "JP", "404": "KE", "398": "KZ", "470": "MT", "484": "MX", "566": "NG", "528": "NL",
  "578": "NO", "604": "PE", "616": "PL", "620": "PT", "600": "PY", "688": "RS", "643": "RU",
  "682": "SA", "752": "SE", "705": "SI", "703": "SK", "792": "TR", "804": "UA", "840": "US",
  "858": "UY", "860": "UZ", "862": "VE", "710": "ZA",
};

const WIDTH = 1000;
const K = WIDTH / 360;
const LAT_TOP = 84;
const LAT_BOTTOM = -57; // crops Antarctica
const HEIGHT = Math.round((LAT_TOP - LAT_BOTTOM) * K);
/** Background polygons smaller than this (px², projected) are dropped to save bytes. */
const MIN_BG_AREA = 2;
/** A country whose projected box is smaller than this gets a dot marker so it stays clickable. */
const MARKER_MAX_SIZE = 8;

type Ring = number[][];
type Polygon = Ring[];

const project = ([lon, lat]: number[]): [number, number] => [
  Math.round((lon! + 180) * K * 10) / 10,
  Math.round((LAT_TOP - lat!) * K * 10) / 10,
];

/** Rings crossing the antimeridian (Russia, Fiji) are unwrapped to the east; the viewBox clips it. */
function unwrap(poly: Polygon): Polygon {
  const lons = poly[0]!.map((p) => p[0]!);
  if (Math.max(...lons) - Math.min(...lons) <= 180) return poly;
  return poly.map((ring) => ring.map(([lon, lat]) => [lon! < 0 ? lon! + 360 : lon!, lat!]));
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

function ringPath(ring: [number, number][]): string {
  const pts: [number, number][] = [];
  for (const p of ring) {
    const last = pts[pts.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
  }
  if (pts.length < 3) return "";
  return "M" + pts.map(([x, y]) => `${x} ${y}`).join("L") + "Z";
}

function polygonsOf(geometry: { type: string; coordinates: unknown }): Polygon[] {
  if (geometry.type === "Polygon") return [geometry.coordinates as Polygon];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Polygon[];
  return [];
}

const topo = presimplify(world as any);
const simplified = simplify(topo, quantile(topo, Number(process.env.MAP_Q ?? 0.05))) as any;
const countries = feature(simplified, simplified.objects.countries) as any;

const rawCountries = feature(world as any, (world as any).objects.countries) as any;

const countryPaths: Record<string, string> = {};
const boxes: Record<string, [number, number, number, number]> = {};
const markers: Record<string, [number, number]> = {};
const background: string[] = [];

function draw(geometry: { type: string; coordinates: unknown }, keepTiny: boolean) {
  const parts: string[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygonsOf(geometry)) {
    const projected = unwrap(poly).map((ring) => ring.map(project));
    const outer = projected[0]!;
    if (outer.every(([, y]) => y > HEIGHT)) continue; // Antarctica & far south
    const area = ringArea(outer);
    if (!keepTiny && area < MIN_BG_AREA) continue;
    // A ring that rounds away to nothing draws nothing: it must not grow the box either, or a
    // tiny country (Fiji) gets a world-wide box from invisible slivers and never gets a marker.
    if (!ringPath(outer)) continue;
    for (const [x, y] of outer) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    for (const ring of projected) {
      const d = ringPath(ring);
      if (d) parts.push(d);
    }
  }
  return { d: parts.join(""), box: [minX, minY, maxX, maxY] as [number, number, number, number] };
}

for (const f of countries.features) {
  if (!f.geometry) continue;
  const iso2 = NUMERIC_TO_GAME_ISO2[String(f.id)];
  if (!iso2) {
    background.push(draw(f.geometry, false).d);
    continue;
  }
  let { d, box } = draw(f.geometry, true);
  if (!d) {
    // Simplification collapsed a tiny country (Malta): fall back to the full-detail geometry.
    const raw = rawCountries.features.find((r: { id: string; geometry: unknown }) => r.id === f.id && r.geometry);
    ({ d, box } = draw(raw.geometry, true));
  }
  if (!d) continue;
  // Some ids appear on several features (Australia + Ashmore Is.): append, never overwrite.
  countryPaths[iso2] = (countryPaths[iso2] ?? "") + d;
  const prev = boxes[iso2];
  boxes[iso2] = prev
    ? [Math.min(prev[0], box[0]), Math.min(prev[1], box[1]), Math.max(prev[2], box[2]), Math.max(prev[3], box[3])]
    : box;
}

for (const [iso2, [minX, minY, maxX, maxY]] of Object.entries(boxes)) {
  if (maxX - minX < MARKER_MAX_SIZE && maxY - minY < MARKER_MAX_SIZE) {
    markers[iso2] = [Math.round((minX + maxX) * 5) / 10, Math.round((minY + maxY) * 5) / 10];
  }
}

const missing = Object.values(NUMERIC_TO_GAME_ISO2).filter((iso) => !countryPaths[iso]);
if (missing.length > 0) throw new Error(`No geometry for: ${missing.join(", ")}`);

const out = `// GENERATED by scripts/generate-world-map.ts — do not edit by hand.
// Geometry: Natural Earth 1:50m admin-0 countries (public domain, naturalearthdata.com),
// via the world-atlas package, simplified and projected equirectangular.

export const WORLD_MAP_VIEWBOX = "0 0 ${WIDTH} ${HEIGHT}";

/** Every country without a league in the game, merged into one path. */
export const WORLD_BACKGROUND_PATH =
  ${JSON.stringify(background.join(""))};

/** One path per game country with a league, keyed by the game's ISO2 ("GB" = England). */
export const COUNTRY_PATHS: Record<string, string> = ${JSON.stringify(countryPaths, null, 2)};

/** A country whose drawn box is smaller than this (viewBox units) gets a dot marker. */
export const MARKER_MAX_SIZE = ${MARKER_MAX_SIZE};

/** Centre of countries too small to click on the map (dot marker drawn on top). */
export const COUNTRY_MARKERS: Record<string, [number, number]> = ${JSON.stringify(markers)};
`;

const target = fileURLToPath(new URL("../src/GameInterface/NewGame/worldMapPaths.ts", import.meta.url));
writeFileSync(target, out, "utf8");
console.log(`wrote ${target} — ${(out.length / 1024).toFixed(1)} KB, markers: ${Object.keys(markers).join(", ")}`);
