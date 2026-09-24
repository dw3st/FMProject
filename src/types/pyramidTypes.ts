export interface PyramidGroup {
  leagueSlug: string;
  /** Clubs that go up from this group to the level above (0 on the top level). */
  promote: number;
  /** Clubs that go down from this group to the level below (0 on the bottom level). */
  relegate: number;
}
export interface PyramidLevel { tier: number; groups: PyramidGroup[] }
export interface CountryPyramid { country: string; levels: PyramidLevel[] }
/** Keyed by leagueData `country` name (same key as countries.json). */
export type Pyramids = Record<string, CountryPyramid>;
