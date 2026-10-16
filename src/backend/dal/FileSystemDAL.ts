import type { NewsItem } from "@/types/newsTypes";
import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import type { SaveMeta } from "@/backend/SaveService";
import type { StaffPool } from "@/Domain/staff/staffPool";
import type { RefereePool, RefereeSeasonArchive, RefereeState } from "@/types/refereeTypes";
import type { NationalCompetition, NationalState } from "@/types/nationalTypes";
import type { FreeAgent, RetiredPlayer, Squad, StandingRow } from "@/types/playerTypes";
import type { SeatOffer } from "@/types/seatOfferTypes";
import type { ScoutingState } from "@/types/scoutingTypes";
import type { AchievementsState } from "@/types/achievementTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { ClubHistory } from "@/types/clubHistoryTypes";
import type { SeasonArchive, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import type { StoredTransferRecord } from "@/types/transferTypes";
import type { StoredDayLog } from "@/types/dayLogTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { SeatMarketState, WorldMarketState } from "@/types/transferMarketTypes";
import type { LiveRecordingFile, PendingDay } from "@/types/groupAdvanceTypes";
import type { SeatState } from "@/types/seatTypes";
import { SEAT_ID_PATTERN } from "@/types/seatTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { AwardsYear, SeasonGoals } from "@/types/awardTypes";
import { mkdir, readdir, rm, unlink } from "fs/promises";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";
import { runPool } from "@/backend/dal/pool";
import { bumpSaveDataVersion } from "@/backend/dal/saveDataVersion";

const SAVES_DIR = `${RUNTIME_DATA_DIR}/saves`;

/** Max squad files parsed in parallel by listSquadFiles / listAllSquads. */
const SQUAD_READ_CONCURRENCY = 32;

function metaPath(saveId: string)      { return `${SAVES_DIR}/${saveId}.json`; }
function seasonArchivePath(saveId: string, year: number) {
  return `${SAVES_DIR}/${saveId}/seasons/${year}/season.json`;
}
function freeAgentsPath(saveId: string) { return `${SAVES_DIR}/${saveId}/freeAgents.json`; }
function seatOffersPath(saveId: string) { return `${SAVES_DIR}/${saveId}/seatOffers.json`; }
function staffPoolPath(saveId: string) { return `${SAVES_DIR}/${saveId}/staffPool.json`; }
function refereesDir(saveId: string) { return `${SAVES_DIR}/${saveId}/referees`; }
/** Archive keys are `<country>-<season>`; anything outside this shape never reaches a path. */
const REFEREE_SEASON_KEY = /^[A-Za-z0-9 _.-]{1,80}$/;
function refereeSeasonPath(saveId: string, key: string) {
  if (!REFEREE_SEASON_KEY.test(key) || key.includes("..")) throw new Error(`invalid referee season key: ${key}`);
  return `${refereesDir(saveId)}/seasons/${key}.json`;
}
function nationalDir(saveId: string) { return `${SAVES_DIR}/${saveId}/national`; }
const NATIONAL_SLUG = /^[a-z0-9_]{1,40}$/;
function nationalCompPath(saveId: string, slug: string) {
  if (!NATIONAL_SLUG.test(slug)) throw new Error(`invalid national competition slug: ${slug}`);
  return `${nationalDir(saveId)}/comps/${slug}.json`;
}
function retiredPath(saveId: string) { return `${SAVES_DIR}/${saveId}/retired.json`; }
function clubHistoryPath(saveId: string, squadId: string) {
  return `${SAVES_DIR}/${saveId}/clubHistory/${squadId}.json`;
}
function managersPath(saveId: string) { return `${SAVES_DIR}/${saveId}/managers.json`; }
function transfersPath(saveId: string) { return `${SAVES_DIR}/${saveId}/transfers.json`; }
function transfersArchivePath(saveId: string, year: number) {
  return `${SAVES_DIR}/${saveId}/seasons/${year}/transfers.json`;
}
function squadPath(saveId: string, league: string, club: string) {
  return `${SAVES_DIR}/${saveId}/squads/${league}/${club}.json`;
}
function marketPath(saveId: string)      { return `${SAVES_DIR}/${saveId}/market.json`; }
/** Awards files: validate before building a path (league slug and year come from the world / meta). */
function awardYear(year: number): number {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) throw new Error(`invalid awards year: ${year}`);
  return year;
}
function awardLeague(league: string): string {
  if (!/^[a-z0-9_]+$/.test(league)) throw new Error(`invalid league slug: ${league}`);
  return league;
}
function newsPath(saveId: string, month: string) { return `${SAVES_DIR}/${saveId}/news/${month}.json`; }
function awardsPath(saveId: string, year: number) { return `${SAVES_DIR}/${saveId}/awards/${awardYear(year)}.json`; }
function seasonGoalsPath(saveId: string, league: string, year: number) {
  return `${SAVES_DIR}/${saveId}/seasonGoals/${awardLeague(league)}-${awardYear(year)}.json`;
}
function dayLogPath(saveId: string, date: string) {
  const [yyyy, mm] = date.split("-");
  return `${SAVES_DIR}/${saveId}/days/${yyyy}/${mm}/${date}.json`;
}

/** A seat's folder; the id is validated before it reaches a path. */
function seatDir(saveId: string, seatId: string): string {
  if (!SEAT_ID_PATTERN.test(seatId)) throw new Error(`invalid seat id: ${seatId}`);
  return `${SAVES_DIR}/${saveId}/seats/${seatId}`;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.json() as Promise<T>;
}

async function writeJsonFile(dir: string, path: string, value: unknown, pretty = false): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Bun.write(path, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
}

function leagueDir(saveId: string, leagueSlug: string) {
  return `${SAVES_DIR}/${saveId}/leagues/${leagueSlug}`;
}
function leagueMetaPath(saveId: string, leagueSlug: string) {
  return `${leagueDir(saveId, leagueSlug)}/meta.json`;
}
function leagueStandingsPath(saveId: string, leagueSlug: string) {
  return `${leagueDir(saveId, leagueSlug)}/standings.json`;
}
function roundPath(saveId: string, leagueSlug: string, round: number) {
  return `${leagueDir(saveId, leagueSlug)}/rounds/${round}.json`;
}
function dateIndexPath(saveId: string, leagueSlug: string) {
  return `${leagueDir(saveId, leagueSlug)}/date-index.json`;
}
function leagueSeasonArchivePath2(saveId: string, leagueSlug: string, year: number) {
  return `${SAVES_DIR}/${saveId}/seasons/${year}/${leagueSlug}/season.json`;
}
function leagueTransfersArchivePath2(saveId: string, leagueSlug: string, year: number) {
  return `${SAVES_DIR}/${saveId}/seasons/${year}/${leagueSlug}/transfers.json`;
}

export class FileSystemDAL implements ISaveDAL {

  // ── Save meta ─────────────────────────────────────────────────────────────

  async listSaves(): Promise<SaveMeta[]> {
    await mkdir(SAVES_DIR, { recursive: true });
    const glob = new Bun.Glob("*.json");
    const saves: SaveMeta[] = [];
    for await (const path of glob.scan(SAVES_DIR)) {
      const file = Bun.file(`${SAVES_DIR}/${path}`);
      saves.push((await file.json()) as SaveMeta);
    }
    saves.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return saves;
  }

  async readMeta(saveId: string): Promise<SaveMeta | null> {
    const file = Bun.file(metaPath(saveId));
    if (!(await file.exists())) return null;
    return file.json() as Promise<SaveMeta>;
  }

  async writeMeta(meta: SaveMeta): Promise<void> {
    await mkdir(SAVES_DIR, { recursive: true });
    await Bun.write(metaPath(meta.id), JSON.stringify(meta, null, 2));
  }

  async deleteSave(saveId: string): Promise<void> {
    const p = metaPath(saveId);
    const f = Bun.file(p);
    if (await f.exists()) await unlink(p);
    const dir = `${SAVES_DIR}/${saveId}`;
    try { await rm(dir, { recursive: true, force: true }); } catch { /* ok */ }
  }

  // ── Season ────────────────────────────────────────────────────────────────

  async readSeasonArchive(saveId: string, year: number): Promise<SeasonArchive | null> {
    const file = Bun.file(seasonArchivePath(saveId, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<SeasonArchive>;
  }

  async writeSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void> {
    const dir = `${SAVES_DIR}/${saveId}/seasons/${archive.year}`;
    await mkdir(dir, { recursive: true });
    await Bun.write(seasonArchivePath(saveId, archive.year), JSON.stringify(archive, null, 2));
  }

  // ── Transfers ─────────────────────────────────────────────────────────────

  async readFreeAgents(saveId: string): Promise<FreeAgent[]> {
    const file = Bun.file(freeAgentsPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<FreeAgent[]>;
  }

  async writeFreeAgents(saveId: string, agents: FreeAgent[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(freeAgentsPath(saveId), JSON.stringify(agents));
    bumpSaveDataVersion(saveId);
  }

  async readSeatOffers(saveId: string): Promise<SeatOffer[]> {
    const file = Bun.file(seatOffersPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<SeatOffer[]>;
  }

  async writeSeatOffers(saveId: string, offers: SeatOffer[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(seatOffersPath(saveId), JSON.stringify(offers));
    bumpSaveDataVersion(saveId);
  }

  async readStaffPool(saveId: string): Promise<StaffPool | null> {
    const file = Bun.file(staffPoolPath(saveId));
    if (!(await file.exists())) return null;
    return file.json() as Promise<StaffPool>;
  }

  async writeStaffPool(saveId: string, pool: StaffPool): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(staffPoolPath(saveId), JSON.stringify(pool));
  }

  async readRefereePool(saveId: string): Promise<RefereePool | null> {
    const file = Bun.file(`${refereesDir(saveId)}/pool.json`);
    if (!(await file.exists())) return null;
    return file.json() as Promise<RefereePool>;
  }

  async writeRefereePool(saveId: string, pool: RefereePool): Promise<void> {
    await mkdir(refereesDir(saveId), { recursive: true });
    await Bun.write(`${refereesDir(saveId)}/pool.json`, JSON.stringify(pool));
  }

  async readRefereeState(saveId: string): Promise<RefereeState | null> {
    const file = Bun.file(`${refereesDir(saveId)}/state.json`);
    if (!(await file.exists())) return null;
    return file.json() as Promise<RefereeState>;
  }

  async writeRefereeState(saveId: string, state: RefereeState): Promise<void> {
    await mkdir(refereesDir(saveId), { recursive: true });
    await Bun.write(`${refereesDir(saveId)}/state.json`, JSON.stringify(state));
  }

  async readRefereeSeason(saveId: string, key: string): Promise<RefereeSeasonArchive | null> {
    const file = Bun.file(refereeSeasonPath(saveId, key));
    if (!(await file.exists())) return null;
    return file.json() as Promise<RefereeSeasonArchive>;
  }

  async writeRefereeSeason(saveId: string, key: string, archive: RefereeSeasonArchive): Promise<void> {
    await mkdir(`${refereesDir(saveId)}/seasons`, { recursive: true });
    await Bun.write(refereeSeasonPath(saveId, key), JSON.stringify(archive));
  }

  async listRefereeSeasons(saveId: string): Promise<string[]> {
    try {
      return (await readdir(`${refereesDir(saveId)}/seasons`)).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).sort();
    } catch {
      return [];
    }
  }

  async readNationalState(saveId: string): Promise<NationalState | null> {
    const file = Bun.file(`${nationalDir(saveId)}/state.json`);
    if (!(await file.exists())) return null;
    return file.json() as Promise<NationalState>;
  }

  async writeNationalState(saveId: string, state: NationalState): Promise<void> {
    await mkdir(nationalDir(saveId), { recursive: true });
    await Bun.write(`${nationalDir(saveId)}/state.json`, JSON.stringify(state));
  }

  async readNationalComp(saveId: string, slug: string): Promise<NationalCompetition | null> {
    const file = Bun.file(nationalCompPath(saveId, slug));
    if (!(await file.exists())) return null;
    return file.json() as Promise<NationalCompetition>;
  }

  async writeNationalComp(saveId: string, comp: NationalCompetition): Promise<void> {
    await mkdir(`${nationalDir(saveId)}/comps`, { recursive: true });
    await Bun.write(nationalCompPath(saveId, comp.slug), JSON.stringify(comp));
  }

  async readManagers(saveId: string): Promise<ManagerRecord[]> {
    const file = Bun.file(managersPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<ManagerRecord[]>;
  }

  async writeManagers(saveId: string, managers: ManagerRecord[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(managersPath(saveId), JSON.stringify(managers));
  }

  async readRetired(saveId: string): Promise<RetiredPlayer[]> {
    const file = Bun.file(retiredPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<RetiredPlayer[]>;
  }

  async writeRetired(saveId: string, retired: RetiredPlayer[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(retiredPath(saveId), JSON.stringify(retired));
  }

  async readClubHistory(saveId: string, squadId: string): Promise<ClubHistory | null> {
    const file = Bun.file(clubHistoryPath(saveId, squadId));
    if (!(await file.exists())) return null;
    return file.json() as Promise<ClubHistory>;
  }

  async writeClubHistory(saveId: string, history: ClubHistory): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}/clubHistory`, { recursive: true });
    await Bun.write(clubHistoryPath(saveId, history.squadId), JSON.stringify(history));
  }

  async readTransfers(saveId: string): Promise<StoredTransferRecord[]> {
    const file = Bun.file(transfersPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<StoredTransferRecord[]>;
  }

  async writeTransfers(saveId: string, transfers: StoredTransferRecord[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(transfersPath(saveId), JSON.stringify(transfers, null, 2));
  }

  async readTransfersArchive(saveId: string, year: number): Promise<StoredTransferRecord[] | null> {
    const file = Bun.file(transfersArchivePath(saveId, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<StoredTransferRecord[]>;
  }

  async writeTransfersArchive(saveId: string, year: number, transfers: StoredTransferRecord[]): Promise<void> {
    const dir = `${SAVES_DIR}/${saveId}/seasons/${year}`;
    await mkdir(dir, { recursive: true });
    await Bun.write(transfersArchivePath(saveId, year), JSON.stringify(transfers, null, 2));
  }

  // ── Squads ────────────────────────────────────────────────────────────────

  async readSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<Squad | null> {
    const file = Bun.file(squadPath(saveId, leagueSlug, clubSlug));
    if (!(await file.exists())) return null;
    // Inject leagueSlug from the path — squad files don't store it, but downstream
    // (resolveSquadId, transfer persistence) relies on it. Mirrors listAllSquads.
    const raw = (await file.json()) as Squad;
    return { ...raw, leagueSlug };
  }

  async writeSquad(saveId: string, leagueSlug: string, clubSlug: string, squad: Squad): Promise<void> {
    const dir = `${SAVES_DIR}/${saveId}/squads/${leagueSlug}`;
    await mkdir(dir, { recursive: true });
    // Compact: squads are the bulk of per-day writes; other (small) files stay pretty-printed.
    await Bun.write(squadPath(saveId, leagueSlug, clubSlug), JSON.stringify(squad));
    bumpSaveDataVersion(saveId);
  }

  async squadExists(saveId: string, leagueSlug: string, clubSlug: string): Promise<boolean> {
    return Bun.file(squadPath(saveId, leagueSlug, clubSlug)).exists();
  }

  async deleteSquad(saveId: string, leagueSlug: string, clubSlug: string): Promise<void> {
    try {
      await unlink(squadPath(saveId, leagueSlug, clubSlug));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    bumpSaveDataVersion(saveId);
  }

  async listLeagues(saveId: string): Promise<string[]> {
    const dir = `${SAVES_DIR}/${saveId}/squads`;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  async listSquadsInLeague(saveId: string, leagueSlug: string): Promise<Squad[]> {
    const dir = `${SAVES_DIR}/${saveId}/squads/${leagueSlug}`;
    const glob = new Bun.Glob("*.json");
    const squads: Squad[] = [];
    for await (const path of glob.scan(dir)) {
      const raw = (await Bun.file(`${dir}/${path}`).json()) as Squad;
      squads.push({ ...raw, leagueSlug });
    }
    return squads;
  }

  async listAllSquads(saveId: string): Promise<Squad[]> {
    return (await this.listSquadFiles(saveId)).map((f) => f.squad);
  }

  /**
   * Every squad file of the save, i.e. exactly the `squads/{league}/{club}.json`
   * files that readSquad/writeSquad address — hence the `*\/*.json` glob (a file at
   * another depth is not addressable by (league, club) and is not a squad).
   * listAllSquads is derived from this, so both use the same layout. Paths are
   * collected first, then parsed in parallel (at most SQUAD_READ_CONCURRENCY at a
   * time); the result keeps the directory-scan order.
   */
  async listSquadFiles(saveId: string): Promise<SquadFile[]> {
    const dir = `${SAVES_DIR}/${saveId}/squads`;
    const glob = new Bun.Glob("*/*.json");
    const paths: string[] = [];
    try {
      for await (const path of glob.scan(dir)) paths.push(path);
    } catch (e) {
      // A save without a squads dir has no squads (mirrors listLeagues).
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const files = new Array<SquadFile | undefined>(paths.length);
    await runPool(paths, SQUAD_READ_CONCURRENCY, async (path, i) => {
      // Bun.Glob yields "\"-separated paths on Windows.
      const [leagueSlug, file] = path.split(/[\\/]/) as [string, string];
      let raw: Squad;
      try {
        raw = (await Bun.file(`${dir}/${path}`).json()) as Squad;
      } catch (e) {
        // Deleted between the scan and the read (e.g. a concurrent moveSquad): no longer a squad file.
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
      }
      files[i] = { leagueSlug, clubSlug: file.replace(/\.json$/i, ""), squad: { ...raw, leagueSlug } };
    });
    return files.filter((f): f is SquadFile => f !== undefined);
  }

  // ── Tactics ───────────────────────────────────────────────────────────────

  async readMarket(saveId: string): Promise<WorldMarketState | null> {
    const file = Bun.file(marketPath(saveId));
    if (!(await file.exists())) return null;
    return file.json() as Promise<WorldMarketState>;
  }

  async writeMarket(saveId: string, market: WorldMarketState): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(marketPath(saveId), JSON.stringify(market, null, 2));
    bumpSaveDataVersion(saveId);
  }

  // ── Day logs ──────────────────────────────────────────────────────────────

  async readDayLog(saveId: string, date: string): Promise<StoredDayLog | null> {
    const file = Bun.file(dayLogPath(saveId, date));
    if (!(await file.exists())) return null;
    return file.json() as Promise<StoredDayLog>;
  }

  async writeDayLog(saveId: string, date: string, log: StoredDayLog): Promise<void> {
    const [yyyy, mm] = date.split("-");
    await mkdir(`${SAVES_DIR}/${saveId}/days/${yyyy}/${mm}`, { recursive: true });
    await Bun.write(dayLogPath(saveId, date), JSON.stringify(log, null, 2));
  }

  // ── Per-league season data ─────────────────────────────────────────────────

  async readLeagueMeta(saveId: string, leagueSlug: string): Promise<LeagueSeasonMeta | null> {
    const file = Bun.file(leagueMetaPath(saveId, leagueSlug));
    if (!(await file.exists())) return null;
    return file.json() as Promise<LeagueSeasonMeta>;
  }

  async writeLeagueMeta(saveId: string, meta: LeagueSeasonMeta): Promise<void> {
    await mkdir(leagueDir(saveId, meta.leagueSlug), { recursive: true });
    await Bun.write(leagueMetaPath(saveId, meta.leagueSlug), JSON.stringify(meta, null, 2));
  }

  async readLeagueStandings(saveId: string, leagueSlug: string): Promise<StandingRow[] | null> {
    const file = Bun.file(leagueStandingsPath(saveId, leagueSlug));
    if (!(await file.exists())) return null;
    return file.json() as Promise<StandingRow[]>;
  }

  async writeLeagueStandings(saveId: string, leagueSlug: string, rows: StandingRow[]): Promise<void> {
    await mkdir(leagueDir(saveId, leagueSlug), { recursive: true });
    await Bun.write(leagueStandingsPath(saveId, leagueSlug), JSON.stringify(rows, null, 2));
  }

  async readRound(saveId: string, leagueSlug: string, round: number): Promise<RoundFixtures | null> {
    const file = Bun.file(roundPath(saveId, leagueSlug, round));
    if (!(await file.exists())) return null;
    return file.json() as Promise<RoundFixtures>;
  }

  async writeRound(saveId: string, leagueSlug: string, round: number, data: RoundFixtures): Promise<void> {
    await mkdir(`${leagueDir(saveId, leagueSlug)}/rounds`, { recursive: true });
    await Bun.write(roundPath(saveId, leagueSlug, round), JSON.stringify(data, null, 2));
  }

  async readDateIndex(saveId: string, leagueSlug: string): Promise<LeagueDateIndex | null> {
    const file = Bun.file(dateIndexPath(saveId, leagueSlug));
    if (!(await file.exists())) return null;
    return file.json() as Promise<LeagueDateIndex>;
  }

  async writeDateIndex(saveId: string, leagueSlug: string, index: LeagueDateIndex): Promise<void> {
    await mkdir(leagueDir(saveId, leagueSlug), { recursive: true });
    await Bun.write(dateIndexPath(saveId, leagueSlug), JSON.stringify(index, null, 2));
  }

  async listActiveLeaguesSlugs(saveId: string): Promise<string[]> {
    const dir = `${SAVES_DIR}/${saveId}/leagues`;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  async readLeagueSeasonArchive(saveId: string, leagueSlug: string, year: number): Promise<SeasonArchive | null> {
    const file = Bun.file(leagueSeasonArchivePath2(saveId, leagueSlug, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<SeasonArchive>;
  }

  async writeLeagueSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void> {
    const dir = `${SAVES_DIR}/${saveId}/seasons/${archive.year}/${archive.leagueSlug}`;
    await mkdir(dir, { recursive: true });
    await Bun.write(leagueSeasonArchivePath2(saveId, archive.leagueSlug, archive.year), JSON.stringify(archive, null, 2));
  }

  async readLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number): Promise<StoredTransferRecord[] | null> {
    const file = Bun.file(leagueTransfersArchivePath2(saveId, leagueSlug, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<StoredTransferRecord[]>;
  }

  async writeLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number, transfers: StoredTransferRecord[]): Promise<void> {
    const dir = `${SAVES_DIR}/${saveId}/seasons/${year}/${leagueSlug}`;
    await mkdir(dir, { recursive: true });
    await Bun.write(leagueTransfersArchivePath2(saveId, leagueSlug, year), JSON.stringify(transfers, null, 2));
  }

  // ── Season awards ─────────────────────────────────────────────────────────────

  async readAwardsYear(saveId: string, year: number): Promise<AwardsYear | null> {
    const file = Bun.file(awardsPath(saveId, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<AwardsYear>;
  }

  async writeAwardsYear(saveId: string, data: AwardsYear): Promise<void> {
    const path = awardsPath(saveId, data.year);
    await mkdir(`${SAVES_DIR}/${saveId}/awards`, { recursive: true });
    await Bun.write(path, JSON.stringify(data));
  }

  async listAwardYears(saveId: string): Promise<number[]> {
    let names: string[];
    try { names = await readdir(`${SAVES_DIR}/${saveId}/awards`); } catch { return []; }
    return names
      .map((n) => /^(\d{4})\.json$/.exec(n)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  }

  // ── News ──────────────────────────────────────────────────────────────────────

  async readNewsMonth(saveId: string, month: string): Promise<NewsItem[] | null> {
    const file = Bun.file(newsPath(saveId, month));
    if (!(await file.exists())) return null;
    return file.json() as Promise<NewsItem[]>;
  }

  async writeNewsMonth(saveId: string, month: string, items: NewsItem[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}/news`, { recursive: true });
    await Bun.write(newsPath(saveId, month), JSON.stringify(items));
  }

  async listNewsMonths(saveId: string): Promise<string[]> {
    let names: string[];
    try { names = await readdir(`${SAVES_DIR}/${saveId}/news`); } catch { return []; }
    return names
      .map((n) => /^(\d{4}-\d{2})\.json$/.exec(n)?.[1])
      .filter((m): m is string => m !== undefined)
      .sort();
  }

  async deleteNewsMonth(saveId: string, month: string): Promise<void> {
    await rm(newsPath(saveId, month), { force: true });
  }

  async readSeasonGoals(saveId: string, league: string, year: number): Promise<SeasonGoals | null> {
    const file = Bun.file(seasonGoalsPath(saveId, league, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<SeasonGoals>;
  }

  async writeSeasonGoals(saveId: string, data: SeasonGoals): Promise<void> {
    const path = seasonGoalsPath(saveId, data.league, data.year);
    await mkdir(`${SAVES_DIR}/${saveId}/seasonGoals`, { recursive: true });
    await Bun.write(path, JSON.stringify(data));
  }

  async deleteSeasonGoals(saveId: string, league: string, year: number): Promise<void> {
    try { await unlink(seasonGoalsPath(saveId, league, year)); } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }

  async listSeasonGoalFiles(saveId: string): Promise<{ league: string; year: number }[]> {
    let names: string[];
    try { names = await readdir(`${SAVES_DIR}/${saveId}/seasonGoals`); } catch { return []; }
    return names
      .map((n) => /^([a-z0-9_]+)-(\d{4})\.json$/.exec(n))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ league: m[1]!, year: Number(m[2]) }));
  }

  // ── Seats ─────────────────────────────────────────────────────────────────

  async readSeat(saveId: string, seatId: string): Promise<SeatState | null> {
    return readJsonFile<SeatState>(`${seatDir(saveId, seatId)}/seat.json`);
  }

  async writeSeat(saveId: string, seatId: string, seat: SeatState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/seat.json`, seat, true);
  }

  async readSeatTactics(saveId: string, seatId: string): Promise<TacticsSave | null> {
    return readJsonFile<TacticsSave>(`${seatDir(saveId, seatId)}/tactics.json`);
  }

  async writeSeatTactics(saveId: string, seatId: string, tactics: TacticsSave): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/tactics.json`, tactics, true);
  }

  async readSeatAchievements(saveId: string, seatId: string): Promise<AchievementsState | null> {
    return readJsonFile<AchievementsState>(`${seatDir(saveId, seatId)}/achievements.json`);
  }

  async writeSeatAchievements(saveId: string, seatId: string, state: AchievementsState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/achievements.json`, state);
  }

  async readSeatScouting(saveId: string, seatId: string): Promise<ScoutingState | null> {
    return readJsonFile<ScoutingState>(`${seatDir(saveId, seatId)}/scouting.json`);
  }

  async writeSeatScouting(saveId: string, seatId: string, state: ScoutingState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/scouting.json`, state);
    // The scout search blurs every player by this file's knowledge: rebuild its index.
    bumpSaveDataVersion(saveId);
  }

  async readSeatInbox(saveId: string, seatId: string): Promise<InboxMessage[]> {
    return (await readJsonFile<InboxMessage[]>(`${seatDir(saveId, seatId)}/inbox.json`)) ?? [];
  }

  async writeSeatInbox(saveId: string, seatId: string, messages: InboxMessage[]): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/inbox.json`, messages, true);
  }

  async appendSeatInboxMessage(saveId: string, seatId: string, message: InboxMessage): Promise<void> {
    const existing = await this.readSeatInbox(saveId, seatId);
    existing.push(message);
    await this.writeSeatInbox(saveId, seatId, existing);
  }

  async listSeatLedgerSeasons(saveId: string, seatId: string): Promise<number[]> {
    let names: string[];
    try {
      names = await readdir(`${seatDir(saveId, seatId)}/ledger`);
    } catch {
      return [];
    }
    return names
      .map((n) => /^(\d+)\.json$/.exec(n)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
  }

  async readSeatLedger(saveId: string, seatId: string, season: number): Promise<LedgerEntry[]> {
    return (await readJsonFile<LedgerEntry[]>(`${seatDir(saveId, seatId)}/ledger/${season}.json`)) ?? [];
  }

  async appendSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const existing = await this.readSeatLedger(saveId, seatId, season);
    await this.writeSeatLedger(saveId, seatId, season, [...existing, ...entries]);
  }

  async writeSeatLedger(saveId: string, seatId: string, season: number, entries: LedgerEntry[]): Promise<void> {
    if (!Number.isInteger(season)) throw new Error(`invalid ledger season: ${season}`);
    const dir = `${seatDir(saveId, seatId)}/ledger`;
    await writeJsonFile(dir, `${dir}/${season}.json`, entries, true);
  }

  async readSeatMarket(saveId: string, seatId: string): Promise<SeatMarketState | null> {
    return readJsonFile<SeatMarketState>(`${seatDir(saveId, seatId)}/market.json`);
  }

  async writeSeatMarket(saveId: string, seatId: string, market: SeatMarketState): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/market.json`, market, true);
    bumpSaveDataVersion(saveId);
  }

  async readSeatLiveRecording(saveId: string, seatId: string): Promise<LiveRecordingFile | null> {
    return readJsonFile<LiveRecordingFile>(`${seatDir(saveId, seatId)}/liveRecording.json`);
  }

  async writeSeatLiveRecording(saveId: string, seatId: string, file: LiveRecordingFile | null): Promise<void> {
    const dir = seatDir(saveId, seatId);
    if (file === null) {
      await rm(`${dir}/liveRecording.json`, { force: true });
      bumpSaveDataVersion(saveId);
      return;
    }
    await writeJsonFile(dir, `${dir}/liveRecording.json`, file);
    bumpSaveDataVersion(saveId);
  }

  async readSeatPendingSummary(saveId: string, seatId: string): Promise<PendingDay[]> {
    return (await readJsonFile<PendingDay[]>(`${seatDir(saveId, seatId)}/pendingSummary.json`)) ?? [];
  }

  async writeSeatPendingSummary(saveId: string, seatId: string, days: PendingDay[]): Promise<void> {
    const dir = seatDir(saveId, seatId);
    await writeJsonFile(dir, `${dir}/pendingSummary.json`, days);
    bumpSaveDataVersion(saveId);
  }

  async deleteSeat(saveId: string, seatId: string): Promise<void> {
    await rm(seatDir(saveId, seatId), { recursive: true, force: true });
    bumpSaveDataVersion(saveId);
  }
}
