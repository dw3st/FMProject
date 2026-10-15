import type { NewsItem } from "@/types/newsTypes";
import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import { runPool } from "@/backend/dal/pool";
import type { WorldMeta } from "@/backend/SaveService";
import type { StaffPool } from "@/Domain/staff/staffPool";
import type { RefereePool, RefereeSeasonArchive, RefereeState } from "@/types/refereeTypes";
import type { NationalCompetition, NationalState } from "@/types/nationalTypes";
import type { FreeAgent, RetiredPlayer, Squad, StandingRow } from "@/types/playerTypes";
import type { ScoutingState } from "@/types/scoutingTypes";
import type { AchievementsState } from "@/types/achievementTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { ClubHistory } from "@/types/clubHistoryTypes";
import type {
  SeasonArchive,
  LeagueDateIndex,
  LeagueSeasonMeta,
  RoundFixtures,
} from "@/types/calendarTypes";
import type { StoredTransferRecord } from "@/types/transferTypes";
import type { StoredDayLog } from "@/types/dayLogTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { SeatMarketState, WorldMarketState } from "@/types/transferMarketTypes";
import type { SeatState } from "@/types/seatTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { AwardsYear, SeasonGoals } from "@/types/awardTypes";

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
  listSaves(): Promise<WorldMeta[]> {
    return this.inner.listSaves();
  }
  readMeta(saveId: string): Promise<WorldMeta | null> {
    return this.readThrough(`meta:${saveId}`, () => this.inner.readMeta(saveId));
  }
  async writeMeta(meta: WorldMeta): Promise<void> {
    this.buffer(`meta:${meta.id}`, meta, () => this.inner.writeMeta(meta));
  }
  deleteSave(saveId: string): Promise<void> {
    return this.inner.deleteSave(saveId);
  }

  // ── Season ──────────────────────────────────────────────────────────────────
  readSeasonArchive(saveId: string, year: number): Promise<SeasonArchive | null> {
    return this.readThrough(`seasonArchive:${saveId}:${year}`, () => this.inner.readSeasonArchive(saveId, year));
  }
  async writeSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void> {
    this.buffer(`seasonArchive:${saveId}:${archive.year}`, archive, () => this.inner.writeSeasonArchive(saveId, archive));
  }

  // ── Free agents ───────────────────────────────────────────────────────────────
  readFreeAgents(saveId: string): Promise<FreeAgent[]> {
    return this.readThrough(`freeAgents:${saveId}`, () => this.inner.readFreeAgents(saveId));
  }
  async writeFreeAgents(saveId: string, agents: FreeAgent[]): Promise<void> {
    this.buffer(`freeAgents:${saveId}`, agents, () => this.inner.writeFreeAgents(saveId, agents));
  }

  // ── Coaching-staff pool ───────────────────────────────────────────────────────
  readStaffPool(saveId: string): Promise<StaffPool | null> {
    return this.readThrough(`staffPool:${saveId}`, () => this.inner.readStaffPool(saveId));
  }
  async writeStaffPool(saveId: string, pool: StaffPool): Promise<void> {
    this.buffer(`staffPool:${saveId}`, pool, () => this.inner.writeStaffPool(saveId, pool));
  }

  // ── Referees ──────────────────────────────────────────────────────────────────
  readRefereePool(saveId: string): Promise<RefereePool | null> {
    return this.readThrough(`refereePool:${saveId}`, () => this.inner.readRefereePool(saveId));
  }
  async writeRefereePool(saveId: string, pool: RefereePool): Promise<void> {
    this.buffer(`refereePool:${saveId}`, pool, () => this.inner.writeRefereePool(saveId, pool));
  }
  readRefereeState(saveId: string): Promise<RefereeState | null> {
    return this.readThrough(`refereeState:${saveId}`, () => this.inner.readRefereeState(saveId));
  }
  async writeRefereeState(saveId: string, state: RefereeState): Promise<void> {
    this.buffer(`refereeState:${saveId}`, state, () => this.inner.writeRefereeState(saveId, state));
  }
  readRefereeSeason(saveId: string, key: string): Promise<RefereeSeasonArchive | null> {
    return this.readThrough(`refereeSeason:${saveId}:${key}`, () => this.inner.readRefereeSeason(saveId, key));
  }
  async writeRefereeSeason(saveId: string, key: string, archive: RefereeSeasonArchive): Promise<void> {
    this.buffer(`refereeSeason:${saveId}:${key}`, archive, () => this.inner.writeRefereeSeason(saveId, key, archive));
  }
  listRefereeSeasons(saveId: string): Promise<string[]> {
    return this.inner.listRefereeSeasons(saveId);
  }

  // ── National teams ────────────────────────────────────────────────────────────
  readNationalState(saveId: string): Promise<NationalState | null> {
    return this.readThrough(`nationalState:${saveId}`, () => this.inner.readNationalState(saveId));
  }
  async writeNationalState(saveId: string, state: NationalState): Promise<void> {
    this.buffer(`nationalState:${saveId}`, state, () => this.inner.writeNationalState(saveId, state));
  }
  readNationalComp(saveId: string, slug: string): Promise<NationalCompetition | null> {
    return this.readThrough(`nationalComp:${saveId}:${slug}`, () => this.inner.readNationalComp(saveId, slug));
  }
  async writeNationalComp(saveId: string, comp: NationalCompetition): Promise<void> {
    this.buffer(`nationalComp:${saveId}:${comp.slug}`, comp, () => this.inner.writeNationalComp(saveId, comp));
  }

  // ── Manager ranking ───────────────────────────────────────────────────────────
  readManagers(saveId: string): Promise<ManagerRecord[]> {
    return this.readThrough(`managers:${saveId}`, () => this.inner.readManagers(saveId));
  }
  async writeManagers(saveId: string, managers: ManagerRecord[]): Promise<void> {
    this.buffer(`managers:${saveId}`, managers, () => this.inner.writeManagers(saveId, managers));
  }

  // ── Retired players ───────────────────────────────────────────────────────────
  readRetired(saveId: string): Promise<RetiredPlayer[]> {
    return this.readThrough(`retired:${saveId}`, () => this.inner.readRetired(saveId));
  }
  async writeRetired(saveId: string, retired: RetiredPlayer[]): Promise<void> {
    this.buffer(`retired:${saveId}`, retired, () => this.inner.writeRetired(saveId, retired));
  }

  // ── Club history ──────────────────────────────────────────────────────────────
  readClubHistory(saveId: string, squadId: string): Promise<ClubHistory | null> {
    return this.readThrough(`clubHistory:${saveId}:${squadId}`, () => this.inner.readClubHistory(saveId, squadId));
  }
  async writeClubHistory(saveId: string, history: ClubHistory): Promise<void> {
    this.buffer(`clubHistory:${saveId}:${history.squadId}`, history, () => this.inner.writeClubHistory(saveId, history));
  }

  // ── Transfers ─────────────────────────────────────────────────────────────────
  readTransfers(saveId: string): Promise<StoredTransferRecord[]> {
    return this.readThrough(`transfers:${saveId}`, () => this.inner.readTransfers(saveId));
  }
  async writeTransfers(saveId: string, transfers: StoredTransferRecord[]): Promise<void> {
    this.buffer(`transfers:${saveId}`, transfers, () => this.inner.writeTransfers(saveId, transfers));
  }
  readTransfersArchive(saveId: string, year: number): Promise<StoredTransferRecord[] | null> {
    return this.readThrough(`transfersArchive:${saveId}:${year}`, () => this.inner.readTransfersArchive(saveId, year));
  }
  async writeTransfersArchive(saveId: string, year: number, transfers: StoredTransferRecord[]): Promise<void> {
    this.buffer(`transfersArchive:${saveId}:${year}`, transfers, () => this.inner.writeTransfersArchive(saveId, year, transfers));
  }

  // ── Squads ──────────────────────────────────────────────────────────────────
  //
  // All squad access goes through ONE per-save store keyed by file identity
  // (`league/clubStem`), bulk-loaded with a single inner `listSquadFiles` on first
  // use. Once loaded the store is authoritative for which squad files exist, so
  // `readSquad` / `squadExists` never touch the inner DAL — a miss is answered
  // from memory — and `listAllSquads` is served from the same objects.
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

  // ── Transfer market ───────────────────────────────────────────────────────────
  readMarket(saveId: string): Promise<WorldMarketState | null> {
    return this.readThrough(`market:${saveId}`, () => this.inner.readMarket(saveId));
  }
  async writeMarket(saveId: string, market: WorldMarketState): Promise<void> {
    this.buffer(`market:${saveId}`, market, () => this.inner.writeMarket(saveId, market));
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
  readLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number): Promise<StoredTransferRecord[] | null> {
    return this.readThrough(`leagueTransfersArchive:${saveId}:${leagueSlug}:${year}`, () => this.inner.readLeagueTransfersArchive(saveId, leagueSlug, year));
  }
  async writeLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number, transfers: StoredTransferRecord[]): Promise<void> {
    this.buffer(`leagueTransfersArchive:${saveId}:${leagueSlug}:${year}`, transfers, () => this.inner.writeLeagueTransfersArchive(saveId, leagueSlug, year, transfers));
  }

  // ── Season awards ─────────────────────────────────────────────────────────────
  //
  // Plain buffered resources (phase 1 of the flush). A season-goals delete is a tombstone
  // (`null` in the cache) whose thunk deletes the file; a later write replaces it.

  readAwardsYear(saveId: string, year: number): Promise<AwardsYear | null> {
    return this.readThrough(`awards:${saveId}:${year}`, () => this.inner.readAwardsYear(saveId, year));
  }
  async writeAwardsYear(saveId: string, data: AwardsYear): Promise<void> {
    this.buffer(`awards:${saveId}:${data.year}`, data, () => this.inner.writeAwardsYear(saveId, data));
  }
  async listAwardYears(saveId: string): Promise<number[]> {
    const years = new Set(await this.inner.listAwardYears(saveId));
    const prefix = `awards:${saveId}:`;
    for (const [key, v] of this.cache) if (key.startsWith(prefix) && v) years.add(Number(key.slice(prefix.length)));
    return [...years].sort((a, b) => a - b);
  }
  // ── News (plain buffered resources; the prune delete goes straight through) ──

  readNewsMonth(saveId: string, month: string): Promise<NewsItem[] | null> {
    return this.readThrough(`news:${saveId}:${month}`, () => this.inner.readNewsMonth(saveId, month));
  }
  async writeNewsMonth(saveId: string, month: string, items: NewsItem[]): Promise<void> {
    this.buffer(`news:${saveId}:${month}`, items, () => this.inner.writeNewsMonth(saveId, month, items));
  }
  async listNewsMonths(saveId: string): Promise<string[]> {
    const months = new Set(await this.inner.listNewsMonths(saveId));
    const prefix = `news:${saveId}:`;
    for (const [key, v] of this.cache) if (key.startsWith(prefix) && v) months.add(key.slice(prefix.length));
    return [...months].sort();
  }
  deleteNewsMonth(saveId: string, month: string): Promise<void> {
    return this.inner.deleteNewsMonth(saveId, month);
  }
  readSeasonGoals(saveId: string, league: string, year: number): Promise<SeasonGoals | null> {
    return this.readThrough(`seasonGoals:${saveId}:${league}:${year}`, () => this.inner.readSeasonGoals(saveId, league, year));
  }
  async writeSeasonGoals(saveId: string, data: SeasonGoals): Promise<void> {
    this.buffer(`seasonGoals:${saveId}:${data.league}:${data.year}`, data, () => this.inner.writeSeasonGoals(saveId, data));
  }
  async deleteSeasonGoals(saveId: string, league: string, year: number): Promise<void> {
    this.buffer(`seasonGoals:${saveId}:${league}:${year}`, null, () => this.inner.deleteSeasonGoals(saveId, league, year));
  }
  async listSeasonGoalFiles(saveId: string): Promise<{ league: string; year: number }[]> {
    const out = new Map<string, { league: string; year: number }>(
      (await this.inner.listSeasonGoalFiles(saveId)).map((f) => [`${f.league}:${f.year}`, f]),
    );
    const prefix = `seasonGoals:${saveId}:`;
    for (const [key, v] of this.cache) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (v) { const g = v as SeasonGoals; out.set(rest, { league: g.league, year: g.year }); }
      else if (this.pending.has(key)) out.delete(rest);
    }
    return [...out.values()];
  }

  // ── Seats: plain buffered resources (phase 1 of the flush, before the meta) ─────────────────
  // Seat ids are validated by the inner DAL when the thunk runs; a bad id never reaches the cache
  // because every caller gets it from `SaveMeta.seats` / `save_members`.

  readSeat(saveId: string, seatId: string): Promise<SeatState | null> {
    return this.readThrough(`seat:${saveId}:${seatId}`, () => this.inner.readSeat(saveId, seatId));
  }
  async writeSeat(saveId: string, seatId: string, seat: SeatState): Promise<void> {
    this.buffer(`seat:${saveId}:${seatId}`, seat, () => this.inner.writeSeat(saveId, seatId, seat));
  }
  readSeatTactics(saveId: string, seatId: string): Promise<TacticsSave | null> {
    return this.readThrough(`seatTactics:${saveId}:${seatId}`, () => this.inner.readSeatTactics(saveId, seatId));
  }
  async writeSeatTactics(saveId: string, seatId: string, tactics: TacticsSave): Promise<void> {
    this.buffer(`seatTactics:${saveId}:${seatId}`, tactics, () => this.inner.writeSeatTactics(saveId, seatId, tactics));
  }
  readSeatAchievements(saveId: string, seatId: string): Promise<AchievementsState | null> {
    return this.readThrough(`seatAchievements:${saveId}:${seatId}`, () => this.inner.readSeatAchievements(saveId, seatId));
  }
  async writeSeatAchievements(saveId: string, seatId: string, state: AchievementsState): Promise<void> {
    this.buffer(`seatAchievements:${saveId}:${seatId}`, state, () => this.inner.writeSeatAchievements(saveId, seatId, state));
  }
  readSeatScouting(saveId: string, seatId: string): Promise<ScoutingState | null> {
    return this.readThrough(`seatScouting:${saveId}:${seatId}`, () => this.inner.readSeatScouting(saveId, seatId));
  }
  async writeSeatScouting(saveId: string, seatId: string, state: ScoutingState): Promise<void> {
    this.buffer(`seatScouting:${saveId}:${seatId}`, state, () => this.inner.writeSeatScouting(saveId, seatId, state));
  }
  readSeatInbox(saveId: string, seatId: string): Promise<InboxMessage[]> {
    return this.readThrough(`seatInbox:${saveId}:${seatId}`, () => this.inner.readSeatInbox(saveId, seatId));
  }
  async writeSeatInbox(saveId: string, seatId: string, messages: InboxMessage[]): Promise<void> {
    this.buffer(`seatInbox:${saveId}:${seatId}`, messages, () => this.inner.writeSeatInbox(saveId, seatId, messages));
  }
  async appendSeatInboxMessage(saveId: string, seatId: string, message: InboxMessage): Promise<void> {
    const key = `seatInbox:${saveId}:${seatId}`;
    await this.readSeatInbox(saveId, seatId);
    // The cache AFTER the await (a concurrent append may have landed while this call waited).
    const current = (this.cache.get(key) as InboxMessage[] | undefined) ?? [];
    await this.writeSeatInbox(saveId, seatId, [...current, message]);
  }
  /** Not buffered (same reason as `listLedgerSeasons`). */
  listSeatLedgerSeasons(saveId: string, seatId: string): Promise<number[]> {
    return this.inner.listSeatLedgerSeasons(saveId, seatId);
  }
  readSeatLedger(saveId: string, seatId: string, season: number): Promise<LedgerEntry[]> {
    return this.readThrough(`seatLedger:${saveId}:${seatId}:${season}`, () => this.inner.readSeatLedger(saveId, seatId, season));
  }
  async writeSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    this.buffer(`seatLedger:${saveId}:${seatId}:${season}`, entries, () => this.inner.writeSeatLedger(saveId, seatId, season, entries));
  }
  async appendSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const key = `seatLedger:${saveId}:${seatId}:${season}`;
    await this.readSeatLedger(saveId, seatId, season);
    const current = (this.cache.get(key) as LedgerEntry[] | undefined) ?? [];
    await this.writeSeatLedger(saveId, seatId, season, [...current, ...entries]);
  }
  readSeatMarket(saveId: string, seatId: string): Promise<SeatMarketState | null> {
    return this.readThrough(`seatMarket:${saveId}:${seatId}`, () => this.inner.readSeatMarket(saveId, seatId));
  }
  async writeSeatMarket(saveId: string, seatId: string, market: SeatMarketState): Promise<void> {
    this.buffer(`seatMarket:${saveId}:${seatId}`, market, () => this.inner.writeSeatMarket(saveId, seatId, market));
  }
}
