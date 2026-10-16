// src/Domain/multiplayer/standingsConfig.ts
export const STANDINGS = {
  OBJECTIVE_MET: 10,
  PER_POSITION: 1,
  MAX_POSITIONS: 10,
  LEAGUE_TITLE: 15,
  PROMOTED: 8,
  RELEGATED: -8,
  CUP: { champion: 8, finalist: 3 },
  CONTINENTAL: { champion: 15, finalist: 6, semifinal: 3, groups: 1 },
  BEST_MANAGER: 4,
  WORLD_MANAGER: 8,
  NATIONAL_TITLE: 6,
  NATIONAL_OBJECTIVE: 2,
  SACKED: -5,
} as const;
