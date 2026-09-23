// Final-state snapshot of the Real Madrid vs Barcelona match used by the
// match + stats scenes. Values are realistic given the lineups in clubs.ts.

export const MATCH_SNAPSHOT = {
  homeName: "Real Madrid",
  awayName: "Barcelona",
  homeColor: "#FFFFFF",
  homeAccent: "#FEBE10",
  awayColor: "#A50044",
  awayAccent: "#004D98",
  homeLogo: "/logos/la_liga/real_madrid.svg",
  awayLogo: "/logos/la_liga/barcelona.svg",
  competition: "La Liga · Round 14",
  venue: "Camp Nou",

  // Score state at the moment we capture the goal.
  finalScoreA: 2,
  finalScoreB: 1,
  scoringTeam: "A" as const,
  scorer: "J. Bellingham",
  assist: "Kylian Mbappé",
  clockMinute: 68,
  clockSecond: 11,

  // Team stats (post-match).
  stats: {
    possession: [57, 43] as [number, number],
    shots: [14, 9] as [number, number],
    shotsOnTarget: [6, 3] as [number, number],
    xg: [1.7, 0.9] as [number, number],
    passes: [438, 312] as [number, number],
    passAccuracy: [89, 81] as [number, number],
    throughBalls: [4, 1] as [number, number],
    tackles: [12, 16] as [number, number],
    interceptions: [9, 11] as [number, number],
    fouls: [9, 13] as [number, number],
    corners: [6, 3] as [number, number],
  },

  // Top three player ratings (mirrors player-scores.md formula).
  topRatings: [
    { team: "A" as const, name: "J. Bellingham", rating: 8.7, position: "CM" },
    { team: "A" as const, name: "Kylian Mbappé", rating: 8.2, position: "ST" },
    { team: "A" as const, name: "Vinícius Júnior", rating: 7.9, position: "LW" },
    { team: "B" as const, name: "Lamine Yamal", rating: 7.6, position: "RW" },
    { team: "B" as const, name: "Pedri", rating: 7.4, position: "CM" },
  ],
};
