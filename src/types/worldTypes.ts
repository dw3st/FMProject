export type Continent = "Europe" | "South America" | "North America" | "Asia" | "Africa" | "Oceania" | "Other";

export interface CountryEntry {
  slug: string;
  name: string;
  flag: string;
  iso2: string;
  playable: boolean;
  headline: string;
  continent?: Continent;
  source?: string;
}
