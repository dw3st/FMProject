import type { ISaveDAL } from "@/backend/dal/ISaveDAL";
import type { SaveMeta } from "@/backend/SaveService";
import type { Squad, StandingRow } from "@/types/playerTypes";
import type {
  SeasonArchive,
  SeasonData,
  LeagueDateIndex,
  LeagueSeasonMeta,
  RoundFixtures,
} from "@/types/calendarTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { StoredDayLog } from "@/types/dayLogTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import type { InboxMessage } from "@/types/inboxTypes";

/**
 * An ISaveDAL wrapper that keeps all save state in memory and writes to the
 * underlying DAL only when `flush()` is called.
 *
 * Purpose: bulk simulation (the new-game pre-season catch-up) advances the world
 * one day at a time, which would otherwise read and re-write thousands of squad
 * files. Routing those operations through this buffer collapses every write to a
 * single per-resource flush at the end — the world is still simulated day by day,
 * but the disk is touched once.
 *
 * Semantics:
 *  - Reads are read-through cached (including nulls) so repeated reads of the same
 *    resource hit memory after the first load.
 *  - Writes update the cache and register a flush thunk keyed by resource. Writing
 *    the same resource again replaces the thunk, so only the final value is
 *    persisted.
 *  - `flush()` runs every pending thunk, then clears them.
 *
 * Squad list reads overlay buffered squad edits (indexed by squad id) on top of
 * the on-disk snapshot, so `listAllSquads` / `listSquadsInLeague` reflect in-flight
 * changes without re-reading from disk.
 *
 * Not safe to share across saves or concurrent runs — construct one per bulk run.
 */
export class BufferingSaveDAL implements ISaveDAL {
  private readonly cache = new Map<string, unknown>();
  private readonly pending = new Map<string, () => Promise<void>>();
  private readonly squadById = new Map<string, Squad>();

  constructor(private readonly inner: ISaveDAL) {}

  /** Persist every buffered write to the underlying DAL, then clear the write set. */
  async flush(): Promise<void> {
    for (const write of this.pending.values()) await write();
    this.pending.clear();
  }

  private async readThrough<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const value = await loader();
    this.cache.set(key, value);
    return value;
  }

  private buffer(key: string, value: unknown, write: () => Promise<void>): void {
    this.cache.set(key, value);
    this.pending.set(key, write);
  }

  // ── Save meta ───────────────────────────────────────────────────────────────
  listSaves(): Promise<SaveMeta[]> {
    return this.inner.listSaves();
  }
  readMeta(saveId: string): Promise<SaveMeta | null> {
    return this.readThrough(`meta:${saveId}`, () => this.inner.readMeta(saveId));
  }
  async writeMeta(meta: SaveMeta): Promise<void> {
    this.buffer(`meta:${meta.id}`, meta, () => this.inner.writeMeta(meta));
  }
  deleteSave(saveId: string): Promise<void> {
    return this.inner.deleteSave(saveId);
  }

  // ── Season ──────────────────────────────────────────────────────────────────
  readSeason(saveId: string): Promise<SeasonData | null> {
    return this.readThrough(`season:${saveId}`, () => this.inner.readSeason(saveId));
  }
  async writeSeason(saveId: string, season: SeasonData): Promise<void> {
    this.buffer(`season:${saveId}`, season, () => this.inner.writeSeason(saveId, season));
  }
  readSeasonArchive(saveId: string, year: number): Promise<SeasonArchive | null> {
    return this.readThrough(`seasonArchive:${saveId}:${year}`, () => this.inner.readSeasonArchive(saveId, year));
  }
  async writeSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void> {
    this.buffer(`seasonArchive:${saveId}:${archive.year}`, archive, () => this.inner.writeSeasonArchive(saveId, archive));
  }

  // ── Transfers ─────────────────────────────────────────────────────────────────
  readTransfers(saveId: string): Promise<TransferRecord[]> {
    return this.readThrough(`transfers:${saveId}`, () => this.inner.readTransfers(saveId));
  }
  async writeTransfers(saveId: string, transfers: TransferRecord[]): Promise<void> {
    this.buffer(`transfers:${saveId}`, transfers, () => this.inner.writeTransfers(saveId, transfers));
  }
  readTransfersArchive(saveId: string, year: number): Promise<TransferRecord[] | null> {
    return this.readThrough(`transfersArchive:${saveId}:${year}`, () => this.inner.readTransfersArchive(saveId, year));
  }
  async writeTransfersArchive(saveId: string, year: number, transfers: TransferRecord[]): Promise<void> {
    this.buffer(`transfersArchive:${saveId}:${year}`, transfers, () => this.inner.writeTransfersArchive(saveId, year, transfers));
  }

  // ── Squads ──────────────────────────────────────────────────────────────────
  readSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<Squad | null> {
    return this.readThrough(`squad:${saveId}:${leagueSlug}:${clubSlug}`, () => this.inner.readSquad(saveId, leagueSlug, clubSlug));
  }
  async writeSquad(saveId: string, leagueSlug: string, clubSlug: string, squad: Squad): Promise<void> {
    this.buffer(`squad:${saveId}:${leagueSlug}:${clubSlug}`, squad, () => this.inner.writeSquad(saveId, leagueSlug, clubSlug, squad));
    this.squadById.set(squad.id, squad);
  }
  async squadExists(saveId: string, leagueSlug: string, clubSlug: string): Promise<boolean> {
    const key = `squad:${saveId}:${leagueSlug}:${clubSlug}`;
    if (this.cache.has(key)) return this.cache.get(key) != null;
    return this.inner.squadExists(saveId, leagueSlug, clubSlug);
  }
  listLeagues(saveId: string): Promise<string[]> {
    return this.inner.listLeagues(saveId);
  }
  async listSquadsInLeague(saveId: string, leagueSlug: string): Promise<Squad[]> {
    const base = await this.readThrough(`listSquadsInLeague:${saveId}:${leagueSlug}`, () => this.inner.listSquadsInLeague(saveId, leagueSlug));
    return base.map((s) => this.squadById.get(s.id) ?? s);
  }
  async listAllSquads(saveId: string): Promise<Squad[]> {
    const base = await this.readThrough(`listAllSquads:${saveId}`, () => this.inner.listAllSquads(saveId));
    return base.map((s) => this.squadById.get(s.id) ?? s);
  }

  // ── Tactics ─────────────────────────────────────────────────────────────────
  readTactics(saveId: string): Promise<TacticsSave | null> {
    return this.readThrough(`tactics:${saveId}`, () => this.inner.readTactics(saveId));
  }
  async writeTactics(saveId: string, tactics: TacticsSave): Promise<void> {
    this.buffer(`tactics:${saveId}`, tactics, () => this.inner.writeTactics(saveId, tactics));
  }

  // ── Transfer market ───────────────────────────────────────────────────────────
  readMarket(saveId: string): Promise<MarketState | null> {
    return this.readThrough(`market:${saveId}`, () => this.inner.readMarket(saveId));
  }
  async writeMarket(saveId: string, market: MarketState): Promise<void> {
    this.buffer(`market:${saveId}`, market, () => this.inner.writeMarket(saveId, market));
  }

  // ── Inbox ─────────────────────────────────────────────────────────────────────
  readInbox(saveId: string): Promise<InboxMessage[]> {
    return this.readThrough(`inbox:${saveId}`, () => this.inner.readInbox(saveId));
  }
  async writeInbox(saveId: string, messages: InboxMessage[]): Promise<void> {
    this.buffer(`inbox:${saveId}`, messages, () => this.inner.writeInbox(saveId, messages));
  }
  async appendInboxMessage(saveId: string, message: InboxMessage): Promise<void> {
    const existing = await this.readInbox(saveId);
    await this.writeInbox(saveId, [...existing, message]);
  }

  // ── Day logs ──────────────────────────────────────────────────────────────────
  readDayLog(saveId: string, date: string): Promise<StoredDayLog | null> {
    return this.readThrough(`dayLog:${saveId}:${date}`, () => this.inner.readDayLog(saveId, date));
  }
  async writeDayLog(saveId: string, date: string, log: StoredDayLog): Promise<void> {
    this.buffer(`dayLog:${saveId}:${date}`, log, () => this.inner.writeDayLog(saveId, date, log));
  }

  // ── Per-league season data ──────────────────────────────────────────────────
  readLeagueMeta(saveId: string, leagueSlug: string): Promise<LeagueSeasonMeta | null> {
    return this.readThrough(`leagueMeta:${saveId}:${leagueSlug}`, () => this.inner.readLeagueMeta(saveId, leagueSlug));
  }
  async writeLeagueMeta(saveId: string, meta: LeagueSeasonMeta): Promise<void> {
    this.buffer(`leagueMeta:${saveId}:${meta.leagueSlug}`, meta, () => this.inner.writeLeagueMeta(saveId, meta));
  }
  readLeagueStandings(saveId: string, leagueSlug: string): Promise<StandingRow[] | null> {
    return this.readThrough(`standings:${saveId}:${leagueSlug}`, () => this.inner.readLeagueStandings(saveId, leagueSlug));
  }
  async writeLeagueStandings(saveId: string, leagueSlug: string, rows: StandingRow[]): Promise<void> {
    this.buffer(`standings:${saveId}:${leagueSlug}`, rows, () => this.inner.writeLeagueStandings(saveId, leagueSlug, rows));
  }
  readRound(saveId: string, leagueSlug: string, round: number): Promise<RoundFixtures | null> {
    return this.readThrough(`round:${saveId}:${leagueSlug}:${round}`, () => this.inner.readRound(saveId, leagueSlug, round));
  }
  async writeRound(saveId: string, leagueSlug: string, round: number, data: RoundFixtures): Promise<void> {
    this.buffer(`round:${saveId}:${leagueSlug}:${round}`, data, () => this.inner.writeRound(saveId, leagueSlug, round, data));
  }
  readDateIndex(saveId: string, leagueSlug: string): Promise<LeagueDateIndex | null> {
    return this.readThrough(`dateIndex:${saveId}:${leagueSlug}`, () => this.inner.readDateIndex(saveId, leagueSlug));
  }
  async writeDateIndex(saveId: string, leagueSlug: string, index: LeagueDateIndex): Promise<void> {
    this.buffer(`dateIndex:${saveId}:${leagueSlug}`, index, () => this.inner.writeDateIndex(saveId, leagueSlug, index));
  }
  listActiveLeaguesSlugs(saveId: string): Promise<string[]> {
    return this.inner.listActiveLeaguesSlugs(saveId);
  }
  readLeagueSeasonArchive(saveId: string, leagueSlug: string, year: number): Promise<SeasonArchive | null> {
    return this.readThrough(`leagueSeasonArchive:${saveId}:${leagueSlug}:${year}`, () => this.inner.readLeagueSeasonArchive(saveId, leagueSlug, year));
  }
  async writeLeagueSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void> {
    this.buffer(`leagueSeasonArchive:${saveId}:${archive.leagueSlug}:${archive.year}`, archive, () => this.inner.writeLeagueSeasonArchive(saveId, archive));
  }
  readLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number): Promise<TransferRecord[] | null> {
    return this.readThrough(`leagueTransfersArchive:${saveId}:${leagueSlug}:${year}`, () => this.inner.readLeagueTransfersArchive(saveId, leagueSlug, year));
  }
  async writeLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number, transfers: TransferRecord[]): Promise<void> {
    this.buffer(`leagueTransfersArchive:${saveId}:${leagueSlug}:${year}`, transfers, () => this.inner.writeLeagueTransfersArchive(saveId, leagueSlug, year, transfers));
  }
}
