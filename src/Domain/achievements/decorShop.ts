/**
 * Stadium decorations bought with the manager's own money (tester report, 9.1): new pixel-art mosaics, banner patterns
 * and legendary effects. The free ones (stripes, check, crest, star, the plain banner) stay unlocked by achievement
 * points. Bought items stay with the manager from club to club, like his belongings, and count for his fame. Pure.
 */
import type { BannerPattern, MosaicPattern } from "@/types/achievementTypes";

export type DecorRarity = "common" | "rare" | "legendary";
export type DecorItemKind = "mosaic" | "banner" | "effect";

export interface DecorItem {
  kind: DecorItemKind;
  price: number;
  rarity: DecorRarity;
}

export const DECOR_ITEMS = {
  heart: { kind: "mosaic", price: 50_000, rarity: "common" },
  ball: { kind: "mosaic", price: 80_000, rarity: "common" },
  bolt: { kind: "mosaic", price: 100_000, rarity: "common" },
  diagonal: { kind: "mosaic", price: 120_000, rarity: "common" },
  waves: { kind: "mosaic", price: 150_000, rarity: "common" },
  diamonds: { kind: "mosaic", price: 200_000, rarity: "common" },
  crown: { kind: "mosaic", price: 500_000, rarity: "rare" },
  trophy: { kind: "mosaic", price: 800_000, rarity: "rare" },
  lion: { kind: "mosaic", price: 1_200_000, rarity: "rare" },
  eagle: { kind: "mosaic", price: 1_500_000, rarity: "rare" },
  flame: { kind: "mosaic", price: 1_800_000, rarity: "rare" },
  castle: { kind: "mosaic", price: 2_000_000, rarity: "rare" },
  titles: { kind: "mosaic", price: 10_000_000, rarity: "legendary" },
  bannerCheck: { kind: "banner", price: 100_000, rarity: "common" },
  bannerPinstripe: { kind: "banner", price: 100_000, rarity: "common" },
  bannerChevron: { kind: "banner", price: 100_000, rarity: "common" },
  sideFlags: { kind: "effect", price: 1_000_000, rarity: "rare" },
  flares: { kind: "effect", price: 5_000_000, rarity: "rare" },
  doubleEnd: { kind: "effect", price: 25_000_000, rarity: "legendary" },
  fireworks: { kind: "effect", price: 30_000_000, rarity: "legendary" },
  goalFlash: { kind: "effect", price: 50_000_000, rarity: "legendary" },
} as const satisfies Record<string, DecorItem>;

export type DecorItemId = keyof typeof DECOR_ITEMS;
export const DECOR_ITEM_IDS = Object.keys(DECOR_ITEMS) as DecorItemId[];

export const FREE_MOSAICS: readonly MosaicPattern[] = ["stripes", "check", "crest", "star"];
const BANNER_ITEM: Record<Exclude<BannerPattern, "plain">, DecorItemId> = { check: "bannerCheck", pinstripe: "bannerPinstripe", chevron: "bannerChevron" };

export function isDecorItem(id: unknown): id is DecorItemId {
  return typeof id === "string" && id in DECOR_ITEMS;
}

/** What his decorations are worth (fame, `fameReputation`). */
export function decorValue(owned: readonly string[] | undefined): number {
  return (owned ?? []).reduce((sum, id) => sum + (isDecorItem(id) ? DECOR_ITEMS[id].price : 0), 0);
}

export type DecorRefusal = "owned" | "noMoney";

export function decorRefusal(owned: readonly string[] | undefined, id: DecorItemId, wallet: number): DecorRefusal | null {
  if (owned?.includes(id)) return "owned";
  return DECOR_ITEMS[id].price > wallet ? "noMoney" : null;
}

/** A mosaic design he may pick: free, or bought. */
export function mosaicAllowed(pattern: MosaicPattern, owned: readonly string[] | undefined): boolean {
  return FREE_MOSAICS.includes(pattern) || !!owned?.includes(pattern);
}

export function bannerAllowed(pattern: BannerPattern, owned: readonly string[] | undefined): boolean {
  return pattern === "plain" || !!owned?.includes(BANNER_ITEM[pattern]);
}

/** Owning any bought mosaic (or banner) opens that decoration even before the achievement points do. */
export function ownsKind(owned: readonly string[] | undefined, kind: DecorItemKind): boolean {
  return (owned ?? []).some((id) => isDecorItem(id) && DECOR_ITEMS[id].kind === kind);
}

/** "#" = second colour, "o" = a lighter main colour, "." = main colour. */
export const MOSAIC_ART: Partial<Record<MosaicPattern, readonly string[]>> = {
  heart: ["..##...##..", ".####.####.", "###########", "###########", ".#########.", "..#######..", "...#####...", "....###....", ".....#....."],
  ball: ["...#####...", "..#######..", ".###...###.", "####...####", "##.##.##.##", "#....#....#", "##.##.##.##", "####...####", ".###...###.", "..#######..", "...#####..."],
  bolt: [".....####", "....####.", "...####..", "..####...", ".#######.", "#######..", "...###...", "..###....", ".###.....", ".##......", "##.......", "#........"],
  crown: ["#.....#.....#", "##...###...##", "###.#####.###", "#############", "#############", "#o#o#o#o#o#o#", "#############", ".###########."],
  trophy: ["###########", "#.#######.#", "#.#######.#", ".#.#####.#.", "..#.###.#..", "...#####...", "....###....", ".....#.....", ".....#.....", "....###....", "...#####...", "..#######.."],
  lion: ["..##.###.##..", ".###########.", "####ooooo####", "###ooooooo###", "##oo#ooo#oo##", "##ooooooooo##", "##ooo###ooo##", "###oo#o#oo###", ".###ooooo###.", "..####o####..", "...#######...", ".....###....."],
  eagle: ["#.............#", "##...........##", "###...###...###", ".###.#####.###.", "..###########..", "...#########...", "....#######....", ".....#####.....", "....##.#.##....", "...##..#..##...", ".......#.......", "......###......"],
  flame: ["....#....", "....##...", "...###...", "..####.#.", "..#####.#", ".######.#", ".###o####", "###ooo###", "##ooooo##", "##ooooo##", ".##ooo##.", "..#####.."],
  castle: ["#.#.......#.#", "###.#.#.#.###", "#############", "#############", "##o#######o##", "#############", "#####...#####", "####.....####", "####.....####", "####.....####"],
};

/** Pattern cells computed from the position (no bitmap). */
export function patternCell(pattern: MosaicPattern, x: number, y: number, rows: number): "main" | "second" | null {
  const band = Math.max(1, Math.round(rows / 8));
  if (pattern === "diagonal") return Math.floor((x + y) / Math.max(2, band)) % 2 ? "second" : "main";
  if (pattern === "waves") return (y + Math.round(1.5 * Math.sin(x / 2))) % 4 < 2 ? "second" : "main";
  if (pattern === "diamonds") return Math.abs((x % 4) - 2) + Math.abs((y % 4) - 2) <= 1 ? "second" : "main";
  return null;
}

/** The "titles" mosaic: the crest shield with one star per league title above it (up to 12). */
export function titlesArt(shield: readonly string[], stars: number): string[] {
  const width = shield[0]!.length;
  const n = Math.max(0, Math.min(12, stars));
  const row = Array<string>(width).fill(".");
  const start = Math.floor((width - n) / 2);
  for (let i = 0; i < n; i++) row[start + i] = i % 2 === 0 ? "#" : "o";
  return n > 0 ? [row.join(""), ".".repeat(width), ...shield] : [...shield];
}
