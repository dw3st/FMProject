export type EspnPos = "G" | "D" | "M" | "F";

export interface EspnAthlete {
  id: string;
  displayName: string;
  fullName: string;
  age: number | null;
  position: EspnPos | null;
  /** Country name as ESPN writes it ("England", "Brazil"). */
  citizenship: string | null;
}

export interface EspnTeam {
  id: string;
  name: string;
  shortName: string;
  /** City / location label ("Birmingham City", "Manchester"). */
  location: string;
  /** Hex without '#', or null. */
  color: string | null;
  altColor: string | null;
  /** File name under data_process/espn/logos/, or null when the download failed. */
  logoFile: string | null;
  coach: string | null;
  athletes: EspnAthlete[];
}

export interface EspnLeague {
  /** Our leagueData slug. */
  slug: string;
  /** ESPN league code ("eng.1"). */
  code: string;
  name: string;
  /** ESPN season label ("2026-27 English Premier League"). */
  season: string;
  teams: EspnTeam[];
}

export interface EspnSnapshot { fetchedAt: string; leagues: EspnLeague[] }

export interface LeagueMapEntry { slug: string; code: string }
