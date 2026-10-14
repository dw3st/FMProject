/**
 * World news of the day (Etapa 42, `.claude/rules/game/press.md` → "Notícias"): gathers what the day already
 * produced in `advanceOneDay` (results, titles, moves, transfers, managers, awards, stars, national, records, press)
 * into a `DayNewsInput`, builds the items (`buildDayNews`) and appends them to `news/{AAAA-MM}.json`. Never re-reads the
 * world: everything comes from the day's state, except the top 100 of the world (cached per month) and `clubLevel`
 * for the wins that may be upsets (memoized per club for the day).
 */
import type { SaveService, SaveMeta } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import { famousIds } from "@/backend/scoutingWorld";
import { clubLevel } from "@/backend/continentalWorld";
import { buildDayNews, NEWS } from "@/Domain/news/buildDayNews";
import { pyramidByLeague, tierOfLeague } from "@/Domain/season/countryRollover";
import { cupSlugOf, isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { logError } from "@/Logger";
import type { DayNewsInput, NewsClub, NewsScope } from "@/types/newsTypes";
import type { DayTransfer, MatchEvent } from "@/types/dayLogTypes";
import type { Pyramids } from "@/types/pyramidTypes";
import type { Squad } from "@/types/playerTypes";
import type { ClubRecordBroken } from "@/types/clubHistoryTypes";
import type { LeagueSeasonAwards, WorldAwards } from "@/types/awardTypes";

/** What the day loop pushes as it goes (titles, moves, records, awards, retirements, names). */
export interface NewsDayCollector {
  champions: { competition: string; squadId: string }[];
  moves: { squadId: string; from: string; to: string; kind: "promoted" | "relegated"; fromTier: number | null }[];
  /** playerId → name of the AI market transfers of the day. */
  transferNames: Map<string, string>;
  /** playerIds whose buyer broke its record signing today. */
  recordSignings: Set<string>;
  clubRecords: { squadId: string; broken: ClubRecordBroken[] }[];
  leagueAwards: LeagueSeasonAwards[];
  worldAwards: WorldAwards | null;
  retired: { playerId: string; player: string; squadId: string }[];
  /** Leaders of the human's and the followed leagues before today's games (null = no games yet). */
  startLeaders: Map<string, string | null>;
}

export function newNewsCollector(): NewsDayCollector {
  return {
    champions: [], moves: [], transferNames: new Map(), recordSignings: new Set(), clubRecords: [],
    leagueAwards: [], worldAwards: null, retired: [], startLeaders: new Map(),
  };
}

/** Leaders (first with ≥ 5 games) of `leagues` now; read before the games and again at the end of the day. */
export async function readLeaders(service: SaveService, saveId: string, leagues: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const slug of new Set(leagues.filter(Boolean))) {
    const table = (await service.getLeagueStandings(saveId, slug)) ?? [];
    const top = table[0];
    out.set(slug, top && top.mp >= 5 ? top.squadId : null);
  }
  return out;
}

/** Top 100 of the world, refreshed once a month per save (the full scan reads every squad). */
const famousByMonth = new Map<string, { month: string; ids: Set<string> }>();
async function famousOfMonth(service: SaveService, saveId: string, date: string): Promise<Set<string>> {
  const month = date.slice(0, 7);
  const hit = famousByMonth.get(saveId);
  if (hit && hit.month === month) return hit.ids;
  const ids = await famousIds(service, saveId, date);
  famousByMonth.set(saveId, { month, ids });
  if (famousByMonth.size > 4) famousByMonth.delete(famousByMonth.keys().next().value!);
  return ids;
}

export interface CollectDayNewsArgs {
  service: SaveService;
  saveId: string;
  date: string;
  meta: SaveMeta;
  index: SquadIndex;
  catalog: LeagueDataEntry[];
  pyramids: Pyramids;
  events: MatchEvent[];
  transfers: DayTransfer[];
  /** Every AI-club sacking/hiring of the day (`aiDesk.worldNews()`). */
  managers: { kind: "sacked" | "hired"; squadId: string; clubName: string; managerName: string; interim?: boolean }[];
  national: DayNewsInput["national"];
  press: DayNewsInput["press"];
  collector: NewsDayCollector;
  squadOf: (id: string) => Promise<Squad | null>;
}

export async function collectDayNews(a: CollectDayNewsArgs): Promise<DayNewsInput> {
  const { index, collector: c } = a;
  const countryOf = new Map<string, string>();
  const cupCountry = new Map<string, string>();
  for (const l of a.catalog) if (l.country) { countryOf.set(l.slug, l.country); cupCountry.set(cupSlugOf(l.country), l.country); }
  const pyramidOf = pyramidByLeague(a.pyramids);
  const tierOf = (slug: string): number | null => {
    const p = pyramidOf.get(slug);
    return p ? tierOfLeague(p, slug) : countryOf.has(slug) ? 1 : null;
  };
  const scopeOf = (slug: string): NewsScope => {
    if (isContinentalSlug(slug)) return { competition: slug };
    if (isCupSlug(slug)) return { competition: slug, ...(cupCountry.has(slug) ? { country: cupCountry.get(slug)! } : {}) };
    return { league: slug, tier: tierOf(slug), ...(countryOf.has(slug) ? { country: countryOf.get(slug)! } : {}) };
  };
  const leagueOfClub = (id: string) => index.byId(id)?.leagueSlug;
  const clubScope = (id: string): NewsScope => { const l = leagueOfClub(id); return l ? scopeOf(l) : {}; };
  const club = (id: string, fallback?: string): NewsClub => ({ id, name: index.byId(id)?.name ?? fallback ?? id });
  const topFlightClub = (id: string) => { const l = leagueOfClub(id); return !!l && tierOf(l) === 1; };
  const human = a.meta.clubId || undefined;
  const followed = a.meta.followedLeagues ?? [];

  // Wins that may be upsets need both clubs' level (memoized per club for the day).
  const levels = new Map<string, number | null>();
  const levelOf = async (id: string): Promise<number | null> => {
    if (levels.has(id)) return levels.get(id)!;
    let v: number | null = null;
    try { const sq = await a.squadOf(id); if (sq) v = clubLevel(sq); } catch (e) { logError("news", `clubLevel failed for ${id}`, e); }
    levels.set(id, v);
    return v;
  };

  // Fixture ids are only unique within a competition: the news key carries the competition.
  const results: DayNewsInput["results"] = [];
  for (const e of a.events) {
    const scope = scopeOf(e.competition);
    if (!scope.competition && scope.tier !== 1) continue;
    const r: DayNewsInput["results"][number] = {
      ...scope, fixtureId: `${e.competition}:${e.fixtureId}`, home: club(e.home), away: club(e.away), score: e.score,
    };
    const margin = Math.abs(e.score.home - e.score.away);
    if (margin > 0 && margin < NEWS.THRASHING_MARGIN) {
      const [h, w] = [await levelOf(e.home), await levelOf(e.away)];
      if (h !== null && w !== null) r.levels = { home: h, away: w };
    }
    results.push(r);
  }

  const champions: DayNewsInput["champions"] = c.champions.map((x) => ({ ...scopeOf(x.competition), club: club(x.squadId) }));
  const moves: DayNewsInput["moves"] = c.moves.map((m) => ({ ...scopeOf(m.to), tier: m.fromTier, club: club(m.squadId), kind: m.kind }));

  const newLeaders: DayNewsInput["newLeaders"] = [];
  if (c.startLeaders.size > 0) {
    const now = await readLeaders(a.service, a.saveId, [...c.startLeaders.keys()]);
    for (const [slug, leader] of now) {
      if (leader && c.startLeaders.has(slug) && c.startLeaders.get(slug) !== leader) newLeaders.push({ ...scopeOf(slug), club: club(leader) });
    }
  }

  // Transfers with a fee; the top 100 is read (monthly cache) only when one could be a star.
  const transfers: DayNewsInput["transfers"] = [];
  const feeMoves = a.transfers.filter((t) => t.kind === "transfer" && t.fee > 0);
  const injured = a.events.flatMap((e) => (e.injuries ?? []).filter((i) => i.severity === "severe")
    .map((i) => ({ e, i, squadId: i.team === "home" ? e.home : e.away })));
  const famous = feeMoves.length > 0 || injured.length > 0 ? await famousOfMonth(a.service, a.saveId, a.date) : new Set<string>();
  const seen = new Set<string>();
  for (const t of feeMoves) {
    if (seen.has(t.playerId)) continue;
    seen.add(t.playerId);
    const star = famous.has(t.playerId);
    const clubRecord = c.recordSignings.has(t.playerId) && (t.to === human || topFlightClub(t.to));
    if (t.fee < NEWS.BIG_FEE && !star && !clubRecord) continue;
    let name = c.transferNames.get(t.playerId);
    if (!name) name = (await a.service.getSquadById(a.saveId, t.to))?.players.find((p) => p.id === t.playerId)?.name ?? t.playerId;
    transfers.push({ ...clubScope(t.to), playerId: t.playerId, player: name, from: t.from ? club(t.from) : null, to: club(t.to), fee: t.fee, star, clubRecord });
  }

  const managers: DayNewsInput["managers"] = a.managers
    .filter((m) => !m.interim && topFlightClub(m.squadId))
    .map((m) => ({ ...clubScope(m.squadId), kind: m.kind, club: club(m.squadId, m.clubName), manager: m.managerName }));

  const awards: DayNewsInput["awards"] = [];
  for (const la of c.leagueAwards) {
    if (la.tier !== 1 || !la.bestPlayer) continue;
    const b = la.bestPlayer;
    awards.push({ ...scopeOf(la.league), kind: "league_best", name: b.name, personId: b.playerId, club: { id: b.squadId, name: b.clubName } });
  }
  if (c.worldAwards) {
    const p = c.worldAwards.player[0];
    const m = c.worldAwards.manager[0];
    if (p) awards.push({ kind: "world_player", name: p.name, personId: p.id, ...(p.squadId ? { club: { id: p.squadId, name: p.clubName } } : {}) });
    if (m) awards.push({ kind: "world_manager", name: m.name, personId: m.id, ...(m.squadId ? { club: { id: m.squadId, name: m.clubName } } : {}) });
  }

  const stars: DayNewsInput["stars"] = [];
  for (const { e, i, squadId } of injured) {
    if (!famous.has(i.playerId)) continue;
    stars.push({ ...scopeOf(e.competition), kind: "injury", playerId: i.playerId, player: i.playerName, club: club(squadId) });
  }
  for (const r of c.retired) stars.push({ ...clubScope(r.squadId), kind: "retired", playerId: r.playerId, player: r.player, ...(r.squadId ? { club: club(r.squadId) } : {}) });

  // Beaten club records of the human club and of top-flight clubs (a record signing is a transfer story).
  const clubRecords: DayNewsInput["clubRecords"] = [];
  for (const cr of c.clubRecords) {
    if (cr.squadId !== human && !topFlightClub(cr.squadId)) continue;
    for (const b of cr.broken) {
      if (b.kind === "recordSigning") continue;
      clubRecords.push({ ...clubScope(cr.squadId), club: club(cr.squadId), record: b.kind });
    }
  }

  return {
    date: a.date, ...(human ? { humanClubId: human } : {}), ...(a.meta.leagueSlug ? { humanLeague: a.meta.leagueSlug } : {}),
    followed, results, champions, moves, newLeaders, transfers, managers, awards, stars, national: a.national, clubRecords,
    press: a.press,
  };
}

/** First month kept by the pruning on the first day of a month (`NEWS.MONTHS_KEPT` months, this one included). */
export function oldestMonthKept(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - (NEWS.MONTHS_KEPT - 1);
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}`;
}

/** Builds and appends the day's news; on the first day of a month, months older than a year are deleted. */
export async function writeDayNews(service: SaveService, saveId: string, input: DayNewsInput): Promise<number> {
  const items = buildDayNews(input);
  if (items.length > 0) await service.appendNews(saveId, items);
  if (input.date.slice(8, 10) === "01") await service.pruneNews(saveId, oldestMonthKept(input.date));
  return items.length;
}
