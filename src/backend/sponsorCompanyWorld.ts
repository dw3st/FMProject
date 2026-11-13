/**
 * The sponsor page (12.1, `.claude/rules/game/sponsors.md` → "Página do patrocinador"): who a company sponsors in a
 * save today, what the clubs did with it on the shirt, its finished contracts with the human clubs and the asking
 * seat's own dealings with it. One scan of the world per save, day and data version serves every company.
 */
import type { SaveService, SeatMeta } from "@/backend/SaveService";
import { getLeagueData } from "@/backend/advanceDay";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import { sponsorBioOf } from "@/backend/sponsorBios";
import { sponsorCatalog } from "@/backend/sponsorCatalog";
import { derivedSponsorsOf, sponsorsView } from "@/backend/sponsorWorld";
import { naturalFinancialTier } from "@/Domain/aiFinance/aiClubFinance";
import { SPONSOR_SLOTS, aiMasterSponsorOf } from "@/Domain/sponsors/sponsors";
import { sponsorTraitOf } from "@/Domain/sponsors/sponsorTraits";
import type { ClubSeasonRow } from "@/types/clubHistoryTypes";
import type { Squad } from "@/types/playerTypes";
import type {
  SponsorClubRef, SponsorCompanyView, SponsorPastDeal, SponsorResultRow, SponsorSlot,
} from "@/types/sponsorTypes";

/** Most notable seasons listed on the page. */
export const SPONSOR_RESULT_ROWS = 10;
const HISTORY_READS_AT_ONCE = 64;
const MAX_ENTRIES = 8;

type BySlot = Record<SponsorSlot, SponsorClubRef[]>;
interface Results { seasons: number; titles: number; promotions: number; relegations: number; rows: SponsorResultRow[] }

interface CompanyWorld {
  key: string;
  current: Map<string, BySlot>;
  history: Map<string, SponsorPastDeal[]>;
  results: Map<string, Results>;
}

const cache = new Map<string, CompanyWorld>();

/** A finished season of a club under a master sponsor. */
interface MasterSeason { companyId: string; ref: SponsorClubRef; row: ClubSeasonRow }
/**
 * The AI clubs' finished seasons with the master sponsor each had: they only change with the day (a rollover) or with
 * who the human clubs are, so they outlive the data version (every squad write) the rest of the scan follows.
 */
const aiSeasonsCache = new Map<string, { key: string; seasons: MasterSeason[] }>();

function remember<T>(map: Map<string, T>, saveId: string, value: T): void {
  map.delete(saveId);
  map.set(saveId, value);
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

const emptySlots = (): BySlot => ({ master: [], kit: [], board: [] });
const emptyResults = (): Results => ({ seasons: 0, titles: 0, promotions: 0, relegations: 0, rows: [] });

/** Titles of a season row, promotions apart. */
const realTitles = (row: ClubSeasonRow): string[] => row.titles.filter((t) => !t.startsWith("promotion:"));
const TITLE_RANK = (t: string): number => (t.startsWith("continental:") ? 3 : t.startsWith("league:") ? 2 : 1);
const seasonYear = (label: string): number => parseInt(label.slice(0, 4), 10) || 0;
/** Calendar year a season closes in ("2026-27" → 2027, "2027" → 2027). */
const closeYear = (label: string): number => seasonYear(label) + (label.includes("-") ? 1 : 0);

/** Titles first (the bigger the better), then promotions, then the best finish, then the newest season. */
function notableOrder(a: SponsorResultRow, b: SponsorResultRow): number {
  const score = (r: SponsorResultRow) => r.titles.reduce((t, x) => t + 10 * TITLE_RANK(x), 0) + (r.move === "promoted" ? 5 : 0);
  return score(b) - score(a)
    || (a.position ?? 999) - (b.position ?? 999)
    || seasonYear(b.season) - seasonYear(a.season)
    || (a.squadId < b.squadId ? -1 : a.squadId > b.squadId ? 1 : 0);
}

/**
 * The season rows a human club finished under each master contract: a finished contract went through `seasons`
 * reviews, the last of them on the day it ended; the running one through the reviews counted on it.
 */
export function humanMasterSeasons(
  sponsors: NonNullable<Squad["sponsors"]>, rows: readonly ClubSeasonRow[],
): { companyId: string; row: ClubSeasonRow }[] {
  const out: { companyId: string; row: ClubSeasonRow }[] = [];
  for (const h of sponsors.history ?? []) {
    if (h.slot !== "master" || h.seasons <= 0) continue;
    const endYear = seasonYear(h.to);
    let last = -1;
    rows.forEach((r, i) => { if (closeYear(r.season) <= endYear) last = i; });
    for (let i = Math.max(0, last - h.seasons + 1); i <= last; i++) out.push({ companyId: h.companyId, row: rows[i]! });
  }
  const running = sponsors.contracts.find((c) => c.slot === "master");
  const lived = running?.paid ? running.paid.met + running.paid.missed : 0;
  if (running && lived > 0) for (const row of rows.slice(-lived)) out.push({ companyId: running.company.id, row });
  return out;
}

/** Every company's clubs, finished contracts and results in the save (cached per day and data version). */
export async function companyWorld(service: SaveService, saveId: string): Promise<CompanyWorld | null> {
  const meta = await service.getMeta(saveId);
  if (!meta) return null;
  const key = `${meta.currentDate ?? ""}#${getSaveDataVersion(saveId)}`;
  const hit = cache.get(saveId);
  if (hit && hit.key === key) return hit;

  const catalog = sponsorCatalog();
  const date = meta.currentDate ?? "";
  const index = await service.getSquadIndex(saveId);
  const humans = await service.humanClubIds(saveId);
  const countryOf = new Map((await getLeagueData()).map((l) => [l.slug, l.country ?? null]));
  const squads = await service.getAllSquads(saveId);

  const current = new Map<string, BySlot>();
  const history = new Map<string, SponsorPastDeal[]>();
  const results = new Map<string, Results>();
  const slotsOf = (id: string) => current.get(id) ?? current.set(id, emptySlots()).get(id)!;
  const resultsOf = (id: string) => results.get(id) ?? results.set(id, emptyResults()).get(id)!;
  const count = (companyId: string, ref: SponsorClubRef, row: ClubSeasonRow) => {
    const r = resultsOf(companyId);
    const titles = realTitles(row);
    r.seasons++;
    r.titles += titles.length;
    if (row.move === "promoted") r.promotions++;
    if (row.move === "relegated") r.relegations++;
    r.rows.push({ ...ref, season: row.season, league: row.league, position: row.position, titles, move: row.move ?? null });
  };

  const clubs: { squad: Squad; ref: SponsorClubRef }[] = [];
  for (const squad of squads) {
    const squadId = String(squad.id);
    // The same league the club page and the match preview read (`leagueOf` of `sponsorWorld.ts`).
    const leagueSlug = index.byId(squadId)?.leagueSlug ?? squad.leagueSlug ?? "";
    const ref: SponsorClubRef = { squadId, name: squad.name, leagueSlug, human: humans.has(squadId) };
    clubs.push({ squad, ref });
    if (squad.sponsors) {
      for (const c of squad.sponsors.contracts) slotsOf(c.company.id)[c.slot].push(ref);
      for (const h of squad.sponsors.history ?? []) {
        (history.get(h.companyId) ?? history.set(h.companyId, []).get(h.companyId)!)
          .push({ companyId: h.companyId, slot: h.slot, from: h.from, to: h.to, seasons: h.seasons, end: h.end, ...ref });
      }
    } else {
      const ai = derivedSponsorsOf(squad, { leagueSlug, country: countryOf.get(leagueSlug) ?? null }, meta.activeLeagues, date);
      if (ai.master) slotsOf(ai.master.id).master.push(ref);
      if (ai.kit) slotsOf(ai.kit.id).kit.push(ref);
      for (const b of ai.boards) slotsOf(b.id).board.push(ref);
    }
  }

  // Results: the finished seasons of every club's history, under the master sponsor it had then.
  const sponsored = clubs.filter((c) => c.squad.sponsors);
  const aiKey = `${date}|${sponsored.map((c) => c.ref.squadId).sort().join(",")}`;
  let ai = aiSeasonsCache.get(saveId);
  if (!ai || ai.key !== aiKey) {
    const seasons: MasterSeason[] = [];
    const others = clubs.filter((c) => !c.squad.sponsors);
    for (let at = 0; at < others.length; at += HISTORY_READS_AT_ONCE) {
      const batch = others.slice(at, at + HISTORY_READS_AT_ONCE);
      const histories = await Promise.all(batch.map((c) => service.getClubHistory(saveId, c.ref.squadId)));
      batch.forEach(({ squad, ref }, i) => {
        // An AI club: the name its shirt had each season (today's tier, the country of that season's league).
        const tier = naturalFinancialTier(squad.finances);
        for (const row of histories[i]?.seasons ?? []) {
          const master = aiMasterSponsorOf(catalog, { clubId: ref.squadId, season: seasonYear(row.season), country: countryOf.get(row.league) ?? null, tier });
          if (master) seasons.push({ companyId: master.id, ref, row });
        }
      });
    }
    ai = { key: aiKey, seasons };
    remember(aiSeasonsCache, saveId, ai);
  }
  for (const s of ai.seasons) count(s.companyId, s.ref, s.row);
  // A human club: its contracts' own books say which seasons each master sponsor saw.
  for (const { squad, ref } of sponsored) {
    const rows = (await service.getClubHistory(saveId, ref.squadId))?.seasons ?? [];
    if (rows.length > 0) for (const s of humanMasterSeasons(squad.sponsors!, rows)) count(s.companyId, ref, s.row);
  }
  for (const r of results.values()) r.rows = r.rows.sort(notableOrder).slice(0, SPONSOR_RESULT_ROWS);
  for (const list of history.values()) list.sort((a, b) => (a.to < b.to ? 1 : a.to > b.to ? -1 : 0));

  const world: CompanyWorld = { key, current, history, results };
  remember(cache, saveId, world);
  return world;
}

/**
 * `GET /api/saves/:id/sponsors/company/:companyId`: null for a company that is not in the catalog (or a missing save).
 * `seat` is the asking seat (its club's dealings with the company go in `mine`); `top` the world's top players (the
 * appeal of `sponsorsView`), read only when the seat has a club.
 */
export async function sponsorCompanyView(
  service: SaveService, saveId: string, companyId: string, lang: string | null,
  seat: SeatMeta | null, top: () => Promise<ReadonlySet<string>>,
): Promise<SponsorCompanyView | null> {
  const company = sponsorCatalog().find((c) => c.id === companyId);
  if (!company) return null;
  const world = await companyWorld(service, saveId);
  if (!world) return null;

  const current = world.current.get(companyId) ?? emptySlots();
  const tables = new Map<string, { squadId: string; mp: number }[]>();
  const now: SponsorCompanyView["results"]["now"] = [];
  for (const ref of current.master) {
    if (ref.leagueSlug && !tables.has(ref.leagueSlug)) tables.set(ref.leagueSlug, (await service.getLeagueStandings(saveId, ref.leagueSlug)) ?? []);
    const table = tables.get(ref.leagueSlug) ?? [];
    const at = table.findIndex((r) => r.squadId === ref.squadId);
    now.push({ ...ref, position: at >= 0 && table[at]!.mp > 0 ? at + 1 : null, size: table.length });
  }

  let mine: SponsorCompanyView["mine"] = null;
  if (seat && seat.clubId && !seat.unemployed) {
    const squad = await service.getSquadById(saveId, seat.clubId);
    if (squad) {
      const view = await sponsorsView(service, saveId, seat, squad, await top());
      mine = {
        active: view.active,
        offers: view.offers.filter((o) => o.company.id === companyId),
        contract: view.contracts.find((c) => c.company.id === companyId) ?? null,
        history: (squad.sponsors?.history ?? []).filter((h) => h.companyId === companyId).reverse(),
      };
    }
  }

  const results = world.results.get(companyId) ?? emptyResults();
  return {
    company: {
      id: company.id, name: company.name, sector: company.sector, size: company.size, country: company.country ?? null,
      colors: [company.colors[0], company.colors[1]], trait: sponsorTraitOf(company.id), bio: sponsorBioOf(company.id, lang),
    },
    current: Object.fromEntries(SPONSOR_SLOTS.map((slot) => [slot, current[slot]])) as Record<SponsorSlot, SponsorClubRef[]>,
    history: world.history.get(companyId) ?? [],
    results: { seasons: results.seasons, titles: results.titles, promotions: results.promotions, relegations: results.relegations, rows: results.rows, now },
    mine,
  };
}
