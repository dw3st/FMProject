import type { SaveMeta } from "@/backend/SaveService";
import type { StaffPool } from "@/Domain/staff/staffPool";
import type { FreeAgent, RetiredPlayer, Squad, StandingRow } from "@/types/playerTypes";
import type { ScoutingState } from "@/types/scoutingTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { ClubHistory } from "@/types/clubHistoryTypes";
import type { SeasonArchive, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { StoredDayLog } from "@/types/dayLogTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { AwardsYear, SeasonGoals } from "@/types/awardTypes";

export interface SquadFile {
  leagueSlug: string;
  clubSlug: string;
  squad: Squad;
}

export interface ISaveDAL {
  // ── Save meta ─────────────────────────────────────────────────────────────
  listSaves(): Promise<SaveMeta[]>;
  readMeta(saveId: string): Promise<SaveMeta | null>;
  writeMeta(meta: SaveMeta): Promise<void>;
  deleteSave(saveId: string): Promise<void>;

  // ── Season ────────────────────────────────────────────────────────────────
  readSeasonArchive(saveId: string, year: number): Promise<SeasonArchive | null>;
  writeSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void>;

  // ── Transfers ─────────────────────────────────────────────────────────────
  readTransfers(saveId: string): Promise<TransferRecord[]>;
  writeTransfers(saveId: string, transfers: TransferRecord[]): Promise<void>;
  readTransfersArchive(saveId: string, year: number): Promise<TransferRecord[] | null>;
  writeTransfersArchive(saveId: string, year: number, transfers: TransferRecord[]): Promise<void>;

  // ── Free agents ───────────────────────────────────────────────────────────
  readFreeAgents(saveId: string): Promise<FreeAgent[]>;
  writeFreeAgents(saveId: string, agents: FreeAgent[]): Promise<void>;

  // ── Coaching-staff free pool (`.claude/rules/game/staff.md`) ───────────────
  /** `null` when the save has no pool yet. */
  readStaffPool(saveId: string): Promise<StaffPool | null>;
  writeStaffPool(saveId: string, pool: StaffPool): Promise<void>;

  // ── Scouting (human manager, `.claude/rules/game/scouting.md`) ─────────────
  /** `null` when nothing was ever observed. */
  readScouting(saveId: string): Promise<ScoutingState | null>;
  writeScouting(saveId: string, state: ScoutingState): Promise<void>;

  // ── Manager ranking ───────────────────────────────────────────────────────
  readManagers(saveId: string): Promise<ManagerRecord[]>;
  writeManagers(saveId: string, managers: ManagerRecord[]): Promise<void>;

  // ── Retired players ───────────────────────────────────────────────────────
  readRetired(saveId: string): Promise<RetiredPlayer[]>;
  writeRetired(saveId: string, retired: RetiredPlayer[]): Promise<void>;

  // ── Club history (one file per club) ──────────────────────────────────────
  /** `null` when the club has no history yet. */
  readClubHistory(saveId: string, squadId: string): Promise<ClubHistory | null>;
  writeClubHistory(saveId: string, history: ClubHistory): Promise<void>;

  // ── Squads ────────────────────────────────────────────────────────────────
  readSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<Squad | null>;
  writeSquad(saveId: string, leagueSlug: string, clubSlug: string, squad: Squad): Promise<void>;
  squadExists(saveId: string, leagueSlug: string, clubSlug: string): Promise<boolean>;
  /** Remove a squad file. Idempotent: deleting a missing squad is a no-op. */
  deleteSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<void>;
  listLeagues(saveId: string): Promise<string[]>;
  listSquadsInLeague(saveId: string, leagueSlug: string): Promise<Squad[]>;
  listAllSquads(saveId: string): Promise<Squad[]>;
  /** Every squad with the league + club file stem it is stored under (what readSquad/writeSquad address). */
  listSquadFiles(saveId: string): Promise<SquadFile[]>;

  // ── Tactics ───────────────────────────────────────────────────────────────
  readTactics(saveId: string): Promise<TacticsSave | null>;
  writeTactics(saveId: string, tactics: TacticsSave): Promise<void>;

  // ── Transfer market (AI needs + rotation) ─────────────────────────────────
  readMarket(saveId: string): Promise<MarketState | null>;
  writeMarket(saveId: string, market: MarketState): Promise<void>;

  // ── Inbox ─────────────────────────────────────────────────────────────────
  readInbox(saveId: string): Promise<InboxMessage[]>;
  writeInbox(saveId: string, messages: InboxMessage[]): Promise<void>;
  appendInboxMessage(saveId: string, message: InboxMessage): Promise<void>;

  // ── Day logs ──────────────────────────────────────────────────────────────
  readDayLog(saveId: string, date: string): Promise<StoredDayLog | null>;
  writeDayLog(saveId: string, date: string, log: StoredDayLog): Promise<void>;

  // ── Per-league season data ─────────────────────────────────────────────────
  readLeagueMeta(saveId: string, leagueSlug: string): Promise<LeagueSeasonMeta | null>;
  writeLeagueMeta(saveId: string, meta: LeagueSeasonMeta): Promise<void>;

  readLeagueStandings(saveId: string, leagueSlug: string): Promise<StandingRow[] | null>;
  writeLeagueStandings(saveId: string, leagueSlug: string, rows: StandingRow[]): Promise<void>;

  readRound(saveId: string, leagueSlug: string, round: number): Promise<RoundFixtures | null>;
  writeRound(saveId: string, leagueSlug: string, round: number, data: RoundFixtures): Promise<void>;

  readDateIndex(saveId: string, leagueSlug: string): Promise<LeagueDateIndex | null>;
  writeDateIndex(saveId: string, leagueSlug: string, index: LeagueDateIndex): Promise<void>;

  listActiveLeaguesSlugs(saveId: string): Promise<string[]>;

  readLeagueSeasonArchive(saveId: string, leagueSlug: string, year: number): Promise<SeasonArchive | null>;
  writeLeagueSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void>;
  readLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number): Promise<TransferRecord[] | null>;
  writeLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number, transfers: TransferRecord[]): Promise<void>;

  // ── Ledger (player club cash extract) ────────────────────────────────────────
  /** Every season year that has a ledger file for this save, ascending. */
  listLedgerSeasons(saveId: string): Promise<number[]>;
  readLedger(saveId: string, season: number): Promise<LedgerEntry[]>;
  /** Append entries to the season's ledger, preserving whatever is already there. */
  appendLedger(saveId: string, season: number, entries: LedgerEntry[]): Promise<void>;
  /**
   * Replace the season's ledger entirely (idempotent full write). Used by `BufferingSaveDAL`'s
   * flush, whose pending thunk always writes the complete list (on-disk baseline + everything
   * buffered) so a write re-run after a partial flush never duplicates entries.
   */
  writeLedger(saveId: string, season: number, entries: LedgerEntry[]): Promise<void>;

  // ── Season awards (`.claude/rules/game/awards.md`) ───────────────────────────
  /** `awards/{year}.json`: league seasons closed in `year` (+ the world awards for it). */
  readAwardsYear(saveId: string, year: number): Promise<AwardsYear | null>;
  writeAwardsYear(saveId: string, data: AwardsYear): Promise<void>;
  /** Years with an awards file, ascending. */
  listAwardYears(saveId: string): Promise<number[]>;
  /** `seasonGoals/{league}-{year}.json`: goal-of-the-season candidates. */
  readSeasonGoals(saveId: string, league: string, year: number): Promise<SeasonGoals | null>;
  writeSeasonGoals(saveId: string, data: SeasonGoals): Promise<void>;
  deleteSeasonGoals(saveId: string, league: string, year: number): Promise<void>;
  listSeasonGoalFiles(saveId: string): Promise<{ league: string; year: number }[]>;
}
