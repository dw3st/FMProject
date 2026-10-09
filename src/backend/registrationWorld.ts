import type { SaveMeta, SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { Squad } from "@/types/playerTypes";
import type { LeagueSeasonMeta } from "@/types/calendarTypes";
import type { RegistrationCompKind, RegistrationNotice } from "@/types/registrationTypes";
import countriesRaw from "@/Data/countries.json";
import { loadWindowContext, type WindowContext } from "@/backend/marketWindowWorld";
import { seasonLabel } from "@/Domain/history/history";
import { cupSlugOf, isCupSlug } from "@/Domain/cups/cupIds";
import { CONTINENTAL_SLUGS, isContinentalSlug } from "@/Domain/continental/competitions";
import { isYouthCompSlug } from "@/Domain/youthComps/youthCompIds";
import { registrationStatus, type ContinentalGate } from "@/Domain/registration/deadlines";
import { registeredSet, ruleFor } from "@/Domain/registration/rules";
import { aiRefresh, ensureList, humanDay, type CompInfo } from "@/Domain/registration/lists";
import type { MatchRegistration } from "@/Domain/advanceDay/matchSimulationLineups";

/**
 * Registration lists in the save (`.claude/rules/game/registration.md`): the competitions of a club, the season and
 * deadline of each, and the three moments a list moves — the first list on need, the human club's morning step and
 * the AI refresh after the market. The only I/O of the feature; the decisions are pure (`src/Domain/registration`).
 */
const COUNTRIES = countriesRaw as Record<string, { continent?: string }>;

export interface RegistrationDayCtx {
  date: string;
  windows: WindowContext;
  humanClubId?: string;
  /** Competition info of a club (null for youth competitions and competitions the club does not play). */
  infoFor(squad: Squad, leagueSlug: string, slug: string): Promise<CompInfo | null>;
  /** Every competition of the club with a list: league, national cup, continental. */
  infosFor(squad: Squad, leagueSlug: string): Promise<CompInfo[]>;
}

export function kindOf(slug: string): RegistrationCompKind {
  return isContinentalSlug(slug) ? "continental" : isCupSlug(slug) ? "cup" : "league";
}

function gateOf(meta: LeagueSeasonMeta | null): ContinentalGate | undefined {
  const stages = meta?.continental?.stages;
  const group = stages?.find((s) => s.name === "group");
  const r16 = stages?.find((s) => s.name === "r16");
  if (!group?.dates.length || !r16?.dates.length) return undefined;
  return { groupStart: group.dates[0]!, groupEnd: group.dates[group.dates.length - 1]!, knockoutStart: r16.dates[0]! };
}

/** One per day advance or route: windows, metas of cups and continentals (read once). */
export async function registrationDayCtx(
  service: SaveService,
  saveId: string,
  meta: SaveMeta,
  index: SquadIndex | null,
  date = meta.currentDate ?? "",
  windows?: WindowContext,
): Promise<RegistrationDayCtx> {
  const w = windows ?? (await loadWindowContext(meta, index, date));
  const humanClubId = meta.unemployed ? undefined : meta.clubId || undefined;
  const states = new Map((meta.activeLeagues ?? []).map((l) => [l.leagueSlug, l] as const));
  const metaCache = new Map<string, Promise<LeagueSeasonMeta | null>>();
  const metaOf = (slug: string) => {
    let p = metaCache.get(slug);
    if (!p) {
      p = service.getLeagueMeta(saveId, slug).catch(() => null);
      metaCache.set(slug, p);
    }
    return p;
  };

  const infoFor = async (squad: Squad, leagueSlug: string, slug: string): Promise<CompInfo | null> => {
    if (!slug || isYouthCompSlug(slug)) return null;
    const kind = kindOf(slug);
    const state = states.get(leagueSlug);
    let season: string;
    let compMeta: LeagueSeasonMeta | null = null;
    if (kind === "league") {
      if (slug !== leagueSlug) return null;
      season = state ? seasonLabel(state.year, state.start, state.end) : date.slice(0, 4);
    } else {
      compMeta = await metaOf(slug);
      if (!compMeta) return null;
      if (kind === "continental" && !compMeta.continental?.groups.some((g) => g.clubs.includes(squad.id))) return null;
      season = seasonLabel(compMeta.year, compMeta.start, compMeta.end);
    }
    const country = w.countryOfLeague(leagueSlug);
    const ctx = {
      seasonStartYear: state?.year ?? parseInt(date.slice(0, 4), 10),
      countryOfLeague: w.countryOfLeague,
      country,
      squadId: squad.id,
    };
    const window = squad.id === humanClubId ? w.human() : w.ofLeague(leagueSlug);
    const status = registrationStatus({ kind, window, date, ...(kind === "continental" ? { continental: gateOf(compMeta) } : {}) });
    return { slug, kind, season, rule: ruleFor(slug, leagueSlug, country, COUNTRIES[country]?.continent), ctx, status };
  };

  const infosFor = async (squad: Squad, leagueSlug: string): Promise<CompInfo[]> => {
    const slugs = [leagueSlug];
    const country = w.countryOfLeague(leagueSlug);
    if (country) slugs.push(cupSlugOf(country));
    for (const c of CONTINENTAL_SLUGS) {
      const m = await metaOf(c);
      if (m?.continental?.groups.some((g) => g.clubs.includes(squad.id))) slugs.push(c);
    }
    const out: CompInfo[] = [];
    for (const s of slugs) {
      const info = await infoFor(squad, leagueSlug, s);
      if (info) out.push(info);
    }
    return out;
  };

  return { date, windows: w, humanClubId, infoFor, infosFor };
}

/**
 * Registration of one side for a match: ensures the list (first list even with the deadline closed) and returns the
 * registered set. `changed` → the caller stores the squad. null for competitions without lists.
 */
export async function matchRegistration(
  dctx: RegistrationDayCtx,
  squad: Squad,
  leagueSlug: string,
  competition: string,
): Promise<{ reg: MatchRegistration; squad: Squad; changed: boolean; notices: RegistrationNotice[] } | null> {
  const info = await dctx.infoFor(squad, leagueSlug, competition);
  if (!info) return null;
  const r = ensureList(squad, info, dctx.date);
  const ids = registeredSet(r.squad, competition, info.rule, info.ctx, info.season) ?? new Set<string>();
  return {
    reg: { ids, rule: info.rule, country: info.ctx.country },
    squad: r.squad,
    changed: r.changed,
    notices: squad.id === dctx.humanClubId ? r.notices : [],
  };
}

/** Registration of the human club for its official match on the save's current date (null = no match today). */
export async function humanMatchRegistrationToday(
  service: SaveService,
  saveId: string,
  meta: SaveMeta,
  squad: Squad,
): Promise<MatchRegistration | null> {
  const date = meta.currentDate ?? "";
  if (!date) return null;
  const fixture = (await service.getFixturesForDate(saveId, date))
    .find((f) => !f.played && (f.home === squad.id || f.away === squad.id));
  if (!fixture) return null;
  const index = await service.getSquadIndex(saveId);
  const league = index.byId(squad.id)?.leagueSlug ?? meta.leagueSlug;
  const dctx = await registrationDayCtx(service, saveId, meta, index, date);
  return (await matchRegistration(dctx, squad, league, fixture.competition))?.reg ?? null;
}

/** The human club's morning step over all its competitions. */
export async function humanRegistrationDay(
  dctx: RegistrationDayCtx,
  squad: Squad,
  leagueSlug: string,
): Promise<{ squad: Squad; changed: boolean; notices: RegistrationNotice[] }> {
  let cur = squad;
  let changed = false;
  const notices: RegistrationNotice[] = [];
  for (const info of await dctx.infosFor(squad, leagueSlug)) {
    const r = humanDay(cur, info, dctx.date);
    if (r.changed) {
      cur = r.squad;
      changed = true;
    }
    notices.push(...r.notices);
  }
  return { squad: cur, changed, notices };
}

/** The AI refresh after the market: returns only the squads whose lists changed. */
export async function refreshAiRegistrations(
  dctx: RegistrationDayCtx,
  squads: { squad: Squad; leagueSlug: string }[],
): Promise<Squad[]> {
  const out: Squad[] = [];
  for (const { squad, leagueSlug } of squads) {
    if (squad.id === dctx.humanClubId) continue;
    let cur = squad;
    let changed = false;
    for (const info of await dctx.infosFor(squad, leagueSlug)) {
      const r = aiRefresh(cur, info, dctx.date);
      if (r.changed) {
        cur = r.squad;
        changed = true;
      }
    }
    if (changed) out.push(cur);
  }
  return out;
}
