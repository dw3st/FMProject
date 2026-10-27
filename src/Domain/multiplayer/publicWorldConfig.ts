/** Multiplayer part 5b: the server's public world (`.claude/rules/game/multiplayer.md`). */
export const PUBLIC_WORLD = {
  /** Local times (America/Sao_Paulo) at which the world takes one step. */
  SLOTS: ["09:00", "13:00", "18:00", "22:00"] as const,
  /** Brasília has no daylight saving since 2019: a fixed UTC offset, in minutes. */
  UTC_OFFSET_MIN: -180,
  MAX_MEMBERS: 40,
  /** The 10 main leagues (same list as `scripts/faces/wikidata.ts` → `LEAGUES`). */
  LEAGUES: [
    "premier_league", "la_liga", "bundesliga", "serie_a", "ligue_1", "brazil_serie_a",
    "of_portuguese_primeira_liga", "of_eredivisie", "of_argentine_premier_division", "of_major_league_soccer",
  ] as const,
  /** The league whose start date the world starts on (the earliest European kickoff). */
  START_LEAGUE: "premier_league",
  WARN_DAYS: 5,
  INACTIVE_DAYS: 7,
  /** Seats' "last seen" is written at most once per this many real minutes. */
  SEEN_WRITE_MIN: 60,
  HALL_TOP: 10,
} as const;
