import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import type { SaveMeta } from "@/backend/SaveService";
import type { Squad, StandingRow } from "@/types/playerTypes";
import type { SeasonArchive, SeasonData, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures } from "@/types/calendarTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { StoredDayLog } from "@/types/dayLogTypes";
import type { TacticsSave } from "@/types/tacticsTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import { mkdir, readdir, rm, unlink } from "fs/promises";
import { RUNTIME_DATA_DIR } from "@/backend/runtimeDir";
import { runPool } from "@/backend/dal/pool";

const SAVES_DIR = `${RUNTIME_DATA_DIR}/saves`;

/** Max squad files parsed in parallel by listSquadFiles / listAllSquads. */
const SQUAD_READ_CONCURRENCY = 32;

function metaPath(saveId: string)      { return `${SAVES_DIR}/${saveId}.json`; }
function seasonPath(saveId: string)    { return `${SAVES_DIR}/${saveId}/season.json`; }
function seasonArchivePath(saveId: string, year: number) {
  return `${SAVES_DIR}/${saveId}/seasons/${year}/season.json`;
}
function transfersPath(saveId: string) { return `${SAVES_DIR}/${saveId}/transfers.json`; }
function transfersArchivePath(saveId: string, year: number) {
  return `${SAVES_DIR}/${saveId}/seasons/${year}/transfers.json`;
}
function squadPath(saveId: string, league: string, club: string) {
  return `${SAVES_DIR}/${saveId}/squads/${league}/${club}.json`;
}
function tacticsPath(saveId: string)    { return `${SAVES_DIR}/${saveId}/tactics.json`; }
function marketPath(saveId: string)      { return `${SAVES_DIR}/${saveId}/market.json`; }
function inboxPath(saveId: string)       { return `${SAVES_DIR}/${saveId}/inbox.json`; }
function dayLogPath(saveId: string, date: string) {
  const [yyyy, mm] = date.split("-");
  return `${SAVES_DIR}/${saveId}/days/${yyyy}/${mm}/${date}.json`;
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

  async readSeason(saveId: string): Promise<SeasonData | null> {
    const file = Bun.file(seasonPath(saveId));
    if (!(await file.exists())) return null;
    return file.json() as Promise<SeasonData>;
  }

  async writeSeason(saveId: string, season: SeasonData): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(seasonPath(saveId), JSON.stringify(season, null, 2));
  }

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

  async readTransfers(saveId: string): Promise<TransferRecord[]> {
    const file = Bun.file(transfersPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<TransferRecord[]>;
  }

  async writeTransfers(saveId: string, transfers: TransferRecord[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(transfersPath(saveId), JSON.stringify(transfers, null, 2));
  }

  async readTransfersArchive(saveId: string, year: number): Promise<TransferRecord[] | null> {
    const file = Bun.file(transfersArchivePath(saveId, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<TransferRecord[]>;
  }

  async writeTransfersArchive(saveId: string, year: number, transfers: TransferRecord[]): Promise<void> {
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
  }

  async squadExists(saveId: string, leagueSlug: string, clubSlug: string): Promise<boolean> {
    return Bun.file(squadPath(saveId, leagueSlug, clubSlug)).exists();
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
    const files = new Array<SquadFile>(paths.length);
    await runPool(paths, SQUAD_READ_CONCURRENCY, async (path, i) => {
      // Bun.Glob yields "\"-separated paths on Windows.
      const [leagueSlug, file] = path.split(/[\\/]/) as [string, string];
      const raw = (await Bun.file(`${dir}/${path}`).json()) as Squad;
      files[i] = { leagueSlug, clubSlug: file.replace(/\.json$/i, ""), squad: { ...raw, leagueSlug } };
    });
    return files;
  }

  // ── Tactics ───────────────────────────────────────────────────────────────

  async readTactics(saveId: string): Promise<TacticsSave | null> {
    const file = Bun.file(tacticsPath(saveId));
    if (!(await file.exists())) return null;
    return file.json() as Promise<TacticsSave>;
  }

  async writeTactics(saveId: string, tactics: TacticsSave): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(tacticsPath(saveId), JSON.stringify(tactics, null, 2));
  }

  async readMarket(saveId: string): Promise<MarketState | null> {
    const file = Bun.file(marketPath(saveId));
    if (!(await file.exists())) return null;
    return file.json() as Promise<MarketState>;
  }

  async writeMarket(saveId: string, market: MarketState): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(marketPath(saveId), JSON.stringify(market, null, 2));
  }

  // ── Inbox ─────────────────────────────────────────────────────────────────

  async readInbox(saveId: string): Promise<InboxMessage[]> {
    const file = Bun.file(inboxPath(saveId));
    if (!(await file.exists())) return [];
    return file.json() as Promise<InboxMessage[]>;
  }

  async writeInbox(saveId: string, messages: InboxMessage[]): Promise<void> {
    await mkdir(`${SAVES_DIR}/${saveId}`, { recursive: true });
    await Bun.write(inboxPath(saveId), JSON.stringify(messages, null, 2));
  }

  async appendInboxMessage(saveId: string, message: InboxMessage): Promise<void> {
    const existing = await this.readInbox(saveId);
    existing.push(message);
    await this.writeInbox(saveId, existing);
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

  async readLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number): Promise<TransferRecord[] | null> {
    const file = Bun.file(leagueTransfersArchivePath2(saveId, leagueSlug, year));
    if (!(await file.exists())) return null;
    return file.json() as Promise<TransferRecord[]>;
  }

  async writeLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number, transfers: TransferRecord[]): Promise<void> {
    const dir = `${SAVES_DIR}/${saveId}/seasons/${year}/${leagueSlug}`;
    await mkdir(dir, { recursive: true });
    await Bun.write(leagueTransfersArchivePath2(saveId, leagueSlug, year), JSON.stringify(transfers, null, 2));
  }
}
