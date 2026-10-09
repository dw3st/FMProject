/** Youth (under-21 / under-19) competitions — `.claude/rules/game/youth-competitions.md`. */

export type YouthCompAge = "u21" | "u19";

export interface YouthLeader {
  name: string;
  squadId: string;
  apps: number;
  goals: number;
  assists: number;
  /** Average = ratingSum / apps. */
  ratingSum: number;
  /** Player generated on the fly (AI club): does not exist in the world. */
  generated?: true;
}

export interface YouthCompMetaData {
  country: string;
  age: YouthCompAge;
  /** Clubs of the tier-1 league at generation (the table uses this list, not the squad index). */
  clubs: string[];
  /** Shortened season: first leg only. */
  singleLeg?: true;
  /** Name and colours of each club at generation (table rows). */
  teams: Record<string, { name: string; colors: [string, string] }>;
  /** Top scorers and ratings of the competition, per player (real and generated). */
  leaders: Record<string, YouthLeader>;
  championId: string | null;
}

export interface YouthMatchLog {
  competition: string;
  fixtureId: string;
  home: string;
  away: string;
  /** null = cancelled. */
  score: { home: number; away: number } | null;
  scorers: { playerId: string; name: string; squadId: string; goals: number; generated?: true }[];
  best: { playerId: string; name: string; squadId: string; rating: number; generated?: true } | null;
  /** Real players of each side (generated ones are left out). */
  players: { home: string[]; away: string[] };
  postponedFrom?: string;
}
