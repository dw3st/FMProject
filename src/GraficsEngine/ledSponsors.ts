/**
 * The home club's sponsors on the LED boards (12.0, `.claude/rules/game/sponsors.md`): a share of the panels of every
 * flip cycle shows a sponsor in its brand colours, the rest keep the made-up ads. Drawing only, pure.
 */
import { ledAdFor } from "@/GraficsEngine/pitchStyle";
import type { LedLang } from "@/GraficsEngine/ledAds";
import { hexRgb, SPONSOR_ID, SPONSOR_PLATE, sponsorPlateUrl } from "@/Domain/sponsors/sponsorPlate";

export { sponsorPlateUrl };

export interface LedSponsor {
  /** Catalog id: the painted plate is `sponsors/<id>.webp`. */
  id: string;
  name: string;
  /** Hex colours: background, text. */
  colors: [string, string];
  /** Share of the sponsor panels: master 3, kit 2, board 1. */
  weight: number;
}

export const LED_SPONSORS = {
  /** Share of the panels of a cycle that show a sponsor. */
  SHARE: 0.6,
  /** Ids the pages may build a plate URL from (the server serves no other). */
  ID: SPONSOR_ID,
  /** The painted plate: 512 × 170, the symbol in the left third. */
  PLATE: SPONSOR_PLATE,
} as const;

export interface LedPanelAd {
  text: string;
  bg: number;
  fg: number;
  /** A sponsor panel: its catalog id (the plate's symbol may be drawn on the left). */
  sponsorId?: string;
}

function hash(key: string): number {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** "#RRGGBB" / "#RGB" → 0xRRGGBB; anything else → the fallback. */
export function hexColor(hex: string, fallback: number): number {
  const rgb = hexRgb(hex);
  return rgb ? (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] : fallback;
}

/** The sponsor of a panel in a cycle (weighted), or null when the panel shows a generic ad. */
function sponsorIndex(seed: string, cycle: number, panel: number, sponsors: readonly LedSponsor[]): number | null {
  if (hash(`${seed}:${cycle}:${panel}:sp`) / 4294967296 >= LED_SPONSORS.SHARE) return null;
  const total = sponsors.reduce((sum, s) => sum + Math.max(0, s.weight), 0);
  if (total <= 0) return null;
  let r = (hash(`${seed}:${cycle}:${panel}:who`) / 4294967296) * total;
  for (let i = 0; i < sponsors.length; i++) {
    r -= Math.max(0, sponsors[i]!.weight);
    if (r < 0) return i;
  }
  return sponsors.length - 1;
}

/**
 * What a panel shows in a flip cycle. Without sponsors it is exactly `ledAdFor`. With them, about `SHARE` of the panels
 * show a sponsor picked by weight (stable per match seed, cycle and panel; never the same sponsor as the panel before
 * it when there is another), the rest the generic ad they would show anyway.
 */
export function ledPanelFor(
  seed: string, cycle: number, panel: number, lang: LedLang, sponsors?: readonly LedSponsor[] | null,
): LedPanelAd {
  if (!sponsors || sponsors.length === 0) return ledAdFor(seed, cycle, panel, lang);
  if (sponsorIndex(seed, cycle, panel, sponsors) === null) return ledAdFor(seed, cycle, panel, lang);
  // Walk the run of sponsor panels that ends here, so a shifted neighbour is seen as what it really shows.
  let start = panel;
  while (start > 0 && sponsorIndex(seed, cycle, start - 1, sponsors) !== null) start--;
  let i = -1;
  for (let k = start; k <= panel; k++) {
    const raw = sponsorIndex(seed, cycle, k, sponsors)!;
    i = sponsors.length > 1 && raw === i ? (raw + 1) % sponsors.length : raw;
  }
  const s = sponsors[i]!;
  return { text: s.name.toUpperCase(), bg: hexColor(s.colors[0], 0x10141a), fg: hexColor(s.colors[1], 0xffffff), sponsorId: s.id };
}
