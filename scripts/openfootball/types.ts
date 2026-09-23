export interface SeedLeague {
  slug: string; name: string; country: string; countryName: string; tier: number; reputation: number;
}
export interface SeedClub {
  id: string; name: string; league: string; country: string; tier: number;
  attack: number; midfield: number; defense: number;
  colorBg?: string; colorFg?: string; reputation: number;
}
export interface SeedPlayer {
  id: string; name: string; position: "GK" | "DEF" | "MID" | "ATT";
  overall: number; potential: number; age: number; country: string;
  foot: "R" | "L" | "B"; value: number; clubId: string;
}
export interface Seed { version: number; leagues: SeedLeague[]; clubs: SeedClub[]; players: SeedPlayer[] }
