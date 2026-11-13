/**
 * A sponsor's brand plate (12.0, `.claude/rules/game/sponsors.md`): where its painted image lives and how its colours
 * read. Pure; shared by the screens (`SponsorPlate`), the LED boards and the watch-look sanitiser.
 */
import { gameArtUrl } from "@/Domain/art/paintedFaces";

/** Catalog-shaped ids: the only ones a plate URL is built from (and the only ones the server serves). */
export const SPONSOR_ID = /^sp_[a-z0-9_]{1,80}$/;

/** The painted plate: 512 × 170, background exactly the brand's, the symbol in the left third, no text. */
export const SPONSOR_PLATE = { w: 512, h: 170, symbol: 170 } as const;

/** Below this luma (0..255) a plate gets a thin border, so it does not vanish on the game's dark background. */
export const DARK_PLATE_LUMA = 60;

/** URL of a sponsor's painted plate, null for an id the server would not serve. */
export function sponsorPlateUrl(id: string): string | null {
  return SPONSOR_ID.test(id) ? gameArtUrl(`sponsors/${id}.webp`) : null;
}

/** "#RRGGBB" / "#RGB" → [r, g, b]; null for anything else. */
export function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(hex);
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Perceived brightness 0..255 of a hex colour (255 when it cannot be read: no border then). */
export function colorLuma(hex: string): number {
  const rgb = hexRgb(hex);
  return rgb ? 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] : 255;
}

export function isDarkPlate(background: string): boolean {
  return colorLuma(background) < DARK_PLATE_LUMA;
}

/** The colour as a CSS value with an alpha (the dark plate's border); null when it is not a hex colour. */
export function colorWithAlpha(hex: string, alpha: number): string | null {
  const rgb = hexRgb(hex);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : null;
}
