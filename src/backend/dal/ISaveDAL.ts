import type { NewsItem } from "@/types/newsTypes";
import type { SaveMeta } from "@/backend/SaveService";
import type { StaffPool } from "@/Domain/staff/staffPool";
import type { FreeAgent, RetiredPlayer, Squad, StandingRow } from "@/types/playerTypes";
import type { ScoutingState } from "@/types/scoutingTypes";
import type { AchievementsState } from "@/types/achievementTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { ClubHistory } from "@/types/clubHistoryTypes";
import type { SeasonArchive, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import type { StoredTransferRecord } from "@/types/transferTypes";
import type { StoredDayLog } from "@/types/dayLogTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { SeatMarketState, WorldMarketState } from "@/types/transferMarketTypes";
import type { SeatState } from "@/types/seatTypes";
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
  readTransfers(saveId: string): Promise<StoredTransferRecord[]>;
  writeTransfers(saveId: string, transfers: StoredTransferRecord[]): Promise<void>;
  readTransfersArchive(saveId: string, year: number): Promise<StoredTransferRecord[] | null>;
  writeTransfersArchive(saveId: string, year: number, transfers: StoredTransferRecord[]): Promise<void>;

  // ── Free agents ───────────────────────────────────────────────────────────
  readFreeAgents(saveId: string): Promise<FreeAgent[]>;
  writeFreeAgents(saveId: string, agents: FreeAgent[]): Promise<void>;

  // ── Coaching-staff free pool (`.claude/rules/game/staff.md`) ───────────────
  /** `null` when the save has no pool yet. */
  readStaffPool(saveId: string): Promise<StaffPool | null>;
  writeStaffPool(saveId: string, pool: StaffPool): Promise<void>;

  // ── Referees (`.claude/rules/game/referees.md`) ────────────────────────────
  /** `null` when the save has no referees (older saves: matches without a referee). */
  readRefereePool(saveId: string): Promise<import("@/types/refereeTypes").RefereePool | null>;
  writeRefereePool(saveId: string, pool: import("@/types/refereeTypes").RefereePool): Promise<void>;
  readRefereeState(saveId: string): Promise<import("@/types/refereeTypes").RefereeState | null>;
  writeRefereeState(saveId: string, state: import("@/types/refereeTypes").RefereeState): Promise<void>;
  /** Archived season of a country (`<country>-<season>`). */
  readRefereeSeason(saveId: string, key: string): Promise<import("@/types/refereeTypes").RefereeSeasonArchive | null>;
  writeRefereeSeason(saveId: string, key: string, archive: import("@/types/refereeTypes").RefereeSeasonArchive): Promise<void>;
  /** Keys of the archived seasons on disk (not buffered). */
  listRefereeSeasons(saveId: string): Promise<string[]>;

  // ── National teams (`.claude/rules/game/national-teams.md`) ────────────────
  /** `null` when the save has no national teams (older saves). */
  readNationalState(saveId: string): Promise<import("@/types/nationalTypes").NationalState | null>;
  writeNationalState(saveId: string, state: import("@/types/nationalTypes").NationalState): Promise<void>;
  readNationalComp(saveId: string, slug: string): Promise<import("@/types/nationalTypes").NationalCompetition | null>;
  writeNationalComp(saveId: string, comp: import("@/types/nationalTypes").NationalCompetition): Promise<void>;

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

  // ── Transfer market (AI needs + rotation) ─────────────────────────────────
  readMarket(saveId: string): Promise<WorldMarketState | null>;
  writeMarket(saveId: string, market: WorldMarketState): Promise<void>;

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
  readLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number): Promise<StoredTransferRecord[] | null>;
  writeLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number, transfers: StoredTransferRecord[]): Promise<void>;

  // ── Season awards (`.claude/rules/game/awards.md`) ───────────────────────────
  /** `awards/{year}.json`: league seasons closed in `year` (+ the world awards for it). */
  readAwardsYear(saveId: string, year: number): Promise<AwardsYear | null>;
  writeAwardsYear(saveId: string, data: AwardsYear): Promise<void>;
  /** Years with an awards file, ascending. */
  listAwardYears(saveId: string): Promise<number[]>;
  // ── News (Etapa 42) ─────────────────────────────────────────────────────────
  /** `news/{YYYY-MM}.json`: world news of the month. `null` when the month has no file. */
  readNewsMonth(saveId: string, month: string): Promise<NewsItem[] | null>;
  writeNewsMonth(saveId: string, month: string, items: NewsItem[]): Promise<void>;
  /** Months with a news file, ascending. */
  listNewsMonths(saveId: string): Promise<string[]>;
  deleteNewsMonth(saveId: string, month: string): Promise<void>;
  /** `seasonGoals/{league}-{year}.json`: goal-of-the-season candidates. */
  readSeasonGoals(saveId: string, league: string, year: number): Promise<SeasonGoals | null>;
  writeSeasonGoals(saveId: string, data: SeasonGoals): Promise<void>;
  deleteSeasonGoals(saveId: string, league: string, year: number): Promise<void>;
  listSeasonGoalFiles(saveId: string): Promise<{ league: string; year: number }[]>;

  // ── Seats (`.claude/rules/game/multiplayer.md`): `saves/{saveId}/seats/{seatId}/` ──────────────
  readSeat(saveId: string, seatId: string): Promise<SeatState | null>;
  writeSeat(saveId: string, seatId: string, seat: SeatState): Promise<void>;
  readSeatTactics(saveId: string, seatId: string): Promise<TacticsSave | null>;
  writeSeatTactics(saveId: string, seatId: string, tactics: TacticsSave): Promise<void>;
  readSeatAchievements(saveId: string, seatId: string): Promise<AchievementsState | null>;
  writeSeatAchievements(saveId: string, seatId: string, state: AchievementsState): Promise<void>;
  readSeatScouting(saveId: string, seatId: string): Promise<ScoutingState | null>;
  writeSeatScouting(saveId: string, seatId: string, state: ScoutingState): Promise<void>;
  readSeatInbox(saveId: string, seatId: string): Promise<InboxMessage[]>;
  writeSeatInbox(saveId: string, seatId: string, messages: InboxMessage[]): Promise<void>;
  appendSeatInboxMessage(saveId: string, seatId: string, message: InboxMessage): Promise<void>;
  listSeatLedgerSeasons(saveId: string, seatId: string): Promise<number[]>;
  readSeatLedger(saveId: string, seatId: string, season: number): Promise<LedgerEntry[]>;
  appendSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void>;
  writeSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void>;
  readSeatMarket(saveId: string, seatId: string): Promise<SeatMarketState | null>;
  writeSeatMarket(saveId: string, seatId: string, market: SeatMarketState): Promise<void>;
}
