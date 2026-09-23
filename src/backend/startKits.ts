import { fileURLToPath } from "node:url";
import { readdir, stat, mkdir } from "fs/promises";
import { saveService } from "@/backend/SaveService";
import type { Squad, StandingRow } from "@/types/playerTypes";
import type { LeagueSeasonMeta, LeagueDateIndex, RoundFixtures } from "@/types/calendarTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { MarketState } from "@/types/transferMarketTypes";

/**
 * Start kits = pre-computed worlds where the early-starting (European) leagues have
 * been fully simulated up to the playable start date (Brazilian kickoff, 2025-02-05).
 * Running that catch-up live takes minutes; instead we generate a handful of kits
 * offline (see scripts/generateStartKits.ts) and copy one at random into each new
 * save — instant, with variety across playthroughs.
 *
 * Each kit is a single gzipped JSON snapshot of the world (squads + per-league
 * calendars/standings + transfers + market). Player-specific state (meta, tactics,
 * inbox) is NOT in the kit — the new save keeps its own.
 */
const KITS_DIR = fileURLToPath(new URL("../Data/startKits", import.meta.url));

interface KitWorld {
  squads: Array<{ league: string; club: string; squad: Squad }>;
  leagues: Array<{
    slug: string;
    meta: LeagueSeasonMeta | null;
    standings: StandingRow[] | null;
    dateIndex: LeagueDateIndex | null;
    rounds: RoundFixtures[];
  }>;
  transfers: TransferRecord[];
  market: MarketState | null;
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

function kitPath(name: string): string {
  return `${KITS_DIR}/${name}.json.gz`;
}

/** List available kit names (e.g. ["kit-1", "kit-2", ...]). */
export async function listStartKits(): Promise<string[]> {
  if (!(await exists(KITS_DIR))) return [];
  const entries = await readdir(KITS_DIR);
  return entries
    .filter((e) => e.startsWith("kit-") && e.endsWith(".json.gz"))
    .map((e) => e.slice(0, -".json.gz".length));
}

/** Read a save's full world into a serialisable snapshot. */
async function buildKitWorld(saveId: string): Promise<KitWorld> {
  const meta = await saveService.getMeta(saveId);
  const leagueSlugs = (meta?.activeLeagues ?? []).map((l) => l.leagueSlug);

  const allSquads = await saveService.getAllSquads(saveId);
  const squads = allSquads
    .filter((s) => s.leagueSlug && s.slug)
    .map((s) => ({ league: s.leagueSlug!, club: s.slug!, squad: s }));

  const leagues: KitWorld["leagues"] = [];
  for (const slug of leagueSlugs) {
    const lMeta = await saveService.getLeagueMeta(saveId, slug);
    const totalRounds = lMeta?.totalRounds ?? 0;
    const rounds: RoundFixtures[] = [];
    for (let r = 1; r <= totalRounds; r++) {
      const rd = await saveService.getRound(saveId, slug, r);
      if (rd) rounds.push(rd);
    }
    leagues.push({
      slug,
      meta: lMeta,
      standings: await saveService.getLeagueStandings(saveId, slug),
      dateIndex: await saveService.getDateIndex(saveId, slug),
      rounds,
    });
  }

  return {
    squads,
    leagues,
    transfers: await saveService.getTransfers(saveId),
    market: await saveService.getMarket(saveId),
  };
}

/** Write a save's world to a gzipped kit file. Used by the offline generator. */
export async function snapshotSaveToKit(saveId: string, kitName: string): Promise<void> {
  const world = await buildKitWorld(saveId);
  await mkdir(KITS_DIR, { recursive: true });
  const gz = Bun.gzipSync(new TextEncoder().encode(JSON.stringify(world)));
  await Bun.write(kitPath(kitName), gz);
}

/** Write a kit world's contents into a save (overwriting the fresh ones). */
export async function applyKit(kitName: string, saveId: string): Promise<void> {
  const buf = new Uint8Array(await Bun.file(kitPath(kitName)).arrayBuffer());
  const world = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(buf))) as KitWorld;

  for (const { league, club, squad } of world.squads) {
    await saveService.saveSquad(saveId, league, club, squad);
  }
  for (const lg of world.leagues) {
    if (lg.meta) await saveService.writeLeagueMeta(saveId, lg.meta);
    if (lg.standings) await saveService.writeLeagueStandings(saveId, lg.slug, lg.standings);
    if (lg.dateIndex) await saveService.writeDateIndex(saveId, lg.slug, lg.dateIndex);
    for (const rd of lg.rounds) await saveService.writeRound(saveId, lg.slug, rd.round, rd);
  }
  await saveService.writeTransfers(saveId, world.transfers);
  if (world.market) await saveService.saveMarket(saveId, world.market);
}

/**
 * Apply a random start kit to a freshly created save, if one is needed and available.
 *
 * Needed only when the save's start date is later than the world's earliest league
 * start (Brazilian careers). Earliest-date (European) careers begin at genesis with a
 * fresh world and need no kit. Never throws fatally — a missing kit just means the
 * world starts empty and fills as days advance.
 */
export async function applyRandomStartKit(
  saveId: string,
): Promise<{ applied: boolean; kit?: string; reason?: string }> {
  const meta = await saveService.getMeta(saveId);
  if (!meta?.currentDate) return { applied: false, reason: "no meta" };

  const activeLeagues = meta.activeLeagues ?? [];
  const playerStart = meta.currentDate;
  const worldStart = activeLeagues.reduce(
    (earliest, l) => (l.start < earliest ? l.start : earliest),
    playerStart,
  );
  if (worldStart >= playerStart) return { applied: false, reason: "no catch-up needed" };

  const kits = await listStartKits();
  if (kits.length === 0) return { applied: false, reason: "no kits generated" };

  const kit = kits[Math.floor(Math.random() * kits.length)]!;
  await applyKit(kit, saveId);
  return { applied: true, kit };
}
