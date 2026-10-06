import type { SaveMeta, SaveService } from "@/backend/SaveService";
import { SCOUTING as S } from "@/Domain/scouting/scoutingConfig";
import {
  gainKnowledge, implicitKnowledge, knowledgeOf, pruneKnowledge, scoutMultipliersOf, uncertaintyOf,
} from "@/Domain/scouting/knowledge";
import {
  addProspects, advanceScoutingWeek, buildReport, generateProspects, missionCost, missionPool, monthlyRecommendations,
  prospectFee, pruneProspects, shortlistAlerts, starterLineAverages,
  type MissionWeekInput, type PoolEntry, type ScoutingNews, type TravelDistance, type ViewerContext,
} from "@/Domain/scouting/missions";
import { newsToMessageArgs, type ScoutingMessageArgs } from "@/Domain/scouting/scoutingMessages";
import { effectiveRating, obscureForViewer } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import { wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import { naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import { computeOverallAvg } from "@/Domain/playerRating";
import { addDays, daysBetween } from "@/Domain/dates";
import type { LedgerEntry } from "@/Domain/finance/ledger";
import type { FinancialTier, RosterPlayer, Squad } from "@/types/playerTypes";
import type { MatchEvent } from "@/types/dayLogTypes";
import type { MarketState } from "@/types/transferMarketTypes";
import type {
  KnowledgeEntry, ScoutAssignment, ScoutView, ScoutingState, ShortlistEntry, ShortlistStatus,
} from "@/types/scoutingTypes";
import countriesRaw from "@/Data/countries.json";

/**
 * Scouting I/O (`.claude/rules/game/scouting.md`): what the user sees of other clubs' players
 * (`loadViewer` / `obscureSquadForViewer`), the daily step of the day advance (`scoutingDay`) and
 * the club-switch hooks. The AI and the engine never call any of this.
 */

const COUNTRIES = countriesRaw as Record<string, { name: string; continent?: string }>;
export const continentOf = (country: string): string | undefined => COUNTRIES[country]?.continent;

async function catalog() {
  // Dynamic import: advanceDay imports this module.
  const { getLeagueData, getPyramids } = await import("@/backend/advanceDay");
  return { leagues: await getLeagueData(), pyramids: await getPyramids() };
}

async function leagueCountries(): Promise<Map<string, string>> {
  const { leagues } = await catalog();
  return new Map(leagues.filter((l) => l.country).map((l) => [l.slug, l.country!]));
}

// ── Viewer: knowledge per player for the screens ─────────────────────────────

export interface Viewer {
  saveId: string;
  date: string;
  ownClubId: string;
  ownLeague: string;
  ownCountry: string;
  leagueCountry: Map<string, string>;
  famous: Set<string>;
  knowledge: Record<string, KnowledgeEntry>;
  uncertaintyMult: number;
}

/** Top `FAMOUS_COUNT` of the world by overall (public fame), cached per save and day. */
const famousCache = new Map<string, { key: string; ids: Set<string> }>();

function famousIdsOf(squads: Squad[]): Set<string> {
  const all = squads.flatMap((s) => s.players).map((p) => ({ id: p.id, ov: p.overallAvg ?? computeOverallAvg(p) }));
  all.sort((a, b) => b.ov - a.ov || (a.id < b.id ? -1 : 1));
  return new Set(all.slice(0, S.FAMOUS_COUNT).map((x) => x.id));
}

/** In-flight scans keyed by `saveId#date`, so concurrent screens share one `getAllSquads`. */
const famousInFlight = new Map<string, Promise<Set<string>>>();

async function famousIds(service: SaveService, saveId: string, date: string, squads?: Squad[]): Promise<Set<string>> {
  const hit = famousCache.get(saveId);
  if (hit && hit.key === date) return hit.ids;
  const flightKey = `${saveId}#${date}`;
  const pending = squads ? undefined : famousInFlight.get(flightKey);
  if (pending) return pending;
  const build = (async () => {
    const ids = famousIdsOf(squads ?? (await service.getAllSquads(saveId)));
    famousCache.set(saveId, { key: date, ids });
    if (famousCache.size > 4) famousCache.delete(famousCache.keys().next().value!);
    return ids;
  })();
  if (!squads) {
    famousInFlight.set(flightKey, build);
    build.finally(() => famousInFlight.delete(flightKey)).catch(() => {});
  }
  return build;
}

/** The human manager's view: own club, league and country, stored knowledge and the chief's multiplier. */
export async function loadViewer(service: SaveService, saveId: string, opts: { squads?: Squad[] } = {}): Promise<Viewer | null> {
  const meta = await service.getMeta(saveId);
  if (!meta) return null;
  const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
  const leagueCountry = await leagueCountries();
  const own = meta.clubId ? (opts.squads?.find((s) => s.id === meta.clubId) ?? (await service.getSquadById(saveId, meta.clubId))) : null;
  const chief = own ? effectiveRating(own, "scout") : STAFF.VACANT_RATING;
  const state = await service.getScouting(saveId);
  return {
    saveId, date,
    ownClubId: meta.clubId ?? "",
    ownLeague: meta.leagueSlug ?? "",
    ownCountry: leagueCountry.get(meta.leagueSlug ?? "") ?? "",
    leagueCountry,
    famous: await famousIds(service, saveId, date, opts.squads),
    knowledge: state.knowledge,
    uncertaintyMult: scoutMultipliersOf(chief).uncertainty,
  };
}

/** Effective knowledge of `player` (at a club of `leagueSlug`, "" for a free agent). */
function viewerKnowledge(viewer: Viewer, player: RosterPlayer, leagueSlug: string): number {
  const own = !!viewer.ownClubId && (player.squadId === viewer.ownClubId || player.loan?.fromClubId === viewer.ownClubId);
  const implicit = implicitKnowledge({
    playerLeague: leagueSlug, playerCountry: viewer.leagueCountry.get(leagueSlug),
    ownLeague: viewer.ownLeague, ownCountry: viewer.ownCountry, famous: viewer.famous.has(player.id),
  });
  return knowledgeOf({ own, implicit, stored: viewer.knowledge[player.id], date: viewer.date });
}

export function viewFor(viewer: Viewer, player: RosterPlayer, leagueSlug: string): ScoutView {
  const k = viewerKnowledge(viewer, player, leagueSlug);
  const seen = viewer.knowledge[player.id]?.seen;
  return { knowledge: k, noise: uncertaintyOf(k, viewer.uncertaintyMult), ...(seen ? { seen } : {}) };
}

/** A club's players as the user sees them; his own club is exact. */
export function obscureSquadForViewer(viewer: Viewer, squad: Squad): Squad {
  if (squad.id === viewer.ownClubId) return squad;
  const league = squad.leagueSlug ?? "";
  const factor = wageFactorOf(squad);
  return { ...squad, players: squad.players.map((p) => obscureForViewer(p, viewFor(viewer, p, league), viewer.saveId, factor)) };
}

export function obscurePlayerForViewer(viewer: Viewer, player: RosterPlayer, leagueSlug: string): RosterPlayer {
  return obscureForViewer(player, viewFor(viewer, player, leagueSlug), viewer.saveId);
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Players who leave the human club (sale, loan, release) stay fully known (decaying as usual). */
export async function rememberPlayers(service: SaveService, saveId: string, playerIds: string[], date: string): Promise<void> {
  if (playerIds.length === 0) return;
  const state = await service.getScouting(saveId);
  const knowledge = { ...state.knowledge };
  for (const id of playerIds) knowledge[id] = { k: 100, seen: date };
  await service.writeScouting(saveId, { ...state, knowledge });
}

/**
 * The manager leaves a club (switch or sacking): missions are cancelled and the prospects stay with
 * the club (the field scouts go with its staff); knowledge and shortlist follow the manager, and he
 * keeps knowing his old players.
 */
export async function scoutingOnClubLeft(service: SaveService, saveId: string, playerIds: string[], date: string): Promise<void> {
  const state = await service.getScouting(saveId);
  const knowledge = { ...state.knowledge };
  for (const id of playerIds) knowledge[id] = { k: 100, seen: date };
  await service.writeScouting(saveId, { ...state, knowledge, missions: [], prospects: [] });
}

// ── Pools ────────────────────────────────────────────────────────────────────

function sellListed(market: MarketState | null): Set<string> {
  const ids = new Set<string>();
  if (!market) return ids;
  for (const p of Object.values(market.profiles ?? {})) for (const c of p.sellList ?? []) ids.add(c.playerId);
  for (const c of market.playerSellList ?? []) ids.add(c.playerId);
  return ids;
}

/** Leagues a region mission observes. */
export async function missionLeagues(service: SaveService, saveId: string, mission: Pick<ScoutAssignment, "target">): Promise<string[]> {
  const { leagues, pyramids } = await catalog();
  const present = new Set((await service.getSquadIndex(saveId)).leagues());
  const t = mission.target;
  if (t.kind === "league") return t.league && present.has(t.league) ? [t.league] : [];
  if (t.kind === "country" || t.kind === "youth") {
    return leagues.filter((l) => l.country === t.country && present.has(l.slug)).map((l) => l.slug);
  }
  if (t.kind === "continent") {
    const countries = [...new Set(leagues.filter((l) => l.country && continentOf(l.country) === t.continent).map((l) => l.country!))];
    const { topLeagueOf } = await import("@/backend/continentalWorld");
    return countries.map((c) => topLeagueOf(c, leagues, pyramids)).filter((s): s is string => !!s && present.has(s));
  }
  return [];
}

/** Where a mission's target is, seen from the human club (travel cost). */
export async function missionDistance(service: SaveService, saveId: string, mission: Pick<ScoutAssignment, "target">, ownCountry: string): Promise<TravelDistance> {
  const t = mission.target;
  const lc = await leagueCountries();
  let country: string | undefined;
  let continent: string | undefined;
  if (t.kind === "country" || t.kind === "youth") country = t.country;
  else if (t.kind === "league") country = lc.get(t.league ?? "");
  else if (t.kind === "continent") continent = t.continent;
  else if (t.kind === "player" && t.squadId) country = lc.get((await service.getSquadIndex(saveId)).byId(t.squadId)?.leagueSlug ?? "");
  if (country && country === ownCountry) return "country";
  const ownContinent = continentOf(ownCountry);
  if ((continent ?? (country ? continentOf(country) : undefined)) === ownContinent && ownContinent) return "continent";
  return "world";
}

/** Locates a player anywhere in the save (his last known club first). */
async function locatePlayer(
  service: SaveService, saveId: string, playerId: string, squadId: string, all: () => Promise<Squad[]>,
): Promise<{ player: RosterPlayer; squad: Squad | null } | null> {
  if (squadId) {
    const sq = await service.getSquadById(saveId, squadId);
    const p = sq?.players.find((x) => x.id === playerId);
    if (sq && p) return { player: p, squad: sq };
  }
  const free = (await service.getFreeAgents(saveId)).find((f) => f.player.id === playerId);
  if (free) return { player: free.player, squad: null };
  for (const sq of await all()) {
    const p = sq.players.find((x) => x.id === playerId);
    if (p) return { player: p, squad: sq };
  }
  return null;
}

// ── Daily step ───────────────────────────────────────────────────────────────

export interface ScoutingDayResult {
  entries: LedgerEntry[];
  messages: ScoutingMessageArgs[];
}

const isMonday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() === 1;

export function ownSideOpponents(events: MatchEvent[], ownClubId: string): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.home !== ownClubId && e.away !== ownClubId) continue;
    const ownSide = e.home === ownClubId ? "home" : "away";
    // `playerTeams` maps both whole squads; only who took the pitch (stats / rating) is noticed.
    const played = new Set([...Object.keys(e.playerStats ?? {}), ...Object.keys(e.playerRatings ?? {})]);
    for (const [id, side] of Object.entries(e.playerTeams ?? {})) if (side !== ownSide && played.has(id)) out.push(id);
  }
  return out;
}

/** The financial tier of a country's top league (its clubs' median natural tier). */
function countryTier(squads: Squad[]): FinancialTier {
  const order: FinancialTier[] = ["LOW", "MEDIUM", "HIGH", "ELITE"];
  const ranks = squads.map((s) => order.indexOf(naturalFinancialTier(s.finances))).sort((a, b) => a - b);
  return order[ranks[Math.floor(ranks.length / 2)] ?? 1] ?? "MEDIUM";
}

/**
 * The day advance's scouting step (human manager only). Every day: +8 knowledge for the opponents
 * who played the human club. Mondays: missions work (`advanceScoutingWeek`), youth missions find
 * prospects, the shortlist is checked (+3, alerts), travel is charged. The 1st of the month: the
 * chief's recommendations. Returns the ledger lines (Monday) and the inbox messages (deferred by the
 * caller past `clearInbox`).
 */
export async function scoutingDay(
  service: SaveService, saveId: string,
  args: { date: string; meta: SaveMeta; matchEvents: MatchEvent[]; nextSeasonEnd?: string },
): Promise<ScoutingDayResult> {
  const { date, meta } = args;
  const ownClubId = meta.clubId ?? "";
  const monday = isMonday(date);
  const firstOfMonth = date.endsWith("-01");
  const opponents = ownClubId ? ownSideOpponents(args.matchEvents, ownClubId) : [];
  const result: ScoutingDayResult = { entries: [], messages: [] };
  if (!monday && !firstOfMonth && opponents.length === 0) return result;

  let state: ScoutingState = await service.getScouting(saveId);
  const original = state;
  const lc = await leagueCountries();
  const index = await service.getSquadIndex(saveId);
  const ownLeague = meta.leagueSlug ?? "";
  const ownCountry = lc.get(ownLeague) ?? "";
  const implicitOf = (playerId: string, squadId: string) =>
    implicitKnowledge({ playerLeague: index.byId(squadId)?.leagueSlug, playerCountry: lc.get(index.byId(squadId)?.leagueSlug ?? ""), ownLeague, ownCountry });
  // Effective knowledge of a player at a club (no fame here: fame only sets a floor on the screens).
  const effective = (playerId: string, squadId: string) =>
    knowledgeOf({ implicit: implicitOf(playerId, squadId), stored: state.knowledge[playerId], date });

  // Opponents of today's matches.
  if (opponents.length > 0) {
    const knowledge = { ...state.knowledge };
    const event = args.matchEvents.find((e) => e.home === ownClubId || e.away === ownClubId)!;
    const oppClub = event.home === ownClubId ? event.away : event.home;
    for (const id of opponents) knowledge[id] = gainKnowledge(effective(id, oppClub), S.MATCH_GAIN, date);
    state = { ...state, knowledge };
  }

  const own = ownClubId ? await service.getSquadById(saveId, ownClubId) : null;
  const chiefRating = own ? effectiveRating(own, "scout") : STAFF.VACANT_RATING;
  const chief = scoutMultipliersOf(chiefRating);
  const market = monday || firstOfMonth ? await service.getMarket(saveId) : null;
  const forSale = sellListed(market);
  let allSquads: Squad[] | null = null;
  const all = async () => (allSquads ??= await service.getAllSquads(saveId));
  // Implicit knowledge of every player met in a pool (league / country of his club).
  const implicitById = new Map<string, number>();
  const ctxFor = (s: ScoutingState): ViewerContext | null => own ? {
    saveId, date, ownCountry,
    lineAverages: starterLineAverages(own),
    ownWageFactor: wageFactorOf(own),
    chief,
    knowledgeOf: (id) => knowledgeOf({ implicit: implicitById.get(id) ?? 0, stored: s.knowledge[id], date }),
  } : null;

  if (monday) {
    state = pruneProspects(state, date);
    const ctx = ctxFor(state);
    if (own && ctx && state.missions.length > 0) {
      const scouts = new Map((own.staff?.scouts ?? []).map((s) => [s.id, s.rating]));
      const inputs: MissionWeekInput[] = [];
      const youthMissions: { mission: ScoutAssignment; rating: number }[] = [];
      const revenue = wageRevenueBasisOf(own);
      for (const mission of state.missions) {
        if (mission.start >= date) continue;
        const rating = mission.scoutId === "chief" ? chiefRating : scouts.get(mission.scoutId);
        if (rating === undefined) continue;
        let pool: PoolEntry[] = [];
        if (mission.target.kind === "player") {
          const found = await locatePlayer(service, saveId, mission.target.playerId ?? "", mission.target.squadId ?? "", all);
          if (found && found.squad?.id !== ownClubId) {
            const league = found.squad?.leagueSlug ?? index.byId(found.squad?.id ?? "")?.leagueSlug ?? "";
            implicitById.set(found.player.id, implicitOf(found.player.id, found.squad?.id ?? ""));
            pool = [{ player: found.player, squadId: found.squad?.id ?? "", club: found.squad?.name ?? "", league, country: lc.get(league) ?? "", forSale: forSale.has(found.player.id) }];
          }
        } else {
          for (const league of await missionLeagues(service, saveId, mission)) {
            for (const sq of await service.getSquadsInLeague(saveId, league)) {
              if (sq.id === ownClubId) continue;
              for (const p of sq.players) implicitById.set(p.id, implicitOf(p.id, sq.id));
              for (const p of sq.players) pool.push({ player: p, squadId: sq.id, club: sq.name, league, country: lc.get(league) ?? "", forSale: forSale.has(p.id) });
            }
          }
          pool = missionPool(mission.target.kind, mission.focus, pool, ctxFor(state)!);
          if (mission.target.kind === "youth") youthMissions.push({ mission, rating });
        }
        inputs.push({ mission, leaderRating: rating, pool });
        // A player mission whose target vanished (or joined the club) just ends: no trip to pay.
        if (mission.target.kind === "player" && pool.length === 0) continue;
        const cost = missionCost(mission.target.kind, await missionDistance(service, saveId, mission, ownCountry), revenue);
        if (cost > 0) {
          result.entries.push({
            date, kind: "scouting", amount: -cost, label: "Scouting travel",
            ref: { competition: mission.target.country ?? mission.target.league ?? mission.target.continent ?? "", ...(mission.target.playerName ? { playerName: mission.target.playerName } : {}) },
          });
        }
      }
      const week = advanceScoutingWeek(state, inputs, ctxFor(state)!);
      state = week.state;
      let news: ScoutingNews[] = week.news;
      for (const { mission, rating } of youthMissions) {
        const country = mission.target.country ?? "";
        const { leagues, pyramids } = await catalog();
        const { topLeagueOf } = await import("@/backend/continentalWorld");
        const top = topLeagueOf(country, leagues, pyramids);
        const topSquads = top ? await service.getSquadsInLeague(saveId, top) : [];
        const prospects = generateProspects({
          saveId, country, week: date, topLeagueSquads: topSquads,
          nextSeasonEnd: args.nextSeasonEnd ?? addDays(date, 365),
          fee: prospectFee(countryTier(topSquads), wageFactorOf(own)),
        });
        const added = addProspects(state, prospects, ctxFor(state)!, { missionId: mission.id, leaderRating: rating });
        state = added.state;
        news = [...news, ...added.news];
      }
      result.messages.push(...news.map((n) => newsToMessageArgs(date, n)));
    }

    // Shortlist: +3 knowledge, alerts on what changed since last Monday.
    if (state.shortlist.length > 0) {
      const retired = new Set((await service.getRetired(saveId)).map((r) => r.id));
      const knowledge = { ...state.knowledge };
      const shortlist: ShortlistEntry[] = [];
      for (const e of state.shortlist) {
        if (retired.has(e.playerId)) {
          result.messages.push({ date, kind: "shortlist", reason: "retired", playerId: e.playerId, playerName: e.name });
          delete knowledge[e.playerId];
          continue;
        }
        const found = await locatePlayer(service, saveId, e.playerId, e.squadId, all);
        if (!found) {
          // Left the world without a retirement record (a free agent pruned after a season): he
          // leaves the list too, or every Monday would scan all the squads looking for him.
          result.messages.push({ date, kind: "shortlist", reason: "retired", playerId: e.playerId, playerName: e.name });
          delete knowledge[e.playerId];
          continue;
        }
        const now: ShortlistStatus = {
          squadId: found.squad?.id ?? "",
          forSale: forSale.has(e.playerId),
          loanListed: (market?.playerLoanList ?? []).includes(e.playerId),
          contractEnding: !!found.player.contract && daysBetween(date, found.player.contract.until) <= S.CONTRACT_ENDING_DAYS,
          free: !found.squad,
        };
        for (const reason of shortlistAlerts(e.status, now)) {
          result.messages.push({ date, kind: "shortlist", reason, playerId: e.playerId, playerName: e.name, ...(found.squad ? { clubName: found.squad.name } : {}) });
        }
        if (found.squad?.id !== ownClubId) knowledge[e.playerId] = gainKnowledge(effective(e.playerId, now.squadId), S.SHORTLIST_GAIN, date);
        shortlist.push({ ...e, squadId: now.squadId, status: now });
      }
      state = { ...state, knowledge, shortlist };
    }
    state = { ...state, knowledge: pruneKnowledge(state.knowledge, date) };
  }

  // The chief's monthly picks: gems, then A grades, among reports and the own league.
  if (firstOfMonth && own) {
    const month = date.slice(0, 7);
    if (state.lastRecommendation?.month !== month) {
      const ctx = ctxFor(state)!;
      const candidates = state.reports.filter((r) => daysBetween(r.date, date) <= 120);
      for (const sq of ownLeague ? await service.getSquadsInLeague(saveId, ownLeague) : []) {
        if (sq.id === ownClubId) continue;
        for (const p of sq.players) {
          candidates.push(buildReport(
            { player: p, squadId: sq.id, club: sq.name, league: ownLeague, country: ownCountry, forSale: forSale.has(p.id) },
            Math.max(S.IMPLICIT_OWN_LEAGUE, ctx.knowledgeOf(p.id)), ctx, {},
          ));
        }
      }
      const picks = monthlyRecommendations(candidates, state.lastRecommendation?.playerIds ?? []);
      state = { ...state, lastRecommendation: { month, playerIds: picks.map((p) => p.playerId) } };
      if (picks.length > 0) {
        result.messages.push({
          date, kind: "recommendation",
          players: picks.map((p) => ({ playerId: p.playerId, name: p.name, grade: p.grade, gem: p.gem, club: p.club })),
        });
      }
    }
  }

  if (state !== original) await service.writeScouting(saveId, state);
  return result;
}
