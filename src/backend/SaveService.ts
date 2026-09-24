import { fileURLToPath } from "node:url";
import { randomUUID } from "crypto";
import { readdir } from "fs/promises";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import type { ISaveDAL, SquadFile } from "@/backend/dal/ISaveDAL";
import { generateRestDays, parseSeasonDates } from "@/Domain/season";
import { generateLeagueCalendar } from "@/Domain/season/generateCalendar";
import { LEAGUE_SCHEDULE_CONFIGS } from "@/Domain/season/leagueScheduleConfig";
import { DEFAULT_TACTICAL_STYLE } from "@/types/tacticsTypes";
import type { TacticalStyle, TacticsSave } from "@/types/tacticsTypes";
import type { SeasonArchive, SeasonData, LeagueDateIndex, LeagueSeasonMeta, RoundFixtures, LeagueSeasonState, Fixture } from "@/types/calendarTypes";
import type { Squad, StandingRow } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { TrainingIntensity } from "@/types/developmentTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import { DEFAULT_MIN_ENERGY_TO_TRAIN, DEFAULT_TRAINING_INTENSITY } from "@/types/developmentTypes";
import type { StoredDayEvent, StoredDayLog, DayLog, TransferEvent } from "@/types/dayLogTypes";
import type { InboxMessage } from "@/types/inboxTypes";
import { buildSquadIndex, type SquadIndex } from "@/backend/squadIndex";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

// ── SaveMeta: the light metadata stored in {saveId}.json ────────────────────

export interface SaveDatabase {
  id:        string;   // e.g. "official-2024"
  name:      string;   // e.g. "Official 2024/25"
  version:   string;
  startDate: string;   // ISO display date
}

export interface SaveManager {
  name:           string;
  nationalityIso: string;   // e.g. "br", "pt"
  backgroundId:   string;   // e.g. "former-player"
}

export interface SaveMeta {
  id:         string;
  name:       string;
  createdAt:  string;
  updatedAt:  string;
  leagueSlug: string;
  leagueName: string;
  clubId:     string;
  clubName:   string;
  clubColors: [string, string];
  /** Database picked at new-game time — versions/datasets the save was started against. */
  database?: SaveDatabase;
  /** Manager identity picked at new-game time. */
  manager?:  SaveManager;
  formation?: string;
  tactical_style?: TacticalStyle;
  /** Current in-game date "YYYY-MM-DD". Advances as matches are played. */
  currentDate?: string;
  /** Minimum fitness (0–100) for a player to participate in a training day. */
  min_energy_to_train?: number;
  /** Training load for your club's sessions (advance-day simulation). */
  training_intensity?: TrainingIntensity;
  /** State for all active leagues in this save. */
  activeLeagues?: LeagueSeasonState[];
  /** Leagues (besides the player's own) resolved by the full engine. Max 3 — see simMode.ts. */
  followedLeagues?: string[];
}

// ── SaveService ──────────────────────────────────────────────────────────────

export class SaveService {
  constructor(private readonly dal: ISaveDAL = new FileSystemDAL()) {}

  /**
   * Squad index per save, stamped with the save's data version. On FileSystemDAL
   * every write bumps the version, so writes from other instances (a day flush)
   * rebuild it; this instance's own membership-preserving writes re-stamp it
   * (see `saveSquad`), membership changes drop it.
   */
  private readonly squadIndexCache = new Map<string, { version: number; index: SquadIndex }>();

  // ── Meta ───────────────────────────────────────────────────────────────────

  listSaves(): Promise<SaveMeta[]> {
    return this.dal.listSaves();
  }

  getMeta(saveId: string): Promise<SaveMeta | null> {
    return this.dal.readMeta(saveId);
  }

  async updateMeta(
    saveId: string,
    patch: Partial<Omit<SaveMeta, "id" | "createdAt">>,
  ): Promise<SaveMeta> {
    const meta = await this.dal.readMeta(saveId);
    if (!meta) throw new Error(`Save not found: ${saveId}`);
    const updated: SaveMeta = {
      ...meta,
      ...patch,
      id:        meta.id,
      createdAt: meta.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await this.dal.writeMeta(updated);
    return updated;
  }

  deleteSave(saveId: string): Promise<void> {
    return this.dal.deleteSave(saveId);
  }

  // ── Season ─────────────────────────────────────────────────────────────────

  async getSeason(saveId: string): Promise<SeasonData | null> {
    // Try the dedicated season.json first
    const season = await this.dal.readSeason(saveId);
    if (season) return season;

    // Migration: old saves have season embedded in meta.json — extract and promote
    const raw = await this.dal.readMeta(saveId) as unknown as Record<string, unknown>;
    const embedded = raw?.season as SeasonData | undefined;
    if (embedded) {
      await this.dal.writeSeason(saveId, embedded);
      // Strip season from meta so the main file stays light going forward
      const { season: _removed, ...cleanMeta } = raw;
      await this.dal.writeMeta(cleanMeta as unknown as SaveMeta);
      return embedded;
    }
    return null;
  }

  writeSeason(saveId: string, season: SeasonData): Promise<void> {
    return this.dal.writeSeason(saveId, season);
  }

  readSeasonArchive(saveId: string, year: number): Promise<SeasonArchive | null> {
    return this.dal.readSeasonArchive(saveId, year);
  }

  writeSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void> {
    return this.dal.writeSeasonArchive(saveId, archive);
  }

  // ── Tactics ────────────────────────────────────────────────────────────────

  async getTactics(saveId: string): Promise<TacticsSave | null> {
    return this.dal.readTactics(saveId);
  }

  saveTactics(saveId: string, tactics: TacticsSave): Promise<void> {
    return this.dal.writeTactics(saveId, tactics);
  }

  getMarket(saveId: string): Promise<MarketState | null> {
    return this.dal.readMarket(saveId);
  }

  saveMarket(saveId: string, market: MarketState): Promise<void> {
    return this.dal.writeMarket(saveId, market);
  }

  // ── Transfers ──────────────────────────────────────────────────────────────

  getTransfers(saveId: string): Promise<TransferRecord[]> {
    return this.dal.readTransfers(saveId);
  }

  async appendTransfer(saveId: string, record: TransferRecord): Promise<TransferRecord[]> {
    const existing = await this.dal.readTransfers(saveId);
    const updated  = [...existing, record];
    await this.dal.writeTransfers(saveId, updated);
    return updated;
  }

  /** Replace the active transfer log (e.g. clear to `[]` after archiving a season). */
  writeTransfers(saveId: string, transfers: TransferRecord[]): Promise<void> {
    return this.dal.writeTransfers(saveId, transfers);
  }

  readTransfersArchive(saveId: string, year: number): Promise<TransferRecord[] | null> {
    return this.dal.readTransfersArchive(saveId, year);
  }

  writeTransfersArchive(saveId: string, year: number, transfers: TransferRecord[]): Promise<void> {
    return this.dal.writeTransfersArchive(saveId, year, transfers);
  }

  // ── Inbox ──────────────────────────────────────────────────────────────────

  getInbox(saveId: string): Promise<InboxMessage[]> {
    return this.dal.readInbox(saveId);
  }

  appendInbox(saveId: string, message: InboxMessage): Promise<void> {
    return this.dal.appendInboxMessage(saveId, message);
  }

  async markInboxRead(saveId: string, ids: string[]): Promise<InboxMessage[]> {
    const set = new Set(ids);
    const current = await this.dal.readInbox(saveId);
    const updated = current.map((m) => (set.has(m.id) ? { ...m, read: true } : m));
    await this.dal.writeInbox(saveId, updated);
    return updated;
  }

  async markAllInboxRead(saveId: string): Promise<InboxMessage[]> {
    const current = await this.dal.readInbox(saveId);
    const updated = current.map((m) => (m.read ? m : { ...m, read: true }));
    await this.dal.writeInbox(saveId, updated);
    return updated;
  }

  clearInbox(saveId: string): Promise<void> {
    return this.dal.writeInbox(saveId, []);
  }

  // ── Squads ─────────────────────────────────────────────────────────────────

  /**
   * Per-save membership index built from the save's squad files — the folder a
   * squad file lives in is the league it plays in.
   */
  async getSquadIndex(saveId: string): Promise<SquadIndex> {
    const version = getSaveDataVersion(saveId);
    const cached = this.squadIndexCache.get(saveId);
    if (cached && cached.version === version) return cached.index;
    const index = buildSquadIndex(await this.dal.listSquadFiles(saveId));
    this.squadIndexCache.set(saveId, { version, index });
    return index;
  }

  /** Read a squad by league + club param (squadId, file stem or slug). */
  async getSquad(saveId: string, leagueSlug: string, clubParam: string): Promise<Squad | null> {
    const stem = (await this.getSquadIndex(saveId)).resolve(leagueSlug, clubParam);
    if (stem) return this.dal.readSquad(saveId, leagueSlug, stem);
    return this.dal.readSquad(saveId, leagueSlug, clubParam);
  }

  async getSquadById(saveId: string, squadId: string): Promise<Squad | null> {
    const e = (await this.getSquadIndex(saveId)).byId(squadId);
    return e ? this.dal.readSquad(saveId, e.leagueSlug, e.stem) : null;
  }

  /** Write a squad; an existing file is addressed via the index, a new one is stored under `squad.id`. */
  async saveSquad(saveId: string, leagueSlug: string, clubParam: string, squad: Squad): Promise<void> {
    const index = await this.getSquadIndex(saveId);
    const resolved = index.resolve(leagueSlug, clubParam);
    const stem = resolved ?? squad.id;
    const before = getSaveDataVersion(saveId);
    await this.dal.writeSquad(saveId, leagueSlug, stem, squad);
    // Overwriting an indexed file with the same identity keeps the index valid:
    // re-stamp it past our own version bump. Anything else (new file, changed
    // id / slug / name / colors) drops it.
    const e = resolved ? index.byId(squad.id) : undefined;
    const unchanged =
      !!e && e.stem === stem && e.leagueSlug === leagueSlug && e.slug === (squad.slug ?? squad.id) &&
      e.name === squad.name && e.colors[0] === squad.colors?.[0] && e.colors[1] === squad.colors?.[1];
    const cached = this.squadIndexCache.get(saveId);
    const after = getSaveDataVersion(saveId);
    if (unchanged && cached?.index === index && cached.version === before && after - before <= 1) {
      cached.version = after;
    } else {
      this.squadIndexCache.delete(saveId);
    }
  }

  async squadExists(saveId: string, leagueSlug: string, clubParam: string): Promise<boolean> {
    if ((await this.getSquadIndex(saveId)).resolve(leagueSlug, clubParam)) return true;
    return this.dal.squadExists(saveId, leagueSlug, clubParam);
  }

  /** Move a squad file to another league folder (same stem). No-op when already there. */
  async moveSquad(saveId: string, squadId: string, toLeague: string): Promise<void> {
    const e = (await this.getSquadIndex(saveId)).byId(squadId);
    if (!e) throw new Error(`moveSquad: squad ${squadId} not found in save ${saveId}`);
    if (e.leagueSlug === toLeague) return;
    const squad = await this.dal.readSquad(saveId, e.leagueSlug, e.stem);
    if (!squad) throw new Error(`moveSquad: squad file ${e.leagueSlug}/${e.stem} missing in save ${saveId}`);
    this.squadIndexCache.delete(saveId);
    await this.dal.writeSquad(saveId, toLeague, e.stem, { ...squad, leagueSlug: toLeague });
    await this.dal.deleteSquad(saveId, e.leagueSlug, e.stem);
    this.squadIndexCache.delete(saveId);
  }

  getSquadsInLeague(saveId: string, leagueSlug: string): Promise<Squad[]> {
    return this.dal.listSquadsInLeague(saveId, leagueSlug);
  }

  /** Every squad file in the save with the league folder + file stem it is stored under. */
  listSquadFiles(saveId: string): Promise<SquadFile[]> {
    return this.dal.listSquadFiles(saveId);
  }

  getAllSquads(saveId: string): Promise<Squad[]> {
    return this.dal.listAllSquads(saveId);
  }

  /** Resolve a squadId to the league folder + file stem it is stored under. */
  async resolveSquadId(saveId: string, squadId: string): Promise<{ leagueSlug: string; clubSlug: string } | null> {
    const e = (await this.getSquadIndex(saveId)).byId(squadId);
    return e ? { leagueSlug: e.leagueSlug, clubSlug: e.stem } : null;
  }

  // ── Day logs ───────────────────────────────────────────────────────────────

  getDayLog(saveId: string, date: string): Promise<StoredDayLog | null> {
    return this.dal.readDayLog(saveId, date);
  }

  writeDayLog(saveId: string, date: string, log: StoredDayLog): Promise<void> {
    return this.dal.writeDayLog(saveId, date, log);
  }

  async appendDayEvent(saveId: string, date: string, event: StoredDayEvent): Promise<void> {
    const existing = await this.dal.readDayLog(saveId, date);
    const log: StoredDayLog = existing ?? { saveId, date, events: [] };
    log.events.push(event);
    await this.dal.writeDayLog(saveId, date, log);
  }

  /** Read a stored day log and resolve TransferRefs → full TransferEvents. */
  async resolveDayLog(saveId: string, date: string): Promise<DayLog | null> {
    const stored = await this.dal.readDayLog(saveId, date);
    if (!stored) return null;

    const transfers   = await this.dal.readTransfers(saveId);
    const transferMap = new Map(transfers.map((t) => [t.id, t]));

    const events = stored.events
      .map((e): DayLog["events"][number] | null => {
        if (e.kind !== "transfer_ref") return e;
        const rec = transferMap.get(e.transferId);
        if (!rec) return null;
        const te: TransferEvent = {
          kind:        "transfer",
          transferId:  rec.id,
          playerId:    rec.playerId,
          playerName:  rec.playerName,
          fromSquadId: rec.fromSquadId,
          toSquadId:   rec.toSquadId,
          fee:         rec.fee,
          status:      rec.status,
          reason:      rec.reason,
        };
        return te;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    return { saveId, date, events };
  }

  // ── League-level season data ────────────────────────────────────────────────

  getLeagueMeta(saveId: string, leagueSlug: string): Promise<LeagueSeasonMeta | null> {
    return this.dal.readLeagueMeta(saveId, leagueSlug);
  }

  writeLeagueMeta(saveId: string, meta: LeagueSeasonMeta): Promise<void> {
    return this.dal.writeLeagueMeta(saveId, meta);
  }

  getLeagueStandings(saveId: string, leagueSlug: string): Promise<StandingRow[] | null> {
    return this.dal.readLeagueStandings(saveId, leagueSlug);
  }

  writeLeagueStandings(saveId: string, leagueSlug: string, rows: StandingRow[]): Promise<void> {
    return this.dal.writeLeagueStandings(saveId, leagueSlug, rows);
  }

  getRound(saveId: string, leagueSlug: string, round: number): Promise<RoundFixtures | null> {
    return this.dal.readRound(saveId, leagueSlug, round);
  }

  writeRound(saveId: string, leagueSlug: string, round: number, data: RoundFixtures): Promise<void> {
    return this.dal.writeRound(saveId, leagueSlug, round, data);
  }

  getDateIndex(saveId: string, leagueSlug: string): Promise<LeagueDateIndex | null> {
    return this.dal.readDateIndex(saveId, leagueSlug);
  }

  writeDateIndex(saveId: string, leagueSlug: string, index: LeagueDateIndex): Promise<void> {
    return this.dal.writeDateIndex(saveId, leagueSlug, index);
  }

  writeLeagueSeasonArchive(saveId: string, archive: SeasonArchive): Promise<void> {
    return this.dal.writeLeagueSeasonArchive(saveId, archive);
  }

  writeLeagueTransfersArchive(saveId: string, leagueSlug: string, year: number, transfers: TransferRecord[]): Promise<void> {
    return this.dal.writeLeagueTransfersArchive(saveId, leagueSlug, year, transfers);
  }

  /**
   * Find all round numbers active on a given date across all leagues.
   * Returns Map<leagueSlug, roundNumbers[]>.
   * Only reads date-index.json per league (tiny files).
   */
  async getActiveRoundsForDate(saveId: string, date: string): Promise<Map<string, number[]>> {
    const slugs = await this.dal.listActiveLeaguesSlugs(saveId);
    const result = new Map<string, number[]>();
    await Promise.all(
      slugs.map(async (slug) => {
        const index = await this.dal.readDateIndex(saveId, slug);
        const rounds = index?.[date] ?? [];
        if (rounds.length > 0) result.set(slug, rounds);
      }),
    );
    return result;
  }

  /**
   * Get all unplayed fixtures scheduled for today across all leagues.
   * Loads only the specific round files needed (not all fixtures).
   */
  async getFixturesForDate(saveId: string, date: string): Promise<Fixture[]> {
    const activeRounds = await this.getActiveRoundsForDate(saveId, date);
    const result: Fixture[] = [];
    await Promise.all(
      Array.from(activeRounds.entries()).map(async ([slug, rounds]) => {
        const roundData = await Promise.all(rounds.map((r) => this.dal.readRound(saveId, slug, r)));
        for (const rd of roundData) {
          if (rd) result.push(...rd.fixtures.filter((f) => f.date === date && !f.played));
        }
      }),
    );
    return result;
  }

  /**
   * Load all fixtures for one league across all rounds (used for season transition standings).
   */
  async getAllFixturesForLeague(saveId: string, leagueSlug: string): Promise<Fixture[]> {
    const slugs = await this.dal.listActiveLeaguesSlugs(saveId);
    if (!slugs.includes(leagueSlug)) return [];
    const meta = await this.dal.readLeagueMeta(saveId, leagueSlug);
    if (!meta) return [];
    const rounds = await Promise.all(
      Array.from({ length: meta.totalRounds }, (_, i) => this.dal.readRound(saveId, leagueSlug, i + 1)),
    );
    return rounds.flatMap((r) => r?.fixtures ?? []);
  }

  // ── Create save ────────────────────────────────────────────────────────────

  async createSave(body: {
    leagueSlug: string;
    leagueName: string;
    clubId:     string;
    clubName:   string;
    clubColors: [string, string];
    budget:  number;
    formation?:      string;
    tactical_style?: TacticalStyle;
    database?: SaveDatabase;
    manager?:  SaveManager;
  }): Promise<SaveMeta> {
    const id  = randomUUID();
    const now = new Date().toISOString();

    // Generate calendars for ALL configured leagues
    const activeLeagues: LeagueSeasonState[] = [];
    let playerLeagueStart: string | undefined;

    try {
      const leagueFile = Bun.file(`${DATA_DIR}/leagueData.json`);
      const allLeagueData = (await leagueFile.json()) as Array<{
        slug: string;
        name: string;
        season: string;
        standings: Array<{ squadId: string; name?: string; colors?: [string, string]; slug?: string }>;
      }>;

      for (const config of LEAGUE_SCHEDULE_CONFIGS) {
        const leagueEntry = allLeagueData.find((l) => l.slug === config.slug);
        if (!leagueEntry) continue;

        const seasonParts = leagueEntry.season.split("-");
        const year = parseInt(seasonParts[0]!, 10);
        const teamIds = leagueEntry.standings.map((s) => s.squadId);

        const { meta, rounds, dateIndex } = generateLeagueCalendar(config, teamIds, year);

        await this.dal.writeLeagueMeta(id, meta);
        for (const round of rounds) {
          await this.dal.writeRound(id, config.slug, round.round, round);
        }
        await this.dal.writeDateIndex(id, config.slug, dateIndex);

        // Initialize standings with team display info from leagueData
        const emptyStandings: StandingRow[] = leagueEntry.standings.map((t) => ({
          squadId: t.squadId,
          slug: t.slug,
          name: t.name ?? "",
          colors: t.colors ?? ["#888888", "#ffffff"] as [string, string],
          mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [],
        }));
        await this.dal.writeLeagueStandings(id, config.slug, emptyStandings);

        activeLeagues.push({
          leagueSlug:   config.slug,
          leagueName:   leagueEntry.name,
          year:         meta.year,
          start:        meta.start,
          end:          meta.end,
          totalRounds:  meta.totalRounds,
          currentRound: 0,
          restDays:     meta.restDays,
        });

        if (config.slug === body.leagueSlug) {
          playerLeagueStart = meta.start;
        }
      }

      // Fallback: if player's league wasn't in LEAGUE_SCHEDULE_CONFIGS, generate it
      if (!playerLeagueStart) {
        const leagueEntry = allLeagueData.find((l) => l.slug === body.leagueSlug);
        if (leagueEntry) {
          const teamIds = leagueEntry.standings.map((s) => s.squadId);
          const { year, start, end } = parseSeasonDates(leagueEntry.season);
          const { generateCalendar } = await import("@/Domain/season/generateCalendar");
          const calendar = generateCalendar(leagueEntry.slug, teamIds, start, end);
          const season = { year, start, end, calendar, restDays: generateRestDays(calendar) };
          await this.dal.writeSeason(id, season);
          playerLeagueStart = start;
        }
      }
    } catch (e) {
      console.error("Failed to generate league calendars:", e);
    }

    const meta: SaveMeta = {
      id,
      name:        body.clubName ?? "Unnamed Save",
      createdAt:   now,
      updatedAt:   now,
      leagueSlug:  body.leagueSlug,
      leagueName:  body.leagueName,
      clubId:      body.clubId,
      clubName:    body.clubName,
      clubColors:  body.clubColors,
      database:    body.database,
      manager:     body.manager,
      formation:      body.formation      ?? "4-3-3",
      tactical_style: body.tactical_style ?? DEFAULT_TACTICAL_STYLE,
      currentDate: playerLeagueStart,
      min_energy_to_train: DEFAULT_MIN_ENERGY_TO_TRAIN,
      training_intensity: DEFAULT_TRAINING_INTENSITY,
      activeLeagues,
    };

    await this.dal.writeMeta(meta);

    // Copy all squads from global Data/squads/ into the save-local directory
    const squadsRootSrc = `${DATA_DIR}/squads`;
    const leagues = (await readdir(squadsRootSrc, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const squadGlob = new Bun.Glob("*.json");
    let copied = 0;

    for (const league of leagues) {
      const srcDir = `${squadsRootSrc}/${league}`;
      for await (const p of squadGlob.scan(srcDir)) {
        const raw   = (await Bun.file(`${srcDir}/${p}`).json()) as Squad;
        const clubSlug = p.replace(".json", "");

        const isPlayerClub = league === body.leagueSlug && clubSlug === body.clubId;
        const srcFin = raw.finances;
        const budget = isPlayerClub ? (body.budget ?? 0) : (srcFin?.budget ?? 0);

        const squad: Squad = {
          ...raw,
          players: raw.players.map((pl) => ({
            ...pl,
            seasonLog: pl.seasonLog ?? emptySeasonLog(),
          })),
          finances: {
            broadcasting: srcFin?.broadcasting ?? 0,
            commercial:   srcFin?.commercial ?? 0,
            total:        srcFin?.total ?? 0,
            budget,
            followers:    srcFin?.followers ?? 0,
          },
        };

        await this.dal.writeSquad(id, league, clubSlug, squad);
        this.squadIndexCache.delete(id);
        copied++;
      }
    }

    if (copied === 0) throw new Error("no squads found to copy");

    return meta;
  }
}

export const saveService = new SaveService();
