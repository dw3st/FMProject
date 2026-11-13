import type { IconName } from "@/GameInterface/Icons";

export type SponsorPlateSize = "sm" | "md" | "lg";

/** Sector of the catalog → the icon drawn when the company has no painted plate. */
export const SECTOR_ICON: Record<string, IconName> = {
  bank: "stadium",
  insurance: "shield-check",
  beer: "beer",
  soft_drink: "soda",
  betting: "dices",
  airline: "plane",
  car_maker: "car",
  telecom: "radio-tower",
  energy: "zap",
  tech: "cpu",
  fashion: "suit",
  sportswear: "footprints",
  food: "restaurant",
  fast_food: "sandwich",
  logistics: "truck",
  travel: "luggage",
  crypto: "coins",
  home_appliances: "washing-machine",
  media: "broadcast",
  health: "heart-pulse",
  tyre_shop: "life-buoy",
  bakery: "croissant",
  pharmacy: "pill",
  construction: "hard-hat",
  supermarket: "cart",
  real_estate: "building",
  car_dealer: "key",
  education: "graduation-cap",
};

export function sectorIcon(sector: string): IconName {
  return SECTOR_ICON[sector] ?? "handshake";
}

/** Box of each size: the plate's height, its width, the symbol square (= the height) and the fallback icon. */
export const PLATE_BOX: Record<SponsorPlateSize, { box: string; symbol: string; icon: number }> = {
  sm: { box: "h-10 w-44", symbol: "w-10", icon: 20 },
  md: { box: "h-16 w-60", symbol: "w-16", icon: 30 },
  lg: { box: "h-24 w-80", symbol: "w-24", icon: 44 },
};

/**
 * Type classes of the name by its length: fixed size steps (never an inline font size), the longest names on two lines
 * of the smallest step. The name area is the plate minus the symbol square.
 */
export function plateNameClass(size: SponsorPlateSize, name: string): string {
  const n = name.trim().length;
  return `font-display font-bold uppercase leading-none ${
    size === "sm" ? (n <= 16 ? "text-sm" : "text-[13px]")
    : size === "md" ? (n <= 10 ? "text-2xl" : n <= 13 ? "text-xl" : n <= 17 ? "text-base" : "text-sm")
    : n <= 9 ? "text-4xl" : n <= 12 ? "text-3xl" : n <= 15 ? "text-2xl" : n <= 19 ? "text-xl" : "text-base"
  }`;
}
