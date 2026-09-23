export interface TransferRecord {
  id: string;
  date: string;             // "YYYY-MM-DD"
  playerId: string;
  playerName: string;
  playerPosition: string;  // positions[0]
  playerAge: number;
  fromSquadId: string;
  fromSquadName: string;
  toSquadId: string;
  toSquadName: string;
  fee: number;              // raw £ (e.g. 12_500_000 = £12.5M)
  direction: "in" | "out"; // from the user-managed club's perspective
  status: "accepted" | "rejected";
  reason: string;
  /** Set by GET /transfers — use with `/api/logos/:league/:club` */
  fromLeagueSlug?: string;
  fromClubSlug?: string;
  toLeagueSlug?: string;
  toClubSlug?: string;
}

/** GET /api/saves/:saveId/transfers — your club vs rest of the world (AI↔AI). */
export interface TransfersSplitResponse {
  club: TransferRecord[];
  world: TransferRecord[];
  /** Squad id matching `fromSquadId` / `toSquadId` for cash-flow totals and columns. */
  playerSquadId: string | null;
}
