import { loanAvailability } from "@/Domain/negotiation/loans";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { saveService } from "@/backend/SaveService";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import { loadViewer, obscurePlayerForViewer, obscureSquadForViewer } from "@/backend/scoutingWorld";
import {
  collectNationalities, collectSellListedIds, mapFreeAgentsToScoutPlayers, mapSquadsToScoutPlayers, runScoutQuery,
  type ScoutQuery, type ScoutSearchResponse,
} from "@/Domain/scout/scoutQuery";
import { ATTRIBUTE_LIST } from "@/Domain/attributes";
import { createDefaultScoutFilters } from "@/Domain/scout/scoutFilterState";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import { scoutRowExtras, type BuyerContext } from "@/Domain/scout/scoutInterest";
import { aiClubFinance, naturalFinancialTier, tierIndex } from "@/Domain/aiFinance/aiClubFinance";
import { teamAvgRating } from "@/Domain/transfer/transferNeeds";
import { facilitiesAppeal } from "@/Domain/facilities/facilities";
import { FACILITIES } from "@/Domain/facilities/facilityConfig";
import { wageFactorOf, weeklyWage } from "@/Domain/finance/wages";
import { preContractEligible } from "@/Domain/negotiation/preContract";
import { askingPricesOf } from "@/Domain/scout/askingPrices";
import type { Squad } from "@/types/playerTypes";
import type { SellCandidate } from "@/types/transferMarketTypes";
import type { ScoutGrade } from "@/types/scoutingTypes";

const GRADES: readonly ScoutGrade[] = ["A", "B", "C", "D", "E"];

interface ScoutIndex {
  key: string;
  players: DisplayPlayer[];
  nationalities: string[];
  sellListedIds: Set<string>;
  shortlistIds: Set<string>;
}

/** One entry per save; a couple of saves at most so a long-running server does not grow unbounded. */
const MAX_CACHED_SAVES = 2;
/** Rows depend on the seat's knowledge (the blur), so the cache is per save and seat. */
const cache = new Map<string, ScoutIndex>();
const cacheKey = (saveId: string, seatId: string) => `${saveId}:${seatId}`;

/**
 * In-flight index builds keyed by `saveId#key`, so concurrent misses (e.g. two scout requests
 * landing before the first build finishes) share one `getAllSquads` call instead of each
 * kicking off its own.
 */
const inFlight = new Map<string, Promise<ScoutIndex | null>>();

/**
 * Built scout rows for a save. Keyed by `currentDate` (advance-day rewrites squads) plus the
 * save's write version (bumped by FileSystemDAL on every squad/market write, so a mid-day
 * transfer or sell-list edit invalidates the entry).
 */
async function buildScoutIndex(saveId: string, seatId: string, key: string): Promise<ScoutIndex> {
  const [squads, market, freeAgents] = await Promise.all([
    saveService.getAllSquads(saveId),
    saveService.getMarket(saveId, seatId),
    saveService.getFreeAgents(saveId),
  ]);
  // What the user sees of players outside his own squad is blurred by how well he knows each one
  // (`.claude/rules/game/scouting.md`); his own squad is always exact. Rows carry `knowledge`,
  // `hiddenAttrs` and the ranges (`toDisplayPlayer` reads `scoutView`).
  const viewer = await loadViewer(saveService, saveId, seatId, { squads });
  const seen = viewer ? squads.map((s) => obscureSquadForViewer(viewer, s)) : squads;
  const seenAgents = viewer
    ? freeAgents.map((f) => ({ ...f, player: obscurePlayerForViewer(viewer, f.player, "") }))
    : freeAgents;
  const rows = [...mapSquadsToScoutPlayers(seen), ...mapFreeAgentsToScoutPlayers(seenAgents)];
  const buyer = viewer?.ownClubId ? buyerContext(squads, viewer.ownClubId) : null;
  // Interest and "fits the budget" (#123): computed here, on what the user sees of each player.
  const preContractIds = buyer ? await preContractIdsOf(saveId, squads) : new Set<string>();
  const loanableIds = buyer ? await loanableIdsOf(saveId, squads, market, viewer?.ownClubId ?? "") : new Set<string>();
  const scouting = await saveService.getScouting(saveId, seatId);
  // Grade of the latest report on each player (tester report: filter by grade).
  const gradeOf = new Map<string, ScoutGrade>();
  for (const r of [...scouting.reports].sort((a, b) => a.date.localeCompare(b.date))) gradeOf.set(r.playerId, r.grade);
  // A player who already signed a pre-contract with the user's club is his: out of the search (tester report).
  const signedPre = new Set((market?.preContracts ?? []).filter((p) => p.toClubId === viewer?.ownClubId).map((p) => p.playerId));
  const players = rows.filter((r) => !signedPre.has(r.id)).map((r) => {
    let row: DisplayPlayer = r;
    if (buyer) {
      const extras = scoutRowExtras(r, buyer, weeklyWage);
      if (extras) row = { ...row, ...extras };
      if (preContractIds.has(r.id)) row = { ...row, preContract: true };
      if (loanableIds.has(r.id)) row = { ...row, loanable: true };
    }
    const grade = gradeOf.get(r.id);
    return grade ? { ...row, grade } : row;
  });
  // What each listed player's club asks (tester report), and other managers' lists, which are for sale too.
  const seatLists = await otherSeatLists(saveId, seatId);
  const asking = askingPricesOf({
    squads,
    aiLists: market?.profiles ?? {},
    seatLists,
    buyer: viewer?.ownClubId ? squads.find((s) => s.id === viewer.ownClubId) ?? null : null,
    humanClubIds: await saveService.humanClubIds(saveId),
  });
  const priced = players.map((p) => (asking.has(p.id) ? { ...p, askingPrice: asking.get(p.id) } : p));
  const sellListedIds = new Set([...collectSellListedIds(market), ...seatLists.flatMap((s) => s.list.map((c) => c.playerId))]);
  const shortlistIds = new Set(scouting.shortlist.map((e) => e.playerId));
  const entry: ScoutIndex = {
    key,
    players: priced,
    nationalities: collectNationalities(priced),
    sellListedIds,
    shortlistIds,
  };
  cache.delete(cacheKey(saveId, seatId));
  cache.set(cacheKey(saveId, seatId), entry);
  while (cache.size > MAX_CACHED_SAVES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return entry;
}

/** The sell lists of the other seats of the world, with their club (a jobless seat has none). */
async function otherSeatLists(saveId: string, seatId: string): Promise<{ clubId: string; list: SellCandidate[] }[]> {
  const out: { clubId: string; list: SellCandidate[] }[] = [];
  for (const { seatId: other, seat } of await saveService.listSeats(saveId)) {
    if (other === seatId || !seat.clubId || seat.unemployed) continue;
    const m = await saveService.getSeatMarket(saveId, other);
    if (m?.playerSellList?.length) out.push({ clubId: seat.clubId, list: m.playerSellList });
  }
  return out;
}

/** Players of AI clubs who can sign a pre-contract today (real contracts, not the blurred rows; `POST /pre-contracts` takes no human club's player). */
async function preContractIdsOf(saveId: string, squads: Squad[]): Promise<Set<string>> {
  const [meta, humans] = await Promise.all([saveService.getMeta(saveId), saveService.humanClubIds(saveId)]);
  const date = meta?.currentDate ?? "";
  const ids = new Set<string>();
  for (const squad of squads) {
    if (humans.has(squad.id)) continue;
    for (const p of squad.players) if (preContractEligible(p, date)) ids.add(p.id);
  }
  return ids;
}

/**
 * Players of AI clubs their club would loan out today (`loanAvailability`, the rule of `POST /loans`: not a starter of
 * the automatic XI, a young, listed or surplus player, the line minimums kept). Tester report, 4.47.12.
 */
async function loanableIdsOf(saveId: string, squads: Squad[], market: { profiles?: Record<string, { sellList?: { playerId: string }[] }> } | null | undefined, ownClubId: string): Promise<Set<string>> {
  const humans = await saveService.humanClubIds(saveId);
  const ids = new Set<string>();
  for (const squad of squads) {
    if (humans.has(squad.id) || squad.id === ownClubId) continue;
    const listed = new Set((market?.profiles?.[squad.id]?.sellList ?? []).map((c) => c.playerId));
    const starterIds = new Set(autoLineupDefaultFormation(squad));
    for (const p of squad.players) if (loanAvailability(p, squad, { starterIds, listed: listed.has(p.id) }) === null) ids.add(p.id);
  }
  return ids;
}

/** The user's club as the scout rows need it (`scoutRowExtras`); null when it is not in the save. */
function buyerContext(squads: Squad[], clubId: string): BuyerContext | null {
  const own = squads.find((s) => s.id === clubId);
  if (!own) return null;
  const tiers = new Map(squads.map((s) => [s.id, tierIndex(naturalFinancialTier(s.finances))]));
  const fin = aiClubFinance(own);
  const appealAdult = facilitiesAppeal(own, { age: 99 });
  const appealYoung = facilitiesAppeal(own, { age: 18 });
  return {
    squadId: own.id,
    leagueSlug: own.leagueSlug ?? "",
    tier: tiers.get(own.id) ?? 0,
    buyerAvg: teamAvgRating(own),
    appealFor: (age) => (age <= FACILITIES.APPEAL.YOUTH_MAX_AGE ? appealYoung : appealAdult),
    trainingCondition: appealAdult,
    balance: own.finances?.budget ?? 0,
    wageBill: fin.wageBill,
    maxWageBudget: fin.maxWageBudget,
    wageFactor: wageFactorOf(own),
    tierOf: (id) => tiers.get(id),
  };
}

export async function getScoutIndex(saveId: string, seatId: string): Promise<ScoutIndex | null> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return null;
  // Read the version before loading so a write racing the build yields a newer key next time.
  const key = `${seatId}:${meta.currentDate ?? ""}#${getSaveDataVersion(saveId)}`;
  const hit = cache.get(cacheKey(saveId, seatId));
  if (hit && hit.key === key) {
    cache.delete(cacheKey(saveId, seatId));
    cache.set(cacheKey(saveId, seatId), hit);
    return hit;
  }

  // Share one build across concurrent misses for the same save + key.
  const flightKey = `${saveId}#${key}`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const promise = buildScoutIndex(saveId, seatId, key).finally(() => {
    inFlight.delete(flightKey);
  });
  inFlight.set(flightKey, promise);
  return promise;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asFiniteNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Coerce `attributeRanges` to only known attribute ids with finite, 0..100-clamped integer, min<=max bounds. */
function asAttributeRanges(
  raw: unknown,
  defaults: ScoutQuery["filters"]["attributeRanges"],
): ScoutQuery["filters"]["attributeRanges"] {
  const out = { ...defaults };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const attr of ATTRIBUTE_LIST) {
    const entry = r[attr.id];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { min?: unknown; max?: unknown };
    if (typeof e.min !== "number" || !Number.isFinite(e.min)) continue;
    if (typeof e.max !== "number" || !Number.isFinite(e.max)) continue;
    const clampedMin = Math.round(Math.min(100, Math.max(0, e.min)));
    const clampedMax = Math.round(Math.min(100, Math.max(0, e.max)));
    out[attr.id] = clampedMin <= clampedMax
      ? { min: clampedMin, max: clampedMax }
      : { min: clampedMax, max: clampedMin };
  }
  return out;
}

/** Normalise an untrusted request body into a full `ScoutQuery`, coercing every field to its
 *  expected type and falling back to the default whenever the incoming value is the wrong shape. */
export function parseScoutQuery(body: unknown): ScoutQuery {
  const b = (body && typeof body === "object" ? body : {}) as Partial<ScoutQuery>;
  const defaults = createDefaultScoutFilters();
  const f = (b.filters && typeof b.filters === "object" ? b.filters : {}) as Partial<ScoutQuery["filters"]>;
  return {
    filters: {
      name: asString(f.name, defaults.name),
      position: asString(f.position, defaults.position),
      minAge: asFiniteNumber(f.minAge, defaults.minAge),
      maxAge: asFiniteNumber(f.maxAge, defaults.maxAge),
      minAvg: asFiniteNumber(f.minAvg, defaults.minAvg),
      maxAvg: asFiniteNumber(f.maxAvg, defaults.maxAvg),
      minPriceM: asFiniteNumber(f.minPriceM, defaults.minPriceM),
      maxPriceM: asFiniteNumber(f.maxPriceM, defaults.maxPriceM),
      league: asString(f.league, defaults.league),
      nationality: asString(f.nationality, defaults.nationality),
      attributeRanges: asAttributeRanges(f.attributeRanges, defaults.attributeRanges),
      onlyForSale: f.onlyForSale === true,
      onlyFree: f.onlyFree === true,
      onlyShortlist: f.onlyShortlist === true,
      onlyAwarded: f.onlyAwarded === true,
      onlyAffordable: f.onlyAffordable === true,
      onlyPreContract: f.onlyPreContract === true,
      onlyLoanable: f.onlyLoanable === true,
      minKnowledge: asFiniteNumber(f.minKnowledge, 0),
      grades: Array.isArray(f.grades) ? [...new Set(f.grades.filter((g): g is ScoutGrade => GRADES.includes(g as ScoutGrade)))] : [],
      minPotential: Math.min(100, Math.max(0, asFiniteNumber(f.minPotential, 0))),
      maxPotential: Math.min(100, Math.max(0, asFiniteNumber(f.maxPotential, 100))),
    },
    sortKey: typeof b.sortKey === "string" ? b.sortKey : "avg",
    sortDir: b.sortDir === "asc" ? "asc" : "desc",
    page: typeof b.page === "number" ? b.page : 0,
    pageSize: typeof b.pageSize === "number" ? b.pageSize : 100,
  };
}

export async function searchScout(saveId: string, seatId: string, query: ScoutQuery): Promise<ScoutSearchResponse | null> {
  const index = await getScoutIndex(saveId, seatId);
  if (!index) return null;
  const page = runScoutQuery(index.players, query, index.sellListedIds, index.shortlistIds);
  return {
    ...page,
    nationalities: index.nationalities,
    sellListedIds: page.rows.filter((r) => index.sellListedIds.has(r.id)).map((r) => r.id),
    shortlistIds: page.rows.filter((r) => index.shortlistIds.has(r.id)).map((r) => r.id),
  };
}
