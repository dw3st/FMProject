import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import { runPool } from "@/backend/dal/pool";
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

/** Max buffered writes in flight during `flush()`. */
export const FLUSH_CONCURRENCY = 32;

function squadKey(leagueSlug: string, clubSlug: string): string {
  return `${leagueSlug}/${clubSlug}`;
}

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
 *  - `flush()` runs every pending thunk (bounded parallelism): writes, then squad
 *    deletes, then save meta — see `flush()`.
 *
 * Aliasing: reads within one unit of work return SHARED objects — the same
 * instance to every caller (a squad from `readSquad` is the one inside
 * `listAllSquads`, a buffered write is returned as-is to later reads — unless its
 * `leagueSlug` differed from the league it was written to, then a normalized copy). Callers
 * must treat what they read as immutable (build a new object and write it), or
 * write the object back after mutating it; an in-place mutation that is never
 * written is visible to the rest of the unit of work but never persisted.
 *
 * Squads are different: every squad file is loaded once, in bulk, on first squad
 * access, and every squad read (single, per league, all) is served from that one
 * store with buffered edits overlaid by file key (league + club stem). Each squad
 * file is therefore read from disk at most once per buffer.
 *
 * Not safe to share across saves or concurrent runs — construct one per bulk run.
 */
export class BufferingSaveDAL implements ISaveDAL {
  private readonly cache = new Map<string, unknown>();
  private readonly pending = new Map<string, () => Promise<void>>();
  private readonly squadStores = new Map<string, Promise<Map<string, SquadFile>>>();
  /** Buffered squad writes by file key; `null` is a tombstone (buffered delete). */
  private readonly squadEdits = new Map<string, Map<string, SquadFile | null>>();
  /** Pending thunks that are squad deletes — flushed after every write, before meta. */
  private readonly deleteThunks = new WeakSet<() => Promise<void>>();

  constructor(private readonly inner: ISaveDAL) {}

  /**
   * Persist every buffered write (the final value per resource) to the underlying
   * DAL, in three phases, each only if the previous one fully succeeded:
   *
   *  1. every write except meta (squads and all other resources), at most
   *     FLUSH_CONCURRENCY at a time;
   *  2. every buffered squad delete (tombstone);
   *  3. the save meta (`meta:*`).
   *
   * Writes before deletes: a `moveSquad` is a write in the new league plus a
   * delete in the old one, so a failure mid-flush can leave two copies of a club
   * (the squad index keeps the moved one — see `membershipRev`) but never zero.
   * Meta carries `currentDate`, so writing it last keeps the invariant that a save
   * is never recorded as advanced unless everything else of that unit of work was
   * persisted. Within a phase every operation is attempted; successful ones are
   * cleared, failed ones stay pending (a later flush retries them), and one
   * AggregateError is thrown after all have settled. A failed phase leaves every
   * later phase pending and untouched.
   */
  async flush(): Promise<void> {
    const entries = Array.from(this.pending.entries());
    const isMeta = ([key]: [string, unknown]) => key.startsWith("meta:");
    const isDelete = ([, run]: [string, () => Promise<void>]) => this.deleteThunks.has(run);
    await this.flushPhase(entries.filter((e) => !isMeta(e) && !isDelete(e)));
    await this.flushPhase(entries.filter(isDelete));
    await this.flushPhase(entries.filter(isMeta));
  }

  private async flushPhase(entries: Array<[string, () => Promise<void>]>): Promise<void> {
    const errors: unknown[] = [];
    await runPool(entries, FLUSH_CONCURRENCY, async ([key, write]) => {
      try {
        await write();
        // Only clear if not re-buffered while this write was in flight.
        if (this.pending.get(key) === write) this.pending.delete(key);
      } catch (e) {
        errors.push(e);
      }
    });
    if (errors.length > 0) {
      throw new AggregateError(errors, `BufferingSaveDAL.flush: ${errors.length} of ${entries.length} writes failed`);
    }
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
  //
  // All squad access goes through ONE per-save store keyed by file identity
  // (`league/clubStem`), bulk-loaded with a single inner `listSquadFiles` on first
  // use. Once loaded the store is authoritative for which squad files exist, so
  // `readSquad` / `squadExists` never touch the inner DAL — including the slug
  // probe misses of `SaveService.getSquad` (`{slug}.json` absent → null, from
  // memory) — and `listAllSquads` is served from the same objects.
  //
  // Buffered writes live in `squadEdits` (same key) and overlay the store for every
  // read path; a write never forces the store to load. A buffered delete is a
  // tombstone (`null`) in the same map: it hides the key from every read path and
  // flushes as `inner.deleteSquad` in the delete phase (after every write). A later write on the same
  // key replaces both the tombstone and its pending delete.

  private squadStore(saveId: string): Promise<Map<string, SquadFile>> {
    let store = this.squadStores.get(saveId);
    if (!store) {
      store = this.inner.listSquadFiles(saveId).then((files) => {
        const m = new Map<string, SquadFile>();
        for (const f of files) m.set(squadKey(f.leagueSlug, f.clubSlug), f);
        return m;
      });
      // Concurrent first reads (e.g. both sides of a fixture) share one load; a
      // failed load is not cached so a later call can retry.
      store.catch(() => this.squadStores.delete(saveId));
      this.squadStores.set(saveId, store);
    }
    return store;
  }

  private edits(saveId: string): Map<string, SquadFile | null> {
    let m = this.squadEdits.get(saveId);
    if (!m) this.squadEdits.set(saveId, (m = new Map()));
    return m;
  }

  /** Store entries with buffered edits overlaid in place; newly written files appended. */
  private async squadFilesView(saveId: string): Promise<SquadFile[]> {
    const store = await this.squadStore(saveId);
    const edits = this.edits(saveId);
    const out: SquadFile[] = [];
    for (const [key, f] of store) {
      if (!edits.has(key)) out.push(f);
      else {
        const edited = edits.get(key);
        if (edited) out.push(edited); // null = tombstone → omitted
      }
    }
    for (const [key, f] of edits) if (f && !store.has(key)) out.push(f);
    return out;
  }

  async readSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<Squad | null> {
    const key = squadKey(leagueSlug, clubSlug);
    const edits = this.edits(saveId);
    if (edits.has(key)) return edits.get(key)?.squad ?? null;
    return (await this.squadStore(saveId)).get(key)?.squad ?? null;
  }
  async writeSquad(saveId: string, leagueSlug: string, clubSlug: string, squad: Squad): Promise<void> {
    const key = squadKey(leagueSlug, clubSlug);
    // Normalize like FileSystemDAL's read path: the folder is the league. Copy only
    // when it differs, so the common case keeps returning the written instance.
    const stored: Squad = squad.leagueSlug === leagueSlug ? squad : { ...squad, leagueSlug };
    this.edits(saveId).set(key, { leagueSlug, clubSlug, squad: stored });
    this.pending.set(`squad:${saveId}:${key}`, () => this.inner.writeSquad(saveId, leagueSlug, clubSlug, stored));
  }
  async squadExists(saveId: string, leagueSlug: string, clubSlug: string): Promise<boolean> {
    const key = squadKey(leagueSlug, clubSlug);
    const edits = this.edits(saveId);
    if (edits.has(key)) return edits.get(key) !== null;
    return (await this.squadStore(saveId)).has(key);
  }
  async deleteSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<void> {
    const key = squadKey(leagueSlug, clubSlug);
    this.edits(saveId).set(key, null);
    const run = () => this.inner.deleteSquad(saveId, leagueSlug, clubSlug);
    this.deleteThunks.add(run);
    this.pending.set(`squad:${saveId}:${key}`, run);
  }
  async listLeagues(saveId: string): Promise<string[]> {
    const leagues = new Set(await this.inner.listLeagues(saveId));
    for (const f of this.edits(saveId).values()) if (f) leagues.add(f.leagueSlug);
    return [...leagues];
  }
  async listSquadFiles(saveId: string): Promise<SquadFile[]> {
    return this.squadFilesView(saveId);
  }
  async listSquadsInLeague(saveId: string, leagueSlug: string): Promise<Squad[]> {
    return (await this.squadFilesView(saveId)).filter((f) => f.leagueSlug === leagueSlug).map((f) => f.squad);
  }
  async listAllSquads(saveId: string): Promise<Squad[]> {
    return (await this.squadFilesView(saveId)).map((f) => f.squad);
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
