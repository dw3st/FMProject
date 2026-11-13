/** Sectors of the invented sponsor catalog (`src/example_data/sponsors.json`). */
export const SPONSOR_SECTORS = [
  "bank",
  "insurance",
  "beer",
  "soft_drink",
  "betting",
  "airline",
  "car_maker",
  "car_dealer",
  "telecom",
  "supermarket",
  "pharmacy",
  "construction",
  "energy",
  "tech",
  "fashion",
  "sportswear",
  "food",
  "fast_food",
  "bakery",
  "tyre_shop",
  "logistics",
  "real_estate",
  "education",
  "health",
  "media",
  "travel",
  "crypto",
  "home_appliances",
] as const;

export type SponsorSector = (typeof SPONSOR_SECTORS)[number];

export const SPONSOR_SIZES = ["local", "national", "global"] as const;
export type SponsorSize = (typeof SPONSOR_SIZES)[number];

export interface SponsorEntry {
  id: string;
  name: string;
  sector: SponsorSector;
  size: SponsorSize;
  country?: string;
  funny?: true;
  colors: [string, string];
}

/** Sector names for the product owner's review file (Portuguese). */
export const SECTOR_LABEL_PT: Record<SponsorSector, string> = {
  bank: "banco",
  insurance: "seguros",
  beer: "cerveja",
  soft_drink: "refrigerante e sucos",
  betting: "apostas",
  airline: "companhia aérea",
  car_maker: "montadora",
  car_dealer: "revenda e oficina de carros",
  telecom: "telefonia",
  supermarket: "supermercado",
  pharmacy: "farmácia",
  construction: "construção",
  energy: "energia",
  tech: "tecnologia",
  fashion: "moda e beleza",
  sportswear: "material esportivo",
  food: "alimentos e restaurantes",
  fast_food: "lanches",
  bakery: "padaria e doces",
  tyre_shop: "borracharia e pneus",
  logistics: "transporte e logística",
  real_estate: "imobiliária",
  education: "educação",
  health: "saúde",
  media: "mídia",
  travel: "viagens",
  crypto: "cripto",
  home_appliances: "eletrodomésticos",
};

export const SIZE_LABEL_PT: Record<SponsorSize, string> = {
  local: "local",
  national: "nacional",
  global: "global",
};
