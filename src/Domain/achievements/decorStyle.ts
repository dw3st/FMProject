/**
 * Colours and mosaic designs of the stadium decorations (tester report, 8.9.10): ready palettes or two chosen colours,
 * and a pixel-art mosaic (stripes, check, the club crest, a star) where each seat is a dot. Pure.
 */
import type { BannerPattern, DecorPalette, MosaicPattern, StadiumDecor } from "@/types/achievementTypes";

export const DECOR_PALETTES: readonly DecorPalette[] = ["club", "inverted", "black_gold", "blue_white", "green_yellow", "custom"];
export const MOSAIC_PATTERNS: readonly MosaicPattern[] = [
  "stripes", "check", "crest", "star", "heart", "ball", "bolt", "diagonal", "waves", "diamonds",
  "crown", "trophy", "lion", "eagle", "flame", "castle", "titles",
];
export const BANNER_PATTERNS: readonly BannerPattern[] = ["plain", "check", "pinstripe", "chevron"];
export const DECOR_LIGHT = "#f4f4f2";

const FIXED: Partial<Record<DecorPalette, [string, string]>> = {
  black_gold: ["#161616", "#d4af37"],
  blue_white: ["#1e50c8", DECOR_LIGHT],
  green_yellow: ["#148c3c", "#fad214"],
};

const HEX = /^#[0-9a-f]{6}$/i;

/** The two colours of the decorations: [main, second]. The club's are its first colour and a light tone (as before). */
export function decorColors(decor: Pick<StadiumDecor, "palette" | "colors">, clubColor: string): [string, string] {
  const p = decor.palette ?? "club";
  if (p === "inverted") return [DECOR_LIGHT, clubColor];
  if (p === "custom" && decor.colors && HEX.test(decor.colors[0]) && HEX.test(decor.colors[1])) return decor.colors;
  return FIXED[p] ?? [clubColor, DECOR_LIGHT];
}

/** Checks the style fields of a `PUT .../achievements/stadium` body (absent = the defaults). */
export function parseDecorStyle(r: Record<string, unknown>): Pick<StadiumDecor, "palette" | "colors" | "pattern" | "bannerPattern"> {
  const out: Pick<StadiumDecor, "palette" | "colors" | "pattern" | "bannerPattern"> = {};
  if (r.bannerPattern !== undefined) {
    if (!BANNER_PATTERNS.includes(r.bannerPattern as BannerPattern)) throw new Error("invalidDecor");
    out.bannerPattern = r.bannerPattern as BannerPattern;
  }
  if (r.palette !== undefined) {
    if (!DECOR_PALETTES.includes(r.palette as DecorPalette)) throw new Error("invalidDecor");
    out.palette = r.palette as DecorPalette;
  }
  if (r.pattern !== undefined) {
    if (!MOSAIC_PATTERNS.includes(r.pattern as MosaicPattern)) throw new Error("invalidDecor");
    out.pattern = r.pattern as MosaicPattern;
  }
  if (r.colors !== undefined) {
    const c = r.colors;
    if (!Array.isArray(c) || c.length !== 2 || !c.every((x) => typeof x === "string" && HEX.test(x))) throw new Error("invalidDecor");
    out.colors = [c[0].toLowerCase(), c[1].toLowerCase()];
  }
  if (out.palette === "custom" && !out.colors) throw new Error("invalidDecor");
  return out;
}

/** "#" = second colour, "o" = a lighter main colour, "." = main colour. */
export const SHIELD_ART = [
  "....######....", "...#oooooo#...", "..#oooooooo#..", "..#oo####oo#..", "..#oo#..#oo#..", "..#oo#..#oo#..",
  "..#oo####oo#..", "..#oooooooo#..", "...#oooooo#...", "....#oooo#....", ".....#oo#.....", "......##......",
];
export const STAR_ART = [
  "......#......", ".....###.....", ".....###.....", "#############", ".###########.", "...#######...",
  "...#######...", "..####.####..", "..###...###..", ".##.......##.",
];
