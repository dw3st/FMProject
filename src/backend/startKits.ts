import { initClubMorale, stripClubMorale } from "@/Domain/morale/morale";
import { fileURLToPath } from "node:url";
import { readdir, stat, mkdir } from "fs/promises";
import { saveService } from "@/backend/SaveService";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { defaultSeasonEnd, withContracts } from "@/Domain/contracts/contracts";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import { emptySeatMarket, joinMarket, splitMarket } from "@/Domain/market/seatMarket";
import type { Squad, StandingRow } from "@/types/playerTypes";
import type { LeagueSeasonMeta, LeagueDateIndex, RoundFixtures } from "@/types/calendarTypes";
import type { TransferRecord } from "@/types/transferTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import type { NationalCompetition, NationalState } from "@/types/nationalTypes";

/**
 * Start kits = pre-computed worlds where the early-starting (European) leagues have
 * been fully simulated up to the playable start date (Brazilian kickoff, 2027-02-05).
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
  /** National teams (`.claude/rules/game/national-teams.md`): state and every competition. */
  national?: { state: NationalState; comps: NationalCompetition[] } | null;
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

/**
 * Drops the human-club-only fields (`staff`, `styleFamiliarity`, `facilities`): a kit is a player-less world, so
 * the club the generator played as must not carry them into the next careers. `applyRandomStartKit`
 * restores the new career's own values afterwards.
 */
export function stripHumanOnly(squad: Squad): Squad {
  // Morale too (`.claude/rules/game/morale.md`): the kit carries no club's morale.
  const hasMorale = !!squad.moraleClub || squad.players.some((p) => p.morale !== undefined || p.moraleLog || p.squadStatus);
  if (!squad.staff && !squad.styleFamiliarity && !squad.facilities && !squad.managerAttributes && !hasMorale) return squad;
  const { staff: _staff, styleFamiliarity: _fam, facilities: _fac, managerAttributes: _attrs, ...rest } = squad;
  return hasMorale ? stripClubMorale(rest) : rest;
}

/** Read a save's full world into a serialisable snapshot. */
async function buildKitWorld(saveId: string): Promise<KitWorld> {
  const meta = await saveService.getWorldMeta(saveId);
  // Leagues from activeLeagues + every cup, continental and youth folder (none is a league state).
  const knockoutSlugs = (await saveService.listCompetitionSlugs(saveId)).filter(
    (s) => isCupSlug(s) || isContinentalSlug(s) || isYouthCompSlug(s),
  );
  const leagueSlugs = [...(meta?.activeLeagues ?? []).map((l) => l.leagueSlug), ...knockoutSlugs];

  // Address each squad by its real file (league folder + stem), not by slug.
  const squads = (await saveService.listSquadFiles(saveId)).map((f) => ({
    league: f.leagueSlug,
    club: f.clubSlug,
    squad: stripHumanOnly(f.squad),
  }));

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

  const nState = await saveService.getNationalState(saveId);
  const nComps: NationalCompetition[] = [];
  for (const slug of nState?.competitions ?? []) {
    const c = await saveService.getNationalComp(saveId, slug);
    if (c) nComps.push(c);
  }
  return {
    squads,
    leagues,
    transfers: await saveService.getTransfers(saveId),
    // Only the world's part (AI rotation and profiles): a kit carries no seat.
    market: joinMarket(await saveService.getWorldMarket(saveId), emptySeatMarket()),
    national: nState ? { state: nState, comps: nComps } : null,
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

  // The fresh save's wage factors (`.claude/rules/AI-clubs/finance.md` → wages) were just
  // computed by createSave from the REAL world's revenue/roster at the real league size. The
  // kit's squads predate that — snapshotted kits carry no `wageFactor`/`wageRevenueBasis` at all
  // (regenerated in Task 9) — so read the fresh values before the kit overwrites the squads
  // below, keyed by squad id, and carry them forward instead of letting the kit fall back to an
  // on-the-fly factor recomputed from the roster every call (signings would never move the bill).
  // Both fields travel together — a factor without its matching basis breaks the next season
  // rollover's carry-forward (`carryForwardWageFactor`).
  const freshWage = new Map<string, { wageFactor: number; wageRevenueBasis?: number }>();
  for (const f of await saveService.listSquadFiles(saveId)) {
    if (typeof f.squad.wageFactor === "number") {
      freshWage.set(f.squad.id, { wageFactor: f.squad.wageFactor, wageRevenueBasis: f.squad.wageRevenueBasis });
    }
  }

  // Kit squads predate contracts: give every player without one a contract ending on his
  // league's current season end (the fresh save's `activeLeagues`).
  const kitMeta = await saveService.getWorldMeta(saveId);
  const leagueEnds = new Map((kitMeta?.activeLeagues ?? []).map((l) => [l.leagueSlug, l.end] as const));
  const fallbackEnd = defaultSeasonEnd(kitMeta?.currentDate ?? "2026-08-01");

  for (const { league, club, squad } of world.squads) {
    // The kit's folder is the club's league in that world: if the fresh save holds
    // the club elsewhere, move it first so the write never leaves a duplicate.
    const e = (await saveService.getSquadIndex(saveId)).byId(squad.id);
    if (e && e.leagueSlug !== league) await saveService.moveSquad(saveId, squad.id, league);
    const wage = freshWage.get(squad.id);
    // Older kits may still carry the generator's human-only fields: strip them here too.
    const clean = stripHumanOnly(squad);
    const withWage = wage !== undefined ? { ...clean, ...wage } : clean;
    const toWrite = withContracts(withWage, leagueEnds.get(league) ?? fallbackEnd);
    // `club` is the file stem (older kits stored the slug; saveSquad resolves either).
    await saveService.saveSquad(saveId, league, club, toWrite);
  }
  for (const lg of world.leagues) {
    if (lg.meta) await saveService.writeLeagueMeta(saveId, lg.meta);
    if (lg.standings) await saveService.writeLeagueStandings(saveId, lg.slug, lg.standings);
    if (lg.dateIndex) await saveService.writeDateIndex(saveId, lg.slug, lg.dateIndex);
    for (const rd of lg.rounds) await saveService.writeRound(saveId, lg.slug, rd.round, rd);
  }
  await saveService.writeTransfers(saveId, world.transfers);
  if (world.market) await saveService.saveWorldMarket(saveId, splitMarket(world.market).world);
  if (world.national) {
    // The kit's coaches are not in this save's managers.json (the kit never carries it): every national team
    // goes back to the coach this save created for it, and no vacancy is carried over.
    const managers = await saveService.getManagers(saveId);
    const coachOf = new Map(managers.filter((m) => m.squadId.startsWith("nat_")).map((m) => [m.squadId, m.id]));
    const teams = Object.fromEntries(Object.entries(world.national.state.teams).map(([id, t]) => [id, { ...t, managerId: coachOf.get(id) ?? t.managerId }]));
    for (const c of world.national.comps) await saveService.writeNationalComp(saveId, c);
    await saveService.writeNationalState(saveId, { ...world.national.state, teams, vacancies: {} });
  }
}

/**
 * Apply a random start kit to a freshly created save, if one is needed and available.
 *
 * Needed only when the save's start date is later than the world's earliest league
 * start (Brazilian careers). Earliest-date (European) careers begin at genesis with a
 * fresh world and need no kit. Never throws fatally — a missing kit just means the
 * world starts empty and fills as days advance.
 *
 * The kit is a generic world snapshot with no player concept (see the `KitWorld` comment above):
 * every club in it, including the one about to become the player's, sits at whatever
 * `finances.budget` it had when the kit was generated — never touched by the ledger. Applying it
 * verbatim would overwrite the real save's own ledger-tracked budget (`createSave` +
 * `applyBroadcasting`, already recorded in `saves/{id}/ledger/`) with that stale figure. We
 * capture the player's budget right before the kit write and restore it right after, so
 * sum(ledger) == budget keeps holding for a kit (Brazilian-timeline) career exactly as it already
 * does for a no-kit (European-timeline) one — see `.claude/rules/game/finances.md`.
 */
export async function applyRandomStartKit(
  saveId: string,
): Promise<{ applied: boolean; kit?: string; reason?: string }> {
  const meta = await saveService.getWorldMeta(saveId);
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

  // Every seat's club (`.claude/rules/game/multiplayer.md`): the kit is a player-less snapshot, so each human
  // club's own budget (ledger-tracked), staff, style familiarity and facilities (set up by `createSave` /
  // `addSeat`) are put back after it is applied, and its morale starts again at 65.
  const preKit: { clubId: string; squad: Squad }[] = [];
  for (const { seat } of await saveService.listSeats(saveId)) {
    if (!seat.clubId || seat.unemployed) continue;
    const squad = await saveService.getSquadById(saveId, seat.clubId);
    if (squad) preKit.push({ clubId: seat.clubId, squad });
  }

  const kit = kits[Math.floor(Math.random() * kits.length)]!;
  await applyKit(kit, saveId);

  for (const { clubId, squad: preKitSquad } of preKit) {
    const preKitBudget = preKitSquad.finances?.budget;
    if (preKitBudget === undefined) continue;
    const index = await saveService.getSquadIndex(saveId);
    const entry = index.byId(clubId);
    const postKitSquad = entry ? await saveService.getSquad(saveId, entry.leagueSlug, entry.stem) : null;
    if (entry && postKitSquad?.finances) {
      await saveService.saveSquad(saveId, entry.leagueSlug, entry.stem, {
        ...postKitSquad,
        finances: { ...postKitSquad.finances, budget: preKitBudget },
        ...(preKitSquad.staff ? { staff: preKitSquad.staff } : {}),
        ...(preKitSquad.styleFamiliarity ? { styleFamiliarity: preKitSquad.styleFamiliarity } : {}),
        ...(preKitSquad.facilities ? { facilities: preKitSquad.facilities } : {}),
        // The kit's players carry no morale: start the human club's at 65 again.
        ...(preKitSquad.moraleClub ? { players: initClubMorale(postKitSquad).players, moraleClub: initClubMorale(postKitSquad).moraleClub } : {}),
      });
    }
  }

  // The kit rewrites the league calendars: each seat's seeded rest days follow its league's.
  for (const { seatId, seat } of await saveService.listSeats(saveId)) {
    if (!seat.leagueSlug) continue;
    const restDays = (await saveService.getLeagueMeta(saveId, seat.leagueSlug))?.restDays ?? [];
    await saveService.updateSeat(saveId, seatId, { restDays });
  }

  return { applied: true, kit };
}
