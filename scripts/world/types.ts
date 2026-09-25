import type { Zone } from "@/../scripts/openfootball/leagues";
import type { ClubFinances, RosterPlayer } from "@/types/playerTypes";

/** One row of a league's `standings` in leagueData.json. */
export interface StandingRow {
  squadId: string;
  slug: string;
  name: string;
  colors: [string, string];
  country?: string;
  logo?: string;
}

/** One entry of leagueData.json. Unknown fields are kept as they are. */
export interface LeagueEntry extends Record<string, unknown> {
  slug: string;
  name: string;
  country: string;
  iso2?: string;
  season: string;
  zones?: Zone[];
  standings: StandingRow[];
  source?: string;
}

/** A squad file (squads/{league}/{id}.json). Unknown fields are kept as they are. */
export interface SquadFile extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  colors: [string, string];
  country?: string;
  source?: string;
  venue?: { name: string; city: string | null; capacity: number; surface: string };
  coach?: { id: number; name: string } & Record<string, unknown>;
  finances?: ClubFinances & { score?: number };
  players: Array<RosterPlayer & { fullName?: string }>;
}
