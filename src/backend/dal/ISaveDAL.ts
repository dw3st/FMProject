import type { SaveMeta } from "@/backend/SaveService";
import type { Squad, StandingRow } from "@/types/playerTypes";
import type { SeasonArchive, SeasonData, LeagueCalendarResult, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { StoredDayLog } from "@/types/dayLogTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import type { InboxMessage } from "@/types/inboxTypes";

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
  readSeason(saveId: string): Promise<SeasonData | null>;
  writeSeason(saveId: string, season: SeasonData): Promise<void>;
  readSeasonArchive(saveId: string, year: number): Promise<SeasonArchive | null>;
  writeSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void>;

  // ── Transfers ─────────────────────────────────────────────────────────────
  readTransfers(saveId: string): Promise<TransferRecord[]>;
  writeTransfers(saveId: string, transfers: TransferRecord[]): Promise<void>;
  readTransfersArchive(saveId: string, year: number): Promise<TransferRecord[] | null>;
  writeTransfersArchive(saveId: string, year: number, transfers: TransferRecord[]): Promise<void>;

  // ── Squads ────────────────────────────────────────────────────────────────
  readSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<Squad | null>;
  writeSquad(saveId: string, leagueSlug: string, clubSlug: string, squad: Squad): Promise<void>;
  squadExists(saveId: string, leagueSlug: string, clubSlug: string): Promise<boolean>;
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
}
